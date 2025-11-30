import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const initialRows = [
  { Term: "1Y", Rate: 0.02 },
  { Term: "2Y", Rate: 0.025 },
];

describe("datafeed.worker", () => {
  let messages: any[] = [];
  let fetchMock: ReturnType<typeof vi.fn>;
  let importScripts: ReturnType<typeof vi.fn>;
  let loadPyodide: ReturnType<typeof vi.fn>;
  let onmessage: ((ev: any) => any) | null = null;
  let currentDf = initialRows.map((r) => ({ ...r }));

  const makeRunPython = () => {
    let tickRate = 0.03;
    return vi.fn((code: string) => {
      if (code.includes("simulate_tick")) {
        const updated = { Term: "1Y", Rate: tickRate };
        currentDf = currentDf.map((row) => (row.Term === updated.Term ? { ...updated } : row));
        tickRate += 0.005;
        return JSON.stringify({ label: updated.Term, new_rate: updated.Rate, df: currentDf });
      }
      if (code.includes("reset_datafeed()")) {
        currentDf = initialRows.map((r) => ({ ...r }));
        return "";
      }
      if (code.includes("_mut")) {
        const match = code.match(/json.loads\(r'''(.+)'''\)/s);
        if (match) {
          try {
            const incoming = JSON.parse(match[1]) as Array<{ Term: string; Rate: number }>;
            if (Array.isArray(incoming) && incoming.length) {
              currentDf = incoming.map((row) => ({ Term: row.Term, Rate: Number(row.Rate) }));
            }
          } catch {
            // ignore parsing errors in test harness
          }
        }
        return JSON.stringify(currentDf);
      }
      if (code.includes("json.dumps(df.to_dict")) {
        return JSON.stringify(currentDf);
      }
      return "";
    });
  };

  const setupWorker = async () => {
    vi.resetModules();
    messages = [];
    currentDf = initialRows.map((r) => ({ ...r }));
    importScripts = vi.fn();
    const runPython = makeRunPython();
    const pyodide = {
      loadPackage: vi.fn(async () => {}),
      toPy: vi.fn((rows: any[]) => {
        currentDf = Array.isArray(rows) ? rows.map((r) => ({ ...r })) : currentDf;
        return { destroy: vi.fn() };
      }),
      globals: { set: vi.fn() },
      runPython,
    };
    loadPyodide = vi.fn(async () => pyodide);
    fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("print('datafeed')", { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ rows: initialRows }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("self", {
      importScripts,
      loadPyodide,
      postMessage: (msg: any) => messages.push(msg),
    } as any);
    vi.useFakeTimers();
    await import("@/workers/datafeed.worker");
    onmessage = (self as any).onmessage;
  };

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("initializes datafeed and posts the initial curve", async () => {
    await setupWorker();
    await onmessage?.({ data: { type: "init", baseUrl: "https://cdn/", pythonUrl: "/py/datafeed.py" } } as any);

    expect(importScripts).toHaveBeenCalledWith("https://cdn/pyodide.js");
    expect(loadPyodide).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith("/api/md/latest", expect.any(Object));
    expect(messages[0]).toEqual({ type: "ready" });
    expect(messages[1]).toEqual({ type: "data", data: initialRows });
  });

  it("runs simulated ticks on auto mode and respects interval updates", async () => {
    await setupWorker();
    await onmessage?.({ data: { type: "init" } } as any);
    messages = [];

    await onmessage?.({ data: { type: "startAuto", intervalMs: 50 } } as any);
    await vi.advanceTimersByTimeAsync(60);

    const tickMsg = messages.find((m) => m.type === "data" && m.movedTerm === "1Y");
    expect(tickMsg).toMatchObject({ dir: "up" });

    await onmessage?.({ data: { type: "updateInterval", intervalMs: 10 } } as any);
    await vi.advanceTimersByTimeAsync(12);
    expect(messages.some((m) => m.type === "data" && m.movedTerm === "1Y")).toBe(true);
  });

  it("applies curve updates while running and restarts simulation", async () => {
    await setupWorker();
    await onmessage?.({ data: { type: "init" } } as any);
    await onmessage?.({ data: { type: "startAuto", intervalMs: 100 } } as any);
    messages = [];

    const newCurve = [{ Term: "3Y", Rate: 0.04 }];
    await onmessage?.({ data: { type: "applyCurve", data: newCurve } } as any);
    expect(messages[0]).toMatchObject({ type: "data", data: newCurve, movedTerm: "3Y", dir: "flat" });

    await vi.advanceTimersByTimeAsync(120);
    expect(messages.some((m) => m.type === "data" && m.movedTerm === "1Y")).toBe(true);
  });
});
