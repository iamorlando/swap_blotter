// Calibration worker: loads rateslib via micropip, loads public python modules,
// calibrates curves using the latest market data, returns Discount/Zero/Forward curves.
export {};

const ctx: any = self as any;

let pyodide: any = null;
let initialized = false;

async function init(baseUrl: string, datafeedUrl: string, calibUrl: string) {
  try {
    ctx.importScripts(`${baseUrl}pyodide.js`);
    pyodide = await ctx.loadPyodide({ indexURL: baseUrl });
    await pyodide.loadPackage(["numpy", "pandas", "micropip"]);
    // install rateslib (pure-python)
    await pyodide.runPythonAsync(
      "import micropip; await micropip.install('rateslib')"
    );
    // Load python modules from public
    const [dfRes, ccRes, swapRes] = await Promise.all([
      fetch(datafeedUrl, { cache: "no-store" }),
      fetch(calibUrl, { cache: "no-store" }),
      fetch("/py/swap_approximation.py", { cache: "no-store" }),
    ]);
    if (!dfRes.ok || !ccRes.ok || !swapRes.ok) throw new Error("Failed to fetch python modules");
    const [dfCode, ccCode, swapCode] = await Promise.all([dfRes.text(), ccRes.text(), swapRes.text()]);

    const valStr = process.env.NEXT_PUBLIC_VALUATION_DATE;
    const valLine = valStr
      ? `m_curv.VAL_DATE_STR = r'${valStr.replace(/'/g, "\\'")}'\n`
      : "";

    // Create a package 'py' and register modules so relative import works
    const bootstrap = `\n`
      + `import types, sys\n`
      + `pkg = types.ModuleType('py'); pkg.__path__ = []; sys.modules['py'] = pkg\n`
      + `m_data = types.ModuleType('py.datafeed');\n`
      + `exec(compile(r'''${escapeForPyExec(dfCode)}''', 'py/datafeed.py', 'exec'), m_data.__dict__)\n`
      + `sys.modules['py.datafeed'] = m_data\n`
      + `m_curv = types.ModuleType('py.curve_calibration'); m_curv.__package__='py'\n`
      + valLine
      + `exec(compile(r'''${escapeForPyExec(ccCode)}''', 'py/curve_calibration.py', 'exec'), m_curv.__dict__)\n`
      + `sys.modules['py.curve_calibration'] = m_curv\n`
      + `m_swap = types.ModuleType('py.swap_approximation'); m_swap.__package__='py'\n`
      + `exec(compile(r'''${escapeForPyExec(swapCode)}''', 'py/swap_approximation.py', 'exec'), m_swap.__dict__)\n`
      + `sys.modules['py.swap_approximation'] = m_swap\n`
      + `from py.curve_calibration import calibrate_curve, get_discount_factor_curve, get_zero_rate_curve, get_forward_rate_curve\n`
      + `from py.swap_approximation import get_data_and_return_it\n`;

    pyodide.runPython(bootstrap);
    initialized = true;
    ctx.postMessage({ type: "ready" });
  } catch (e) {
    ctx.postMessage({ type: "error", error: String(e) });
  }
}

function escapeForPyExec(code: string): string { return code.replace(/\\/g, "\\\\").replace(/\u2028|\u2029/g, " ").replace(/`/g, "\`").replace(/\r?\n/g, "\n").replace(/"""/g, "\"\"\""); }

ctx.onmessage = async (ev: MessageEvent) => {
  const msg = ev.data || {};
  if (msg.type === "init") {
    const base: string = msg.baseUrl || "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/";
    const datafeedUrl: string = msg.datafeedUrl || "/py/datafeed.py";
    const calibUrl: string = msg.calibrationUrl || "/py/curve_calibration.py";
    await init(base, datafeedUrl, calibUrl);
  } else if (msg.type === "recalibrate") {
    if (!initialized) return;
    const market: Array<{ Term: string; Rate: number }> = msg.market;
    try {
      const jsonStr = JSON.stringify(market);
      // Build DataFrame in Python
      pyodide.runPython(`import pandas as pd\nimport json\ndata = pd.DataFrame(json.loads(r'''${jsonStr}'''))`);
      pyodide.runPython("get_data_and_return_it(data)");
      // Calibrate
      pyodide.runPython("calibrate_curve(data)");
      // Extract curves as JSON strings
      const discount = pyodide.runPython(
        "import json\njson.dumps(get_discount_factor_curve().reset_index().to_dict(orient='records'))"
      );
      const zero = pyodide.runPython(
        "import json\njson.dumps(get_zero_rate_curve().reset_index().to_dict(orient='records'))"
      );
      const forward = pyodide.runPython(
        "import json\njson.dumps(get_forward_rate_curve().reset_index().to_dict(orient='records'))"
      );
      ctx.postMessage({ type: "curves", discount: JSON.parse(discount), zero: JSON.parse(zero), forward: JSON.parse(forward) });
    } catch (e) {
      ctx.postMessage({ type: "error", error: String(e) });
    }
  }
};
