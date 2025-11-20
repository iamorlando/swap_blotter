// Swap details worker: keeps a persistent Pyodide instance to price/risk a single swap.
export {};

type MarketRow = { Term: string; Rate: number };

const ctx: any = self as any;

let pyodide: any = null;
let initialized = false;

function runPy(code: string) {
  return pyodide?.runPython(code);
}

function serializeSwapRow(): Record<string, unknown> | null {
  const priceJson = runPy("import json\njson.dumps(get_current_swap_price().to_dict())");
  if (!priceJson) return null;
  const price = JSON.parse(priceJson as string) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (price?.NPV != null) out.NPV = price.NPV;
  if (price?.ParRate != null) out.ParRate = price.ParRate;
  return Object.keys(out).length ? out : null;
}

function computeFixedFlows(rows?: MarketRow[]): any[] {
  if (!pyodide) return [];
  const payload = Array.isArray(rows) ? rows.map((r) => ({ Term: String(r.Term), Rate: Number(r.Rate) })) : null;
  const pyCode = payload && payload.length
    ? `import pandas as pd, json\nmd = pd.DataFrame(json.loads(r'''${escapeForPyExec(JSON.stringify(payload))}'''))\n` +
      `md['Rate'] = md['Rate'].astype(float)\n` +
      `out = get_fixed_flows(md)\n` +
      `out = out.reset_index(drop=True) if hasattr(out, 'reset_index') else out\n` +
      `if hasattr(out, 'columns'):\n` +
      `    for col in out.columns:\n` +
      `        ser = out[col]\n` +
      `        if hasattr(ser, 'dt'):\n` +
      `            out[col] = ser.astype(str)\n` +
      `json.dumps(out.to_dict(orient='records'))`
    : `import pandas as pd, json\nout = get_fixed_flows()\n` +
      `out = out.reset_index(drop=True) if hasattr(out, 'reset_index') else out\n` +
      `if hasattr(out, 'columns'):\n` +
      `    for col in out.columns:\n` +
      `        ser = out[col]\n` +
      `        if hasattr(ser, 'dt'):\n` +
      `            out[col] = ser.astype(str)\n` +
      `json.dumps(out.to_dict(orient='records'))`;
  try {
    if (payload) console.log("[swap details worker] fixed flow payload", payload);
    const result = runPy(pyCode);
    return result ? JSON.parse(result as string) : [];
  } catch (err) {
    console.error("[swap details worker] computeFixedFlows error", err);
    return [];
  }
}

function computeFloatFlows(rows?: MarketRow[]): any[] {
  if (!pyodide) return [];
  const payload = Array.isArray(rows) ? rows.map((r) => ({ Term: String(r.Term), Rate: Number(r.Rate) })) : null;
  const pyCode = payload && payload.length
    ? `import pandas as pd, json\nmd = pd.DataFrame(json.loads(r'''${escapeForPyExec(JSON.stringify(payload))}'''))\n` +
      `md['Rate'] = md['Rate'].astype(float)\n` +
      `out = get_float_flows(md)\n` +
      `out = out.reset_index(drop=True) if hasattr(out, 'reset_index') else out\n` +
      `if hasattr(out, 'columns'):\n` +
      `    for col in out.columns:\n` +
      `        ser = out[col]\n` +
      `        if hasattr(ser, 'dt'):\n` +
      `            out[col] = ser.astype(str)\n` +
      `json.dumps(out.to_dict(orient='records'))`
    : `import pandas as pd, json\nout = get_float_flows()\n` +
      `out = out.reset_index(drop=True) if hasattr(out, 'reset_index') else out\n` +
      `if hasattr(out, 'columns'):\n` +
      `    for col in out.columns:\n` +
      `        ser = out[col]\n` +
      `        if hasattr(ser, 'dt'):\n` +
      `            out[col] = ser.astype(str)\n` +
      `json.dumps(out.to_dict(orient='records'))`;
  try {
    if (payload) console.log("[swap details worker] float flow payload", payload);
    const result = runPy(pyCode);
    return result ? JSON.parse(result as string) : [];
  } catch (err) {
    console.error("[swap details worker] computeFloatFlows error", err);
    return [];
  }
}

function fetchFixingsTable(index: number | null): { columns: string[]; rows: any[] } | null {
  if (!pyodide || index == null || Number.isNaN(index)) return null;
  pyodide.globals.set("swap_fixings_row_index", Number(index));
  const pyCode = `
import json
idx = int(swap_fixings_row_index)
table = get_fixings_table(idx)
columns = list(table.columns) if hasattr(table, 'columns') else []
if hasattr(table, 'columns'):
    for col in table.columns:
        ser = table[col]
        if hasattr(ser, 'dt'):
            table[col] = ser.astype(str)
result = {
    'columns': columns,
    'rows': table.to_dict(orient='records') if hasattr(table, 'to_dict') else []
}
del swap_fixings_row_index
json.dumps(result)
`;
  try {
    const res = runPy(pyCode);
    return res ? JSON.parse(res as string) : null;
  } catch (err) {
    console.error("[swap details worker] fetchFixingsTable error", err);
    return null;
  }
}

