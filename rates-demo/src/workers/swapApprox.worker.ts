// Swap approximation worker: runs swap_approximation.py in Pyodide and
// consumes curve data to update swap quotes.
export {};

const ctx: any = self as any;

let pyodide: any = null;
let initialized = false;

function log(message: string) {
  ctx.postMessage({ type: "log", source: "approx", message });
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
    if (!dfRes.ok || !approxRes.ok) throw new Error("Failed to fetch python modules");
    const [dfCode, approxCode] = await Promise.all([dfRes.text(), approxRes.text()]);

    const bootstrap = `\n`
      + `import types, sys\n`
      + `pkg = types.ModuleType('py'); pkg.__path__ = []; sys.modules['py'] = pkg\n`
      + `m_data = types.ModuleType('py.datafeed');\n`
      + `exec(compile(${JSON.stringify(dfCode)}, 'py/datafeed.py', 'exec'), m_data.__dict__)\n`
      + `sys.modules['py.datafeed'] = m_data\n`
      + `m_approx = types.ModuleType('py.swap_approximation'); m_approx.__package__='py'\n`
      + `exec(compile(${JSON.stringify(approxCode)}, 'py/swap_approximation.py', 'exec'), m_approx.__dict__)\n`
      + `sys.modules['py.swap_approximation'] = m_approx\n`
      + `from py.swap_approximation import aproximate_swap_quotes\n`;

    pyodide.runPython(bootstrap);
    initialized = true;
    log("initialized");
    ctx.postMessage({ type: "ready" });
  } catch (e) {
    ctx.postMessage({ type: "error", error: String(e) });
  }
}

function seedSwapsRisk(swaps: any[], risk: any[]) {
  const swapsJson = JSON.stringify(swaps || []);
  const riskJson = JSON.stringify(risk || []);
  const bucketCols = [
    "1W","2W","3W","1M","2M","3M","4M","5M","6M","7M","8M","9M",
    "10M","11M","12M","18M","2Y","3Y","4Y","5Y","6Y","7Y","8Y",
    "9Y","10Y","12Y","15Y","20Y","25Y","30Y","40Y",
  ];
  const script = [
    "import pandas as pd, json",
    `swaps_df = pd.DataFrame(json.loads(r'''${swapsJson}'''))`,
    `risk_df = pd.DataFrame(json.loads(r'''${riskJson}'''))`,
    "bucket_cols = " + JSON.stringify(bucketCols),
    "if len(risk_df) > 0:",
    "    for col in bucket_cols:",
    "        src = f'c_{col}'",
    "        if src in risk_df.columns:",
    "            risk_df[col] = risk_df[src]",
  ].join("\n");
  pyodide.runPython(script);
  log(`seeded swaps=${swaps.length} risk=${risk.length}`);
}

function applyCurve(curve: any[]) {
  if (!curve || !curve.length) {
    log("curve skipped (empty)");
    return [];
  }
  const metaStr = pyodide.runPython(
    "import json\n"
    + "g = globals()\n"
    + "has_swaps = 'swaps_df' in g\n"
    + "has_risk = 'risk_df' in g\n"
    + "len_swaps = len(g['swaps_df']) if has_swaps else 0\n"
    + "len_risk = len(g['risk_df']) if has_risk else 0\n"
    + "json.dumps({'has_swaps': has_swaps, 'has_risk': has_risk, 'len_swaps': len_swaps, 'len_risk': len_risk})\n"
  );
  const meta = JSON.parse(metaStr);
  if (!meta.has_swaps || !meta.has_risk || !meta.len_swaps || !meta.len_risk) {
    log(`missing data (has_swaps=${meta.has_swaps} len_swaps=${meta.len_swaps} has_risk=${meta.has_risk} len_risk=${meta.len_risk})`);
    return [];
  }
  const curveJson = JSON.stringify(curve || []);
  const prefix = [
    "g = globals()",
    "if 'swaps_df' not in g or 'risk_df' not in g or len(g['swaps_df']) == 0:",
    "    json.dumps([])",
    "else:",
  ];
  const script = [
    "import pandas as pd, json",
    ...prefix,
    `    curve_df = pd.DataFrame(json.loads(r'''${curveJson}'''))`,
    "    swaps_df[:] = aproximate_swap_quotes(swaps_df, risk_df, curve_df)",
    "    json.dumps(swaps_df.to_dict(orient='records'))",
  ].join("\n");
  const result = pyodide.runPython(script);
  if (curve.length) log(`curve applied rows=${curve.length}`);
  if (!result) {
    log("no approximation result (missing swaps/risk?)");
    return [];
  }
  const swaps = JSON.parse(result);
  if (swaps && swaps.length) {
    const sample = swaps[0];
    log(`sample ID=${sample?.ID ?? sample?.id} NPV=${sample?.NPV} ParRate=${sample?.ParRate}`);
  } else {
    log("approximation skipped (no swaps after curve)");
  }
  return swaps;
}

ctx.onmessage = async (ev: MessageEvent) => {
  const msg = ev.data || {};
  if (msg.type === "init") {
    const base: string = msg.baseUrl || "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/";
    const datafeedUrl: string = msg.datafeedUrl || "/py/datafeed.py";
    const approxUrl: string = msg.approxUrl || "/py/swap_approximation.py";
    await init(base, datafeedUrl, approxUrl);
  } else if (msg.type === "setSwapsRisk") {
    if (!initialized) return;
    try {
      seedSwapsRisk(msg.swaps || [], msg.risk || []);
    } catch (e) {
      ctx.postMessage({ type: "error", error: String(e) });
    }
  } else if (msg.type === "curve") {
    if (!initialized) return;
    try {
      const swaps = applyCurve(msg.curve || []);
      if (swaps && swaps.length) {
        ctx.postMessage({ type: "approx", swaps });
      }
    } catch (e) {
      ctx.postMessage({ type: "error", error: String(e) });
    }
  }
};
