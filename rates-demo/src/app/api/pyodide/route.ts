import { NextResponse } from "next/server";
import { Buffer } from "node:buffer";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { promises as fs } from "node:fs";

// Force Node runtime (not edge) to allow WASM initialization comfortably
export const runtime = "nodejs";
// For serverless, ensure dynamic (no static optimization)
export const dynamic = "force-dynamic";

const DEFAULT_BASE = "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/";
const PYODIDE_BASE = process.env.PYODIDE_BASE || DEFAULT_BASE;
const PYODIDE_URL = process.env.PYODIDE_URL || `${PYODIDE_BASE}pyodide.mjs`;

let pyodideReady: Promise<any> | null = null;

function tryResolveLocalPyodideDir(): string | null {
  const envDir = process.env.PYODIDE_FS_DIR;
  if (envDir && envDir.length > 0) return envDir;
  try {
    const req = createRequire(import.meta.url);
    const mjsPath = req.resolve("pyodide/pyodide.mjs");
    return path.dirname(mjsPath);
  } catch {
    return null;
  }
}

async function importRemoteModule(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  const code = await res.text();
  const b64 = Buffer.from(code, "utf8").toString("base64");
  const dataUrl = `data:text/javascript;base64,${b64}`;
  const dynamicImport: (u: string) => Promise<any> = new Function(
    "u",
    "return import(u)"
  ) as any;
  return dynamicImport(dataUrl);
}

async function getPyodide() {
  if (!pyodideReady) {
    const localDir = tryResolveLocalPyodideDir();
    if (localDir) {
      // Load from local filesystem (preferred for Node reliability)
      const mjsPath = path.join(localDir, "pyodide.mjs");
      const fileUrl = pathToFileURL(mjsPath).href;
      const { loadPyodide } = await import(fileUrl);
      const basePath = localDir.endsWith(path.sep) ? localDir : localDir + path.sep;
      pyodideReady = loadPyodide({ indexURL: basePath }).then(async (pyodide: any) => {
        await pyodide.loadPackage("numpy");
        return pyodide;
      });
    } else {
      // Remote fetch; only hide process during loadPyodide so the loader can still access process.env
      const { loadPyodide } = await importRemoteModule(PYODIDE_URL);
      const g: any = globalThis as any;
      const prevProcess = g.process;
      let restored = false;
      try {
        g.process = undefined;
        pyodideReady = loadPyodide({ indexURL: PYODIDE_BASE }).then(async (pyodide: any) => {
          await pyodide.loadPackage("numpy");
          return pyodide;
        });
      } finally {
        g.process = prevProcess;
        restored = true;
      }
    }
  }
  return pyodideReady;
}

export async function GET() {
  const t0 = Date.now();
  const pyodide = await getPyodide();
  const t1 = Date.now();
  const pyPath = path.join(process.cwd(), "src", "python", "random.py");
  const pyCode = await fs.readFile(pyPath, "utf8");
  const value = pyodide.runPython(`${pyCode}\nget_random()`);
  const t2 = Date.now();
  return NextResponse.json({ value, initMs: t1 - t0, runMs: t2 - t1 });
}
