import { afterEach, describe, expect, it, vi } from "vitest";

const curveJson = '{"curve": "data"}';
const market = [{ Term: "1Y", Rate: 0.02 }];

describe("calibration.worker", () => {
  let messages: any[] = [];
  let fetchMock: ReturnType<typeof vi.fn>;
  let importScripts: ReturnType<typeof vi.fn>;
  let onmessage: ((ev: any) => any) | null = null;
  let runPython: ReturnType<typeof vi.fn>;
  let runPythonAsync: ReturnType<typeof vi.fn>;
  let globalsSet: ReturnType<typeof vi.fn>;

  const setupWorker = async () => {
    vi.resetModules();
    messages = [];
    importScripts = vi.fn();
    globalsSet = vi.fn();
    runPython = vi.fn((code: string) => {
      if (code.includes("calibrate_curve(data)")) return "CURVE_STATE";
      if (code.includes("get_discount_factor_curve")) return JSON.stringify([{ Term: "1Y", discount: 0.99 }]);
      if (code.includes("get_zero_rate_curve")) return JSON.stringify([{ Term: "1Y", zero: 0.01 }]);
      if (code.includes("get_forward_rate_curve")) return JSON.stringify([{ Term: "1Y", forward: 0.011 }]);
      return "";
    });
    runPythonAsync = vi.fn(async () => {});
    const pyodide = {
      loadPackage: vi.fn(async () => {}),
      runPython,
      runPythonAsync,
      globals: { set: globalsSet },
    };
    const loadPyodide = vi.fn(async () => pyodide);
    fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ json: curveJson }), { status: 200 }))
      .mockResolvedValueOnce(new Response("# datafeed", { status: 200 }))
      .mockResolvedValueOnce(new Response("# calibration", { status: 200 }))
      .mockResolvedValueOnce(new Response("# swap approx", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("self", {
      importScripts,
      loadPyodide,
      postMessage: (msg: any) => messages.push(msg),
    } as any);

    await import("@/workers/calibration.worker");
    onmessage = (self as any).onmessage;
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("initializes pyodide and posts ready once calibration is loaded", async () => {
    await setupWorker();
    await onmessage?.({ data: { type: "init", baseUrl: "https://cdn.example/" } } as any);

    expect(importScripts).toHaveBeenCalledWith("https://cdn.example/pyodide.js");
    expect(runPythonAsync).toHaveBeenCalledWith(expect.stringContaining("micropip.install"));
    expect(globalsSet).toHaveBeenCalledWith("calibration_json_str", curveJson);
    expect(runPython).toHaveBeenCalledWith(expect.stringContaining("set_curve_from_json"));
    expect(messages).toContainEqual({ type: "ready" });
  });

  it("recalibrates and emits curve snapshots", async () => {
    await setupWorker();
    await onmessage?.({ data: { type: "init" } } as any);
    messages = [];

    await onmessage?.({ data: { type: "recalibrate", market } } as any);

    expect(runPython).toHaveBeenCalledWith(expect.stringContaining("calibrate_curve(data)"));
    const curvesMsg = messages.find((m) => m.type === "curves");
    expect(curvesMsg).toEqual({
      type: "curves",
      discount: [{ Term: "1Y", discount: 0.99 }],
      zero: [{ Term: "1Y", zero: 0.01 }],
      forward: [{ Term: "1Y", forward: 0.011 }],
    });
    expect(messages).toContainEqual({ type: "curve_update", curveJson: "CURVE_STATE", market });
  });
});