function emitRiskAndPrice(swapId: string | null) {
  const riskJson = runPy("import json\njson.dumps(get_swap_risk().to_dict())");
  const priceJson = runPy("import json\njson.dumps(get_current_swap_price().to_dict())");
  const swapRowJson = serializeSwapRow();
  ctx.postMessage({
    type: "risk",
    swapId,
    risk: riskJson ? JSON.parse(riskJson as string) : null,
    price: priceJson ? JSON.parse(priceJson as string) : null,
    swap: swapRowJson,
  });
}

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
from py.swap_details import (
    set_swap_context,
    get_swap_risk,
    get_inclusive_fixings_date_bounds,
    set_fixings,
    hydrate_swap,
    get_swap_fixing_index_name,
    update_curve_in_context,
    get_current_swap_price,
    get_fixed_flows,
    get_float_flows,
    get_fixings_table,
)
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
      pyodide.globals.set("swap_curve_json", curveJson);
      const infoJson = pyodide.runPython(
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
info = {'index': get_swap_fixing_index_name(), 'bounds': [dt.isoformat() for dt in get_inclusive_fixings_date_bounds()]}
del swap_curve_json
json.dumps(info)
`
      ) as string;
      const info = infoJson ? (JSON.parse(infoJson) as { index?: string; bounds?: string[] }) : {};
      let fixings: Array<{ date: string; value: number | null }> = [];
      if (info?.index && Array.isArray(info.bounds) && info.bounds.length === 2) {
        const params = new URLSearchParams({
          index: info.index,
          start: info.bounds[0],
          end: info.bounds[1],
        });
        try {
          const resp = await fetch(`/api/fixings?${params.toString()}`);
          if (resp.ok) {  
            const data = await resp.json();
            fixings = Array.isArray(data.rows) ? data.rows : [];
          } else {
            console.error("[swap details worker] fixings fetch", resp.status);
          }
        } catch (err) {
          console.error("[swap details worker] fixings fetch", err);
        }
      }
      pyodide.globals.set("swap_fixings_payload_json", JSON.stringify(fixings ?? []));
      pyodide.runPython(
        `
import pandas as pd, json
payload = json.loads(swap_fixings_payload_json)
fix_df = pd.DataFrame(payload)
if not fix_df.empty:
    if 'date' in fix_df.columns:
        fix_df['date'] = pd.to_datetime(fix_df['date'])
        fix_df = fix_df.set_index('date').sort_index()
    fix_df = fix_df[['value']] if 'value' in fix_df.columns else fix_df
    set_fixings(fix_df.squeeze())
else:
    set_fixings(pd.Series(dtype=float))
hydrate_swap()
del swap_fixings_payload_json
`
      );
      emitRiskAndPrice(msg.swapId);
      ctx.postMessage({ type: "fixed_flows", swapId: msg.swapId, rows: computeFixedFlows() });
      ctx.postMessage({ type: "float_flows", swapId: msg.swapId, rows: computeFloatFlows() });
    } catch (e) {
      ctx.postMessage({ type: "error", swapId: msg.swapId, error: String(e) });
    }
  } else if (msg.type === "updateCurve") {
    if (!initialized) return;
    try {
      const curveJson: string = msg.curveJson || "";
      const mdJson = JSON.stringify(msg.market || []);
      pyodide.globals.set("swap_curve_update_json", curveJson);
      pyodide.runPython(
        `
import pandas as pd, json
md_obj = json.loads(r'''${escapeForPyExec(mdJson)}''')
cal_md = pd.DataFrame(md_obj)
update_curve_in_context(swap_curve_update_json, cal_md)
hydrate_swap()
del swap_curve_update_json
`
      );
      emitRiskAndPrice(msg.swapId);
      ctx.postMessage({ type: "fixed_flows", swapId: msg.swapId, rows: computeFixedFlows() });
      ctx.postMessage({ type: "float_flows", swapId: msg.swapId, rows: computeFloatFlows() });
    } catch (e) {
      ctx.postMessage({ type: "error", swapId: msg.swapId, error: String(e) });
    }
  } else if (msg.type === "fixedFlows") {
    if (!initialized) return;
    try {
      const rows = Array.isArray(msg.market) ? (msg.market as Array<{ Term: string; Rate: number }>) : [];
      ctx.postMessage({ type: "fixed_flows", swapId: msg.swapId, rows: computeFixedFlows(rows) });
      ctx.postMessage({ type: "float_flows", swapId: msg.swapId, rows: computeFloatFlows(rows) });
    } catch (e) {
      ctx.postMessage({ type: "error", swapId: msg.swapId, error: String(e) });
    }
  } else if (msg.type === "floatFixings") {
    if (!initialized) return;
    try {
      const idx = typeof msg.index === "number" ? msg.index : null;
      const result = fetchFixingsTable(idx);
      ctx.postMessage({
        type: "float_fixings",
        swapId: msg.swapId,
        index: idx,
        columns: result?.columns ?? [],
        rows: result?.rows ?? [],
      });
    } catch (e) {
      ctx.postMessage({ type: "error", swapId: msg.swapId, error: String(e) });
    }
  }
};
