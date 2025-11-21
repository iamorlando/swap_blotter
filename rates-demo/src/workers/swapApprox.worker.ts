/// <reference lib="webworker" />

// Swap approximation worker: loads the python approximation module and logs
// the per-tenor changes returned by get_md_changes for each market tick.
export {};

type MarketRow = { Term: string; Rate: number };
type SwapRow = { ID: string; NPV: number; FixedRate: number; ParRate: number };
type RiskRow = Record<string, number | string | null>;
type MdChangeRow = { Term: string; Change: number };
type PyProxy = { destroy?: () => void; toJs?: (opts?: { create_proxies?: boolean }) => unknown };
type PyodideModule = {
  runPython: (code: string) => unknown;
  runPythonAsync: (code: string) => Promise<unknown>;
  toPy: (val: unknown) => PyProxy;
  loadPackage: (pkgs: string[]) => Promise<unknown>;
  globals: { get: (name: string) => unknown; set: (name: string, val: unknown) => void };
};

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

let pyodide: PyodideModule | null = null;
let mdHelper: ((rows: PyProxy) => PyProxy) | null = null;
let approxHelper: ((swaps: PyProxy, risk: PyProxy, md: PyProxy) => PyProxy) | null = null;
let approxCounterpartyHelper: ((npv: number, risk: PyProxy, md: PyProxy) => any) | null = null;
let setBaseCurveFn: ((rows: PyProxy) => void) | null = null;
let initialized = false;
let latestCurveRows: MarketRow[] | null = null;
let latestSwaps: SwapRow[] | null = null;
let latestRisk: RiskRow[] | null = null;
let latestMdChanges: MdChangeRow[] | null = null;
let baseCurveRows: MarketRow[] | null = null;
const counterpartyMap = new Map<string, { npv: number; risk: RiskRow | null }>();

async function init(baseUrl: string, datafeedUrl: string, approxUrl: string) {
  try {
    ctx.importScripts(`${baseUrl}pyodide.js`);
    const loaded = (await (ctx as any).loadPyodide({ indexURL: baseUrl })) as PyodideModule;
    pyodide = loaded;
    await loaded.loadPackage(["numpy", "pandas"]);
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
      + `from py.swap_approximation import get_md_changes, aproximate_swap_quotes, aproximate_counterparty_npv\n`
      + `base_curve_df = None\n`
      + `def __set_base_curve(rows):\n`
      + `    global base_curve_df\n`
      + `    df = pd.DataFrame(rows)\n`
      + `    rename_map = {}\n`
      + `    if 'term' in df.columns and 'Term' not in df.columns:\n`
      + `        rename_map['term'] = 'Term'\n`
      + `    if 'rate' in df.columns and 'Rate' not in df.columns:\n`
      + `        rename_map['rate'] = 'Rate'\n`
      + `    if rename_map:\n`
      + `        df = df.rename(columns=rename_map)\n`
      + `    if df.empty or 'Term' not in df.columns or 'Rate' not in df.columns:\n`
      + `        base_curve_df = None\n`
      + `        return\n`
      + `    df['Rate'] = df['Rate'].astype(float) / 100.0  # seed base as decimals to match live feed\n`
      + `    base_curve_df = df[['Term','Rate']].copy()\n`
      + `def __md_from_market(rows):\n`
      + `    if base_curve_df is None:\n`
      + `        return []\n`
      + `    df = pd.DataFrame(rows)\n`
      + `    rename_map = {}\n`
      + `    if 'term' in df.columns and 'Term' not in df.columns:\n`
      + `        rename_map['term'] = 'Term'\n`
      + `    if 'rate' in df.columns and 'Rate' not in df.columns:\n`
      + `        rename_map['rate'] = 'Rate'\n`
      + `    if rename_map:\n`
      + `        df = df.rename(columns=rename_map)\n`
      + `    if 'Rate' in df.columns:\n`
      + `        df['Rate'] = df['Rate'].astype(float)  # live feed already decimals\n`
      + `    if 'Term' not in df.columns or 'Rate' not in df.columns:\n`
      + `        return []\n`
      + `    return get_md_changes(df, base_curve_df).reset_index().to_dict(orient='records')\n`
      + `def __approx_swaps(swaps_rows, risk_rows, md_changes_rows):\n`
      + `    swaps_df = pd.DataFrame(swaps_rows)\n`
      + `    risk_df = pd.DataFrame(risk_rows)\n`
      + `    md_df = pd.DataFrame(md_changes_rows)\n`
      + `    if 'Term' in md_df.columns:\n`
      + `        md_df = md_df.set_index('Term')\n`
      + `    return aproximate_swap_quotes(swaps_df, risk_df, md_df).to_dict(orient='records')\n`
      + `def __approx_counterparty(npv_value, risk_rows, md_changes_rows):\n`
      + `    risk_df = pd.DataFrame(risk_rows)\n`
      + `    md_df = pd.DataFrame(md_changes_rows)\n`
      + `    if 'Term' in md_df.columns:\n`
      + `        md_df = md_df.set_index('Term')\n`
      + `    return aproximate_counterparty_npv(float(npv_value), risk_df, md_df)\n`;

    loaded.runPython(bootstrap);
    mdHelper = loaded.globals.get("__md_from_market") as typeof mdHelper;
    approxHelper = loaded.globals.get("__approx_swaps") as typeof approxHelper;
    approxCounterpartyHelper = loaded.globals.get("__approx_counterparty") as typeof approxCounterpartyHelper;
    setBaseCurveFn = loaded.globals.get("__set_base_curve") as typeof setBaseCurveFn;

    // Fetch base curve once from API to seed original market data.
    try {
      const seedRes = await fetch("/api/md/latest", { cache: "no-store" });
      if (!seedRes.ok) {
        const txt = await seedRes.text().catch(() => "");
        throw new Error(`md/latest seed failed: ${seedRes.status} ${txt}`);
      }
      const seedJson = await seedRes.json();
      const rows = seedJson?.rows || seedJson?.message?.rows || [];
      if (rows && rows.length) {
        baseCurveRows = rows;
        const pyRows = loaded.toPy(rows);
        setBaseCurveFn?.(pyRows);
        if (typeof pyRows.destroy === "function") pyRows.destroy();
      } else {
        throw new Error("md/latest seed returned no rows");
      }
    } catch (err) {
      // non-fatal; we'll seed on first curve message
      ctx.postMessage({ type: "error", error: `approx seed failed: ${String(err)}` });
    }

    initialized = true;
    ctx.postMessage({ type: "ready" });
  } catch (e) {
    ctx.postMessage({ type: "error", error: String(e) });
  }
}

