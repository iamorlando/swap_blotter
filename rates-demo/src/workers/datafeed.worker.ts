// Datafeed Web Worker using Pyodide + pandas to read public/py/datafeed.py
export {};

const ctx: any = self as any;

let pyodide: any = null;
let initialized = false;
let running = false;
let timer: number | null = null;

async function init(baseUrl: string, pythonUrl: string) {
  try {
    ctx.importScripts(`${baseUrl}pyodide.js`);
    pyodide = await ctx.loadPyodide({ indexURL: baseUrl });
    await pyodide.loadPackage(["numpy", "pandas"]);
    const res = await fetch(pythonUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch ${pythonUrl}: ${res.status}`);
    const py = await res.text();
    pyodide.runPython(py);
    initialized = true;
    ctx.postMessage({ type: "ready" });
  } catch (e) {
    ctx.postMessage({ type: "error", error: String(e) });
  }
}

function dfToJson(): any[] {
  const jsonStr: string = pyodide.runPython(
    `import json\n` +
      `df = get_datafeed()\n` +
      `df = df.reset_index()\n` +
      `json.dumps(df.to_dict(orient='records'))\n`
  );
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    return [];
  }
}

function postData() {
  const data = dfToJson();
  ctx.postMessage({ type: "data", data });
}

function scheduleNext(intervalMs: number) {
  if (!running) return;
  timer = setTimeout(() => {
    try {
      pyodide.runPython(`simulate_tick()`);
      postData();
    } catch (e) {
      ctx.postMessage({ type: "error", error: String(e) });
      running = false;
      return;
    }
    scheduleNext(intervalMs);
  }, intervalMs) as unknown as number;
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
      pyodide.runPython(`simulate_tick()`);
    } catch (e) {
      ctx.postMessage({ type: "error", error: String(e) });
      return;
    }
    postData();
  } else if (msg.type === "startAuto") {
    if (!initialized) return;
    const intervalMs = typeof msg.intervalMs === "number" ? msg.intervalMs : 1000;
    if (!running) {
      running = true;
      scheduleNext(intervalMs);
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

