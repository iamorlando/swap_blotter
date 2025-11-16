// Swap approximation worker: loads the python approximation module and logs
// the per-tenor changes returned by get_md_changes for each market tick.
export {};

const ctx: any = self as any;

let pyodide: any = null;
let mdHelper: any = null;
let initialized = false;

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
      + `from py.swap_approximation import get_md_changes\n`
      + `def __md_from_market(rows):\n`
      + `    df = pd.DataFrame(rows)\n`
      + `    if 'Rate' in df.columns:\n`
      + `        df['Rate'] = df['Rate'].astype(float)\n`
      + `    return get_md_changes(df).reset_index().to_dict(orient='records')\n`;

    pyodide.runPython(bootstrap);
    mdHelper = pyodide.globals.get("__md_from_market");
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
  }
};
