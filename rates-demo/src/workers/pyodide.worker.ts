// Pyodide in a classic Web Worker. Loads from CDN and runs a .py file from /public.
export {};

// Types are loose to avoid TS friction in Worker context
const ctx: any = self as any;

let pyodide: any = null;
let pyCode: string | null = null;
let running = false;
let intervalMs = 0;

async function init(baseUrl: string, pythonUrl: string) {
  // Load Pyodide script into the worker
  ctx.importScripts(`${baseUrl}pyodide.js`);
  pyodide = await ctx.loadPyodide({ indexURL: baseUrl });
  await pyodide.loadPackage("numpy");
  const res = await fetch(pythonUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch ${pythonUrl}: ${res.status}`);
  pyCode = await res.text();
}

function tick() {
  if (!running || !pyodide || !pyCode) return;
  try {
    const value = pyodide.runPython(`${pyCode}\nget_random()`);
    ctx.postMessage({ type: "value", value, ts: Date.now() });
  } catch (e) {
    ctx.postMessage({ type: "error", error: String(e) });
    running = false;
    return;
  }
  // Schedule next run
  if (intervalMs > 0) {
    setTimeout(tick, intervalMs);
  } else {
    // Yield to the event loop but aim for max throughput
    setTimeout(tick, 0);
  }
}

ctx.onmessage = async (ev: MessageEvent) => {
  const msg = ev.data || {};
  if (msg.type === "init") {
    const base: string = msg.baseUrl || "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/";
    const pyUrl: string = msg.pythonUrl || "/py/random.py";
    try {
      await init(base, pyUrl);
      ctx.postMessage({ type: "ready" });
    } catch (e) {
      ctx.postMessage({ type: "error", error: String(e) });
    }
  } else if (msg.type === "start") {
    const fps: number | undefined = msg.fps;
    intervalMs = fps && fps > 0 ? Math.max(0, Math.floor(1000 / fps)) : 0;
    if (!running) {
      running = true;
      tick();
    }
  } else if (msg.type === "stop") {
    running = false;
  }
};

