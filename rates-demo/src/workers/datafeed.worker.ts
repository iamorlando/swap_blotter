// Datafeed Web Worker using Pyodide + pandas to read public/py/datafeed.py
export {};

const ctx: any = self as any;

let pyodide: any = null;
let initialized = false;
let running = false;
let timer: number | null = null;
let currentIntervalMs = 1000;
let lastRates: Record<string, number> = {};
type TickParams = {
  rho: number;
  sigma_bps: number;
  mean_revert: number;
  margin_bps: number;
};
let tickParams: TickParams = {
  rho: 0.9,
  sigma_bps: 20,
  mean_revert: 0.02,
  margin_bps: 10,
};

async function init(baseUrl: string, pythonUrl: string) {
  try {
    ctx.importScripts(`${baseUrl}pyodide.js`);
    pyodide = await ctx.loadPyodide({ indexURL: baseUrl });
    await pyodide.loadPackage(["numpy", "pandas"]);
    const [res, mdRes] = await Promise.all([
      fetch(pythonUrl, { cache: "no-store" }),
      fetch("/api/md/latest", { cache: "no-store" }),
    ]);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Failed to fetch ${pythonUrl}: ${res.status} ${txt}`);
    }
    if (!mdRes.ok) {
      const txt = await mdRes.text().catch(() => "");
      throw new Error(`Failed to fetch latest market data: ${mdRes.status} ${txt}`);
    }
    const [code, mdJson] = await Promise.all([res.text(), mdRes.json()]);
    pyodide.runPython(code);
    const rows = mdJson?.rows || [];
    if (!rows.length) throw new Error("latest market data empty");
    const pyRows = pyodide.toPy(rows);
    pyodide.globals.set("rows_for_source", pyRows);
    pyodide.runPython("set_source_from_rows(rows_for_source)");
    if (typeof pyRows.destroy === "function") pyRows.destroy();
    initialized = true;
    try {
      const initJson: string = pyodide.runPython(
        "import json\n" +
          "df = get_datafeed().reset_index()\n" +
          "json.dumps(df.to_dict(orient='records'))\n"
      );
      const arr = JSON.parse(initJson);
      lastRates = Object.create(null);
      for (const r of arr) lastRates[r.Term] = r.Rate;
      ctx.postMessage({ type: "ready" });
      ctx.postMessage({ type: "data", data: arr });
    } catch (e) {
      ctx.postMessage({ type: "error", error: String(e) });
    }
  } catch (e) {
    ctx.postMessage({ type: "error", error: String(e) });
  }
}

function dfToJson(): any[] {
  const jsonStr: string = pyodide.runPython(
    `import json\n`
      + `df = get_datafeed()\n`
      + `df = df.reset_index()\n`
      + `json.dumps(df.to_dict(orient='records'))\n`
  );
  try {
    return JSON.parse(jsonStr);
  } catch {
    return [];
  }
}

function updateTickParams(params: Partial<TickParams>) {
  if (!params || typeof params !== "object") return;
  const num = (val: any, fallback: number) => {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  };
  tickParams = {
    rho: Math.max(0, Math.min(0.99, num(params.rho, tickParams.rho))),
    sigma_bps: Math.max(0.1, num(params.sigma_bps, tickParams.sigma_bps)),
    mean_revert: Math.max(0, Math.min(1, num(params.mean_revert, tickParams.mean_revert))),
    margin_bps: Math.max(0, num(params.margin_bps, tickParams.margin_bps)),
  };
}

function simulateOnce() {
  const fmt = (n: number) => (Number.isFinite(n) ? String(n) : "0.0");
  const { rho, sigma_bps, mean_revert, margin_bps } = tickParams;
  const payloadStr: string = pyodide.runPython(
    "import json\n" +
      `label, new_rate = simulate_tick(rho=${fmt(rho)}, sigma_bps=${fmt(sigma_bps)}, mean_revert=${fmt(mean_revert)}, margin_bps=${fmt(margin_bps)})\n` +
      "df = get_datafeed().reset_index()\n" +
      "json.dumps({'label': label, 'new_rate': float(new_rate), 'df': df.to_dict(orient='records')})\n"
  );
  return JSON.parse(payloadStr);
}

function postFromPayload(payload: any) {
  const label = payload.label as string;
  const newRate = payload.new_rate as number;
  const data = payload.df as any[];
  const prev = lastRates[label];
  const dir = prev == null ? "flat" : newRate > prev ? "up" : newRate < prev ? "down" : "flat";
  lastRates = Object.create(null);
  for (const r of data) lastRates[r.Term] = r.Rate;
  ctx.postMessage({ type: "data", data, movedTerm: label, dir });
}

function applyCurveUpdate(rows: Array<{ Term: string; Rate: number }>) {
  const wasRunning = running;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  running = false;
  try {
    const jsonStr = JSON.stringify(rows || []);
    const payloadStr: string = pyodide.runPython(
      "import json, pandas as pd\n" +
        `rows = json.loads(r'''${jsonStr}''')\n` +
        "df = pd.DataFrame(rows)\n" +
        "if not df.empty:\n" +
        "    df['Rate'] = df['Rate'].astype(float)\n" +
        "    df = df[['Term','Rate']]\n" +
        "    df = df.set_index('Term')\n" +
        "    df = _ordered(df)\n" +
        "    globals()['_mut'] = df\n" +
        "    globals()['_terms'] = list(df.index)\n" +
        "    globals()['_global_factor'] = 0.0\n" +
        "df_out = get_datafeed().reset_index()\n" +
        "json.dumps(df_out.to_dict(orient='records'))\n"
    );
    const arr = JSON.parse(payloadStr);
    lastRates = Object.create(null);
    for (const r of arr) lastRates[r.Term] = r.Rate;
    ctx.postMessage({ type: "data", data: arr, movedTerm: rows && rows.length === 1 ? rows[0].Term : undefined, dir: "flat" });
  } catch (e) {
    ctx.postMessage({ type: "error", error: String(e) });
  }
  if (wasRunning) {
    running = true;
    scheduleNext(currentIntervalMs);
  }
}

function postData() {
  const data = dfToJson();
  lastRates = Object.create(null);
  for (const r of data) lastRates[r.Term] = r.Rate;
  ctx.postMessage({ type: "data", data });
}

function scheduleNext(_intervalMs: number) {
  if (!running) return;
  timer = setTimeout(() => {
    try {
      const payload = simulateOnce();
      postFromPayload(payload);
    } catch (e) {
      ctx.postMessage({ type: "error", error: String(e) });
      running = false;
      return;
    }
    scheduleNext(currentIntervalMs);
  }, currentIntervalMs) as unknown as number;
}

ctx.onmessage = async (ev: MessageEvent) => {
  const msg = ev.data || {};
  if (msg.type === "init") {
    const base: string = msg.baseUrl || "https://cdn.jsdelivr.net/pyodide/v0.29.0/full/";
    const pyUrl: string = msg.pythonUrl || "/py/datafeed.py";
    await init(base, pyUrl);
  } else if (msg.type === "get") {
    if (!initialized) return;
    postData();
  } else if (msg.type === "simulateOnce") {
    if (!initialized) return;
    try {
      const payload = simulateOnce();
      postFromPayload(payload);
    } catch (e) {
      ctx.postMessage({ type: "error", error: String(e) });
    }
  } else if (msg.type === "startAuto") {
    if (!initialized) return;
    const intervalMs = typeof msg.intervalMs === "number" ? msg.intervalMs : 1000;
    currentIntervalMs = intervalMs;
    if (!running) {
      running = true;
      scheduleNext(currentIntervalMs);
    }
  } else if (msg.type === "updateInterval") {
    const intervalMs = typeof msg.intervalMs === "number" ? msg.intervalMs : currentIntervalMs;
    currentIntervalMs = intervalMs;
    if (running) {
      if (timer) clearTimeout(timer);
      scheduleNext(currentIntervalMs);
    }
  } else if (msg.type === "stopAuto") {
    running = false;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  } else if (msg.type === "reset") {
    if (!initialized) return;
    try {
      pyodide.runPython(`reset_datafeed()`);
      postData();
    } catch (e) {
      ctx.postMessage({ type: "error", error: String(e) });
    }
  } else if (msg.type === "setTickParams") {
    updateTickParams(msg.params || {});
  } else if (msg.type === "applyCurve") {
    if (!initialized) return;
    applyCurveUpdate(msg.data || []);
  }
};
