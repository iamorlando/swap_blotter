// Swap approximation worker: runs swap_approximation.py in Pyodide and
// consumes curve data to update swap quotes.
export {};

const ctx: any = self as any;

let pyodide: any = null;
let initialized = false;

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
    ctx.postMessage({ type: "ready" });
  } catch (e) {
    ctx.postMessage({ type: "error", error: String(e) });
  }
}

function seedSwapsRisk(swaps: any[], risk: any[]) {
  const swapsJson = JSON.stringify(swaps || []);
  const riskJson = JSON.stringify(risk || []);
  pyodide.runPython(
    "import pandas as pd, json\n"
    + `swaps_df = pd.DataFrame(json.loads(r'''${swapsJson}'''))\n`
    + `risk_df = pd.DataFrame(json.loads(r'''${riskJson}'''))\n`
  );
}

function applyCurve(curve: any[]) {
  const curveJson = JSON.stringify(curve || []);
  const script = [
    "import pandas as pd, json",
    "g = globals()",
    "if 'swaps_df' not in g or 'risk_df' not in g or len(g['swaps_df']) == 0:",
    "    json.dumps([])",
    "else:",
    `    curve_df = pd.DataFrame(json.loads(r'''${curveJson}'''))`,
    "    swaps_df[:] = aproximate_swap_quotes(swaps_df, risk_df, curve_df)",
    "    json.dumps(swaps_df.to_dict(orient='records'))",
  ].join("\n");
  const result = pyodide.runPython(script);
  return result ? JSON.parse(result) : [];
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
