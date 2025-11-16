// Swap approximation worker: loads the python approximation module and logs
// the per-tenor changes returned by get_md_changes for each market tick.
export {};

const ctx: any = self as any;

let pyodide: any = null;
let mdHelper: any = null;
let approxHelper: any = null;
let initialized = false;
let latestCurveRows: Array<{ Term: string; Rate: number }> | null = null;
let latestSwaps: Array<any> | null = null;
let latestRisk: Array<any> | null = null;

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
      + `def __md_from_market(rows):\n`
      + `    df = pd.DataFrame(rows)\n`
      + `    if 'Rate' in df.columns:\n`
      + `        df['Rate'] = df['Rate'].astype(float)\n`
      + `    return get_md_changes(df).reset_index().to_dict(orient='records')\n`
      + `def __approx_swaps(swaps_rows, risk_rows, curve_rows):\n`
      + `    swaps_df = pd.DataFrame(swaps_rows)\n`
      + `    risk_df = pd.DataFrame(risk_rows)\n`
      + `    curve_df = pd.DataFrame(curve_rows)\n`
      + `    return aproximate_swap_quotes(swaps_df, risk_df, curve_df).to_dict(orient='records')\n`;

    pyodide.runPython(bootstrap);
    mdHelper = pyodide.globals.get("__md_from_market");
    approxHelper = pyodide.globals.get("__approx_swaps");
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
    pyRows = pyodide.toPy(rows);
    resultProxy = mdHelper(pyRows);
    const arr = resultProxy.toJs({ create_proxies: false });
    const plain = JSON.parse(JSON.stringify(arr));
    ctx.postMessage({ type: "md", rows: plain });
    log(`md rows=${Array.isArray(plain) ? plain.length : 0}`);
  } catch (e) {
    ctx.postMessage({ type: "error", error: String(e) });
  } finally {
    if (pyRows && typeof pyRows.destroy === "function") pyRows.destroy();
    if (resultProxy && typeof resultProxy.destroy === "function") resultProxy.destroy();
  }
  tryApproximate();
}

function handleSwaps(swaps: any[], risk: any[]) {
  latestSwaps = swaps && swaps.length ? swaps : null;
  latestRisk = risk && risk.length ? risk : null;
  tryApproximate();
}

function tryApproximate() {
  if (!initialized || !approxHelper) return;
  if (!latestCurveRows || !latestCurveRows.length) return;
  if (!latestSwaps || !latestSwaps.length) return;
  if (!latestRisk || !latestRisk.length) return;
  let swapsPy: any = null;
  let riskPy: any = null;
  let curvePy: any = null;
  let resultProxy: any = null;
  try {
    swapsPy = pyodide.toPy(latestSwaps);
    riskPy = pyodide.toPy(latestRisk);
    curvePy = pyodide.toPy(latestCurveRows);
    resultProxy = approxHelper(swapsPy, riskPy, curvePy);
    const arr = resultProxy.toJs({ create_proxies: false });
    const plain = JSON.parse(JSON.stringify(arr));
    ctx.postMessage({ type: "approx", rows: plain });
    log(`approx rows=${Array.isArray(plain) ? plain.length : 0}`);
  } catch (e) {
    ctx.postMessage({ type: "error", error: String(e) });
  } finally {
    if (swapsPy && typeof swapsPy.destroy === "function") swapsPy.destroy();
    if (riskPy && typeof riskPy.destroy === "function") riskPy.destroy();
    if (curvePy && typeof curvePy.destroy === "function") curvePy.destroy();
    if (resultProxy && typeof resultProxy.destroy === "function") resultProxy.destroy();
  }
}

ctx.onmessage = async (ev: MessageEvent) => {
  const msg = ev.data || {};
  if (msg.type === "init") {
    const base: string = msg.baseUrl || "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/";
    const datafeedUrl: string = msg.datafeedUrl || "/py/datafeed.py";
    const approxUrl: string = msg.approxUrl || "/py/swap_approximation.py";
    await init(base, datafeedUrl, approxUrl);
  } else if (msg.type === "curve") {
    handleCurve(msg.market as Array<{ Term: string; Rate: number }>);
  } else if (msg.type === "swaps") {
    handleSwaps(msg.swaps as any[], msg.risk as any[]);
  }
};
