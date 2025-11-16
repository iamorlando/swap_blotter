export {};

const ctx: any = self as any;

let pyodide: any = null;
let initialized = false;
let timer: number | null = null;

function log(message: string) {
  ctx.postMessage({ type: "log", source: "random", message });
}

async function init(baseUrl: string, randomUrl: string) {
  try {
    ctx.importScripts(`${baseUrl}pyodide.js`);
    pyodide = await ctx.loadPyodide({ indexURL: baseUrl });
    const res = await fetch(randomUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch ${randomUrl}: ${res.status}`);
    const code = await res.text();
    const bootstrap = `\n`
      + `import types, sys\n`
      + `random_worker = types.ModuleType('random_worker')\n`
      + `exec(compile(${JSON.stringify(code)}, 'random.py', 'exec'), random_worker.__dict__)\n`
      + `sys.modules['random_worker'] = random_worker\n`
      + `from random_worker import random_value\n`;
    pyodide.runPython(bootstrap);
    initialized = true;
    log("initialized");
    ctx.postMessage({ type: "ready" });
    timer = setInterval(runRandomize, 1000) as unknown as number;
  } catch (e) {
    ctx.postMessage({ type: "error", error: String(e) });
  }
}

function runRandomize() {
  if (!initialized) return;
  try {
    const value = pyodide.runPython("from random_worker import random_value\nrandom_value()");
    log(`value=${value}`);
    ctx.postMessage({ type: "random", value: Number(value) });
  } catch (e) {
    ctx.postMessage({ type: "error", error: String(e) });
  }
}

ctx.onmessage = async (ev: MessageEvent) => {
  const msg = ev.data || {};
  if (msg.type === "init") {
    const base: string = msg.baseUrl || "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/";
    const randomUrl: string = msg.randomUrl || "/py/random.py";
    await init(base, randomUrl);
  }
};
