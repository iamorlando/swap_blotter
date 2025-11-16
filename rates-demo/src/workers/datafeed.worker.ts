// Datafeed Web Worker using Pyodide + pandas to read public/py/datafeed.py
export {};

const ctx: any = self as any;

let pyodide: any = null;
let initialized = false;
let running = false;
let timer: number | null = null;
let currentIntervalMs = 1000;
let lastRates: Record<string, number> = {};

async function init(baseUrl: string, pythonUrl: string) {
  try {
    ctx.importScripts(`${baseUrl}pyodide.js`);
    pyodide = await ctx.loadPyodide({ indexURL: baseUrl });
    await pyodide.loadPackage(["numpy", "pandas"]);
    const res = await fetch(pythonUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch ${pythonUrl}: ${res.status}`);
    const code = await res.text();
    pyodide.runPython(code);
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
  } catch (e) {
    return [];
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
      const payloadStr: string = pyodide.runPython(
        "import json\n" +
          "label, new_rate = simulate_tick()\n" +
          "df = get_datafeed().reset_index()\n" +
          "json.dumps({'label': label, 'new_rate': float(new_rate), 'df': df.to_dict(orient='records')})\n"
      );
      const payload = JSON.parse(payloadStr);
      const label = payload.label as string;
      const newRate = payload.new_rate as number;
      const data = payload.df as any[];
      const prev = lastRates[label];
      const dir = prev == null ? "flat" : newRate > prev ? "up" : newRate < prev ? "down" : "flat";
      lastRates = Object.create(null);
      for (const r of data) lastRates[r.Term] = r.Rate;
      ctx.postMessage({ type: "data", data, movedTerm: label, dir });
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
    const base: string = msg.baseUrl || "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/";
    const pyUrl: string = msg.pythonUrl || "/py/datafeed.py";
    await init(base, pyUrl);
  } else if (msg.type === "get") {
    if (!initialized) return;
    postData();
  } else if (msg.type === "simulateOnce") {
    if (!initialized) return;
    try {
      const payloadStr: string = pyodide.runPython(
        "import json\n" +
          "label, new_rate = simulate_tick()\n" +
          "df = get_datafeed().reset_index()\n" +
          "json.dumps({'label': label, 'new_rate': float(new_rate), 'df': df.to_dict(orient='records')})\n"
      );
      const payload = JSON.parse(payloadStr);
      const label = payload.label as string;
      const newRate = payload.new_rate as number;
      const data = payload.df as any[];
      const prev = lastRates[label];
      const dir = prev == null ? "flat" : newRate > prev ? "up" : newRate < prev ? "down" : "flat";
      lastRates = Object.create(null);
      for (const r of data) lastRates[r.Term] = r.Rate;
      ctx.postMessage({ type: "data", data, movedTerm: label, dir });
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
  }
};
