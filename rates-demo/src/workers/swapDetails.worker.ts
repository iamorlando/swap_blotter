// Swap details worker: keeps a persistent Pyodide instance to price/risk a single swap.
export {};

const ctx: any = self as any;

let pyodide: any = null;
let initialized = false;

function escapeForPyExec(code: string): string {
  return code
    .replace(/\\/g, "\\\\")
    .replace(/\u2028|\u2029/g, " ")
    .replace(/`/g, "\\`")
    .replace(/\r?\n/g, "\n")
    .replace(/"""/g, '\\"\\"\\"');
}

async function init(baseUrl: string, detailsUrl: string) {
  try {
    ctx.importScripts(`${baseUrl}pyodide.js`);
    pyodide = await ctx.loadPyodide({ indexURL: baseUrl });
    await pyodide.loadPackage(["numpy", "pandas", "micropip"]);
    await pyodide.runPythonAsync("import micropip; await micropip.install('rateslib')");

    const swapDetailsCodeRes = await fetch(detailsUrl, { cache: "no-store" });
    if (!swapDetailsCodeRes.ok) throw new Error("failed to fetch swap_details.py");
    const swapDetailsCode = await swapDetailsCodeRes.text();

    const bootstrap = `
import types, sys
pkg = types.ModuleType('py'); pkg.__path__ = []; sys.modules['py'] = pkg
m_details = types.ModuleType('py.swap_details'); m_details.__package__='py'
exec(compile(${JSON.stringify(swapDetailsCode)}, 'py/swap_details.py', 'exec'), m_details.__dict__)
sys.modules['py.swap_details'] = m_details
from py.swap_details import set_swap_context, get_swap_risk
`;

    pyodide.runPython(bootstrap);
    initialized = true;
    ctx.postMessage({ type: "ready" });
  } catch (e) {
    ctx.postMessage({ type: "error", error: String(e) });
  }
}

ctx.onmessage = async (ev: MessageEvent) => {
  const msg = ev.data || {};
  if (msg.type === "init") {
    const base: string = msg.baseUrl || "https://cdn.jsdelivr.net/pyodide/v0.29.0/full/";
    const detailsUrl: string = msg.detailsUrl || "/py/swap_details.py";
    await init(base, detailsUrl);
    return;
  }
  if (msg.type === "context") {
    if (!initialized) return;
    try {
      const swapJson = JSON.stringify(msg.swap || {});
      const mdJson = JSON.stringify(msg.market || []);
      const curveJson: string = msg.curveJson || "";
      // Build swap context and compute risk in Python
      pyodide.globals.set("swap_curve_json", curveJson);
      pyodide.runPython(
        `
import json, pandas as pd
swap_row_obj = json.loads(r'''${escapeForPyExec(swapJson)}''')
md_obj = json.loads(r'''${escapeForPyExec(mdJson)}''')
swap_row = pd.Series(swap_row_obj)
if 'StartDate' in swap_row and swap_row['StartDate'] is not None:
    swap_row['StartDate'] = pd.to_datetime(swap_row['StartDate'])
if 'TerminationDate' in swap_row and swap_row['TerminationDate'] is not None:
    swap_row['TerminationDate'] = pd.to_datetime(swap_row['TerminationDate'])
cal_md = pd.DataFrame(md_obj)
set_swap_context(swap_row, swap_curve_json, cal_md)
del swap_curve_json
`
      );
      const riskJson = pyodide.runPython("import json\njson.dumps(get_swap_risk().to_dict())");
      console.log("swap risk computed:", riskJson);
      ctx.postMessage({ type: "risk", swapId: msg.swapId, risk: JSON.parse(riskJson) });
    } catch (e) {
      ctx.postMessage({ type: "error", swapId: msg.swapId, error: String(e) });
    }
  }
};
