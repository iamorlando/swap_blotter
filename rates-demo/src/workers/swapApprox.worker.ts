// Swap approximation worker: loads the python approximation module and logs
// the per-tenor changes returned by get_md_changes for each market tick.
export {};

const ctx: any = self as any;

let pyodide: any = null;
let mdHelper: any = null;
let approxHelper: any = null;
let setBaseCurveFn: any = null;
let initialized = false;
let latestCurveRows: Array<{ Term: string; Rate: number }> | null = null;
let latestSwaps: Array<any> | null = null;
let latestRisk: Array<any> | null = null;
let latestMdChanges: Array<any> | null = null;
let baseCurveRows: Array<{ Term: string; Rate: number }> | null = null;

function log(message: string) {
  ctx.postMessage({ type: "log", source: "swapApprox", message });
}

async function init(baseUrl: string, datafeedUrl: string, approxUrl: string) {
  try {
    ctx.importScripts(`${baseUrl}pyodide.js`);
    pyodide = await ctx.loadPyodide({ indexURL: baseUrl });
    await pyodide.loadPackage(["numpy", "pandas"]);
    const [dfRes, approxRes] = await Promise.all([
      fetch(datafeedUrl, { cache: "no-store" }),
      fetch(approxUrl, { cache: "no-store" }),
    ]);
    if (!dfRes.ok || !approxRes.ok) {
      throw new Error("Failed to fetch python modules");
    }
    const [dfCode, approxCode] = await Promise.all([dfRes.text(), approxRes.text()]);

    const bootstrap = `\n`
      + `import types, sys, pandas as pd\n`
      + `pkg = types.ModuleType('py'); pkg.__path__ = []; sys.modules['py'] = pkg\n`
      + `m_data = types.ModuleType('py.datafeed');\n`
      + `exec(compile(${JSON.stringify(dfCode)}, 'py/datafeed.py', 'exec'), m_data.__dict__)\n`
      + `sys.modules['py.datafeed'] = m_data\n`
      + `m_swap = types.ModuleType('py.swap_approximation'); m_swap.__package__='py'\n`
      + `exec(compile(${JSON.stringify(approxCode)}, 'py/swap_approximation.py', 'exec'), m_swap.__dict__)\n`
      + `sys.modules['py.swap_approximation'] = m_swap\n`
      + `from py.swap_approximation import get_md_changes, aproximate_swap_quotes\n`
      + `base_curve_df = None\n`
      + `def __set_base_curve(rows):\n`
      + `    global base_curve_df\n`
      + `    df = pd.DataFrame(rows)\n`
      + `    if df.empty or 'Term' not in df.columns or 'Rate' not in df.columns:\n`
      + `        base_curve_df = None\n`
      + `        return\n`
      + `    df['Rate'] = df['Rate'].astype(float) / 100.0  # seed base as decimals to match live feed\n`
      + `    base_curve_df = df[['Term','Rate']].copy()\n`
      + `def __md_from_market(rows):\n`
      + `    if base_curve_df is None:\n`
      + `        return []\n`
      + `    df = pd.DataFrame(rows)\n`
      + `    if 'Rate' in df.columns:\n`
      + `        df['Rate'] = df['Rate'].astype(float)  # live feed already decimals\n`
      + `    return get_md_changes(df, base_curve_df).reset_index().to_dict(orient='records')\n`
      + `def __approx_swaps(swaps_rows, risk_rows, md_changes_rows):\n`
      + `    swaps_df = pd.DataFrame(swaps_rows)\n`
      + `    risk_df = pd.DataFrame(risk_rows)\n`
      + `    md_df = pd.DataFrame(md_changes_rows)\n`
      + `    if 'Term' in md_df.columns:\n`
      + `        md_df = md_df.set_index('Term')\n`
      + `    return aproximate_swap_quotes(swaps_df, risk_df, md_df).to_dict(orient='records')\n`;

    pyodide.runPython(bootstrap);
    mdHelper = pyodide.globals.get("__md_from_market");
    approxHelper = pyodide.globals.get("__approx_swaps");
    setBaseCurveFn = pyodide.globals.get("__set_base_curve");

    // Fetch base curve once from API to seed original market data.
    try {
      const seedRes = await fetch("/api/md/latest", { cache: "no-store" });
      if (seedRes.ok) {
        const seedJson = await seedRes.json();
        const rows = seedJson?.rows || seedJson?.message?.rows || [];
        if (rows && rows.length) {
          baseCurveRows = rows;
          const pyRows = pyodide.toPy(rows);
          setBaseCurveFn(pyRows);
          if (typeof pyRows.destroy === "function") pyRows.destroy();
        }
      }
    } catch (err) {
      // non-fatal; we'll seed on first curve message
    }

    initialized = true;
    ctx.postMessage({ type: "ready" });
  } catch (e) {
    ctx.postMessage({ type: "error", error: String(e) });
  }
}