function handleCurve(rows: MarketRow[]) {
  if (!initialized || !mdHelper || !rows || !rows.length) {
    return;
  }
  latestCurveRows = rows;
  const py = pyodide;
  let pyRows: PyProxy | null = null;
  let resultProxy: PyProxy | null = null;
  try {
    // Ensure base curve is seeded at least once
    if (!baseCurveRows) {
      baseCurveRows = rows;
      const basePy = (py as PyodideModule).toPy(rows);
      setBaseCurveFn?.(basePy);
      if (typeof basePy.destroy === "function") basePy.destroy();
    }
    pyRows = (py as PyodideModule).toPy(rows);
    resultProxy = mdHelper(pyRows);
    const arr = resultProxy?.toJs?.({ create_proxies: false }) as MdChangeRow[] | undefined;
    const plain = arr ? (JSON.parse(JSON.stringify(arr)) as MdChangeRow[]) : [];
    latestMdChanges = plain.length ? plain : null;
    ctx.postMessage({ type: "md", rows: latestMdChanges ?? [] });
  } catch (e) {
    ctx.postMessage({ type: "error", error: String(e) });
  } finally {
    if (pyRows && typeof pyRows.destroy === "function") pyRows.destroy();
    if (resultProxy && typeof resultProxy.destroy === "function") resultProxy.destroy();
  }
  tryApproximate();
}

function handleSwaps(swaps: SwapRow[], risk: RiskRow[]) {
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

function handleCounterparty(payload: { id: string; npv: number; risk?: RiskRow | null; remove?: boolean }) {
  if (!payload?.id) return;
  if (payload.remove) {
    counterpartyMap.delete(payload.id);
    return;
  }
  counterpartyMap.set(payload.id, {
    npv: Number(payload.npv ?? 0),
    risk: payload.risk || null,
  });
  tryApproximate();
}

function tryApproximate() {
  if (!initialized) return;
  if (!latestCurveRows || !latestCurveRows.length) return;
  if (!latestMdChanges || !latestMdChanges.length) return;
  if (approxHelper && latestSwaps && latestSwaps.length && latestRisk && latestRisk.length) {
    const py = pyodide as PyodideModule;
    let swapsPy: PyProxy | null = null;
    let riskPy: PyProxy | null = null;
    let mdPy: PyProxy | null = null;
    let resultProxy: PyProxy | null = null;
    try {
      swapsPy = py.toPy(latestSwaps);
      riskPy = py.toPy(latestRisk);
      mdPy = py.toPy(latestMdChanges);
      resultProxy = approxHelper(swapsPy, riskPy, mdPy);
      const arr = resultProxy?.toJs?.({ create_proxies: false }) as Record<string, unknown>[] | undefined;
      const plain = arr ? (JSON.parse(JSON.stringify(arr)) as Record<string, unknown>[]) : [];
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
  approximateCounterparties();
}

function approximateCounterparties() {
  if (!approxCounterpartyHelper || !counterpartyMap.size) return;
  if (!latestMdChanges || !latestMdChanges.length) return;
  const py = pyodide as PyodideModule;
  let mdPy: PyProxy | null = null;
  try {
    mdPy = py.toPy(latestMdChanges);
    const results: Array<{ id: string; npv: number }> = [];
    counterpartyMap.forEach((value, key) => {
      let riskPy: PyProxy | null = null;
      try {
        const riskRows = value.risk ? [{ ...value.risk }] : [];
        riskPy = py.toPy(riskRows);
        const helper = approxCounterpartyHelper;
        if (!helper) return;
        const res = helper(value.npv ?? 0, riskPy, mdPy);
        const npv = typeof res === "number" ? res : Number((res as any)?.toJs?.({ create_proxies: false }));
        results.push({ id: key, npv });
      } catch (e) {
        ctx.postMessage({ type: "error", error: String(e) });
      } finally {
        if (riskPy && typeof riskPy.destroy === "function") riskPy.destroy();
      }
    });
    if (results.length) {
      ctx.postMessage({ type: "counterpartyApprox", rows: results });
    }
  } catch (e) {
    ctx.postMessage({ type: "error", error: String(e) });
  } finally {
    if (mdPy && typeof mdPy.destroy === "function") mdPy.destroy();
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
    handleCurve(msg.market as MarketRow[]);
  } else if (msg.type === "swaps") {
    handleSwaps(msg.swaps as SwapRow[], msg.risk as RiskRow[]);
  } else if (msg.type === "counterparty") {
    handleCounterparty({
      id: String(msg.id ?? ""),
      npv: Number(msg.npv ?? 0),
      risk: msg.risk as RiskRow | null,
      remove: !!msg.remove,
    });
  }
};
