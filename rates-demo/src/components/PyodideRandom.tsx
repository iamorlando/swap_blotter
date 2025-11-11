"use client";

import * as React from "react";

type Props = { fps?: number };

export default function PyodideRandom({ fps = 60 }: Props) {
  const workerRef = React.useRef<Worker | null>(null);
  const [ready, setReady] = React.useState(false);
  const [value, setValue] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const worker = new Worker(new URL("../workers/pyodide.worker.ts", import.meta.url));
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data || {};
      if (msg.type === "ready") {
        setReady(true);
        worker.postMessage({ type: "start", fps });
      } else if (msg.type === "value") {
        setValue(msg.value as number);
      } else if (msg.type === "error") {
        setError(String(msg.error ?? "Unknown error"));
      }
    };
    worker.postMessage({
      type: "init",
      baseUrl: "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/",
      pythonUrl: "/py/random.py",
    });
    return () => {
      worker.postMessage({ type: "stop" });
      worker.terminate();
      workerRef.current = null;
    };
  }, [fps]);

  return (
    <div className="mt-4 p-4 border rounded">
      <div className="text-sm text-gray-600">
        {error ? (
          <span className="text-red-600">error: {error}</span>
        ) : ready ? (
          "pyodide: ready"
        ) : (
          "pyodide: loading..."
        )}
      </div>
      <div className="text-3xl font-mono mt-2">{value !== null ? value.toFixed(6) : "—"}</div>
    </div>
  );
}