function handleCurve(rows: Array<{ Term: string; Rate: number }>) {
  if (!initialized || !mdHelper || !rows || !rows.length) {
    return;
  }
  latestCurveRows = rows;
  let pyRows: any = null;
  let resultProxy: any = null;
  try {
    // Ensure base curve is seeded at least once
    if (!baseCurveRows) {
      baseCurveRows = rows;
      const basePy = pyodide.toPy(rows);
      setBaseCurveFn(basePy);
      if (typeof basePy.destroy === "function") basePy.destroy();
    }
    pyRows = pyodide.toPy(rows);
    resultProxy = mdHelper(pyRows);
    const arr = resultProxy.toJs({ create_proxies: false });
    const plain = JSON.parse(JSON.stringify(arr));
    latestMdChanges = plain;
    ctx.postMessage({ type: "md", rows: plain });
  } catch (e) {
    ctx.postMessage({ type: "error", error: String(e) });
  } finally {
    if (pyRows && typeof pyRows.destroy === "function") pyRows.destroy();
    if (resultProxy && typeof resultProxy.destroy === "function") resultProxy.destroy();
  }
  tryApproximate();
}

function handleSwaps(swaps: any[], risk: any[]) {
  // no need to get entire swap, just id and NPV
  latestSwaps = swaps && swaps.length ? swaps.map(s=>({
    ID: s.ID,
    NPV: s.NPV,
    FixedRate: s.FixedRate,
    ParRate: s.ParRate,
  })) : null;

  latestRisk = risk && risk.length ? risk : null;
  tryApproximate();
}

function tryApproximate() {
  if (!initialized || !approxHelper) return;
  if (!latestCurveRows || !latestCurveRows.length) return;
  if (!latestSwaps || !latestSwaps.length) return;
  if (!latestRisk || !latestRisk.length) return;
  if (!latestMdChanges || !latestMdChanges.length) return;
  let swapsPy: any = null;
  let riskPy: any = null;
  let mdPy: any = null;
  let resultProxy: any = null;
  try {
    swapsPy = pyodide.toPy(latestSwaps);
    riskPy = pyodide.toPy(latestRisk);
    mdPy = pyodide.toPy(latestMdChanges);
    resultProxy = approxHelper(swapsPy, riskPy, mdPy);
    const arr = resultProxy.toJs({ create_proxies: false });
    const plain = JSON.parse(JSON.stringify(arr));
    ctx.postMessage({ type: "approx", rows: plain });
  } catch (e) {
    ctx.postMessage({ type: "error", error: String(e) });
  } finally {
    if (swapsPy && typeof swapsPy.destroy === "function") swapsPy.destroy();
    if (riskPy && typeof riskPy.destroy === "function") riskPy.destroy();
    if (mdPy && typeof mdPy.destroy === "function") mdPy.destroy();
    if (resultProxy && typeof resultProxy.destroy === "function") resultProxy.destroy();
  }
}

ctx.onmessage = async (ev: MessageEvent) => {
  const msg = ev.data || {};
  if (msg.type === "init") {
    const base: string = msg.baseUrl || "https://cdn.jsdelivr.net/pyodide/v0.29.0/full/";
    const datafeedUrl: string = msg.datafeedUrl || "/py/datafeed.py";
    const approxUrl: string = msg.approxUrl || "/py/swap_approximation.py";
    await init(base, datafeedUrl, approxUrl);
  } else if (msg.type === "curve") {
    handleCurve(msg.market as Array<{ Term: string; Rate: number }>);
  } else if (msg.type === "swaps") {
    handleSwaps(msg.swaps as any[], msg.risk as any[]);
  }
};
