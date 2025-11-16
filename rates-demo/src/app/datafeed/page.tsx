"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Scatter } from "recharts";
import { DataGrid, GridColDef, GridPaginationModel, GridSortModel } from "@mui/x-data-grid";
import { Slider } from "@mui/material";
import VerticalSplit from "@/components/VerticalSplit";
import HorizontalSplit from "@/components/HorizontalSplit";
import { columnsMeta as generatedColumns, idField as generatedIdField } from "@/generated/blotterColumns";
import Modal from "@/components/Modal";

type Row = { id: number; Term: string; Rate: number };
type ApiColumn = { field: string; type?: string };
type BlotterRow = Record<string, any> & { id: string | number };
type DragState = {
  mode: "curve" | "point";
  startClientY: number;
  baseCurve: Array<{ Term: string; Rate: number }>;
  targetIndex?: number;
};

export default function DatafeedPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const swapId = searchParams.get("swap");
  const closeSwap = React.useCallback(() => {
    const sp = new URLSearchParams(searchParams?.toString() || "");
    sp.delete("swap");
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : `${pathname}`, { scroll: false });
  }, [router, pathname, searchParams]);
  const workerRef = React.useRef<Worker | null>(null);
  const approxRef = React.useRef<Worker | null>(null);
  const approxReadyRef = React.useRef(false);
  const latestCurveRef = React.useRef<Array<{ Term: string; Rate: number }> | null>(null);
  const [approxReady, setApproxReady] = React.useState(false);
  const [approxOverrides, setApproxOverrides] = React.useState<Record<string, any>>({});
  const pushApproxMarket = React.useCallback((rows: Array<{ Term: string; Rate: number }>) => {
    if (rows && rows.length) {
      latestCurveRef.current = rows;
      if (approxReadyRef.current) {
        approxRef.current?.postMessage({ type: "curve", market: rows });
      }
    } else {
      latestCurveRef.current = null;
    }
  }, []);
  const [data, setData] = React.useState<Array<{ Term: string; Rate: number }>>([]);
  const [ready, setReady] = React.useState(false);
  const [auto, setAuto] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [movedTerm, setMovedTerm] = React.useState<string | null>(null);
  const [moveDir, setMoveDir] = React.useState<"up" | "down" | "flat" | null>(null);
  const [seq, setSeq] = React.useState(0);
  const [fps, setFps] = React.useState(1); // ticks per second
  const [shockBps, setShockBps] = React.useState(25);
  const [hoveredTerm, setHoveredTerm] = React.useState<string | null>(null);
  const [hoveringCurve, setHoveringCurve] = React.useState(false);
  const [dragState, setDragState] = React.useState<DragState | null>(null);
  const autoWasRunningRef = React.useRef(false);
  const chartBoxRef = React.useRef<HTMLDivElement | null>(null);
  const [chartSize, setChartSize] = React.useState({ width: 0, height: 0 });

  React.useEffect(() => {
    const box = chartBoxRef.current;
    if (!box) return;
    const updateSize = () => {
      setChartSize({ width: box.clientWidth, height: box.clientHeight });
    };
    updateSize();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry?.contentRect) {
        setChartSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    const w = new Worker(new URL("../../workers/datafeed.worker.ts", import.meta.url));
    workerRef.current = w;
    w.onmessage = (e: MessageEvent) => {
      const msg = e.data || {};
      if (msg.type === "ready") {
        console.log("[datafeed worker] ready");
        setReady(true);
        w.postMessage({ type: "get" });
        // start auto by default at 1 Hz
        const intervalMs = 1000; // 1 second
        w.postMessage({ type: "startAuto", intervalMs });
      } else if (msg.type === "data") {
        const curveRows = msg.data as Array<{ Term: string; Rate: number }>;
        console.log("[datafeed worker] tick", curveRows?.length);
        setData(curveRows);
        pushApproxMarket(curveRows);
        if (msg.movedTerm) {
          setMovedTerm(msg.movedTerm as string);
          setMoveDir((msg.dir as any) || "flat");
          setSeq((s) => s + 1);
        }
      } else if (msg.type === "md") {
        console.log("[datafeed worker] md", msg.rows);
      } else if (msg.type === "error") {
        setError(String(msg.error ?? "Unknown error"));
        console.error("[datafeed worker] error", msg.error);
      } else if (msg.type === "log") {
        console.log(`[datafeed worker] ${msg.message}`);
      }
    };
    w.postMessage({ type: "init", baseUrl: "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/", pythonUrl: "/py/datafeed.py" });
    return () => {
      if (auto) w.postMessage({ type: "stopAuto" });
      w.terminate();
      workerRef.current = null;
    };
  }, [pushApproxMarket]);

  React.useEffect(() => {
    const w = new Worker(new URL("../../workers/swapApprox.worker.ts", import.meta.url));
    approxRef.current = w;
    approxReadyRef.current = false;
    setApproxReady(false);
    setApproxOverrides({});
    w.onmessage = (e: MessageEvent) => {
      const msg = e.data || {};
      if (msg.type === "ready") {
        console.log("[approx worker] ready");
        approxReadyRef.current = true;
        setApproxReady(true);
        if (latestCurveRef.current) {
          w.postMessage({ type: "curve", market: latestCurveRef.current });
        }
      } else if (msg.type === "md") {
        console.log("[approx worker] md", msg.rows);
      } else if (msg.type === "approx") {
        const map: Record<string, any> = Object.create(null);
        (msg.rows || []).forEach((row: any) => {
          const key = row?.ID ?? row?.id;
          if (key != null) {
            map[String(key)] = row;
          }
        });
        setApproxOverrides(map);
      } else if (msg.type === "error") {
        console.error("[approx worker] error", msg.error);
      } else if (msg.type === "log") {
        console.log(`[approx worker] ${msg.message}`);
      }
    };
    w.postMessage({ type: "init", baseUrl: "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/", datafeedUrl: "/py/datafeed.py", approxUrl: "/py/swap_approximation.py" });
    return () => {
      approxReadyRef.current = false;
      setApproxReady(false);
      setApproxOverrides({});
      w.terminate();
      approxRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    if (!ready || !workerRef.current) return;
    workerRef.current.postMessage({ type: "setTickParams", params: { sigma_bps: shockBps } });
  }, [ready, shockBps]);

  const requestApproximation = React.useCallback((swaps: any[], risk: any[]) => {
    if (!approxRef.current) return;
    approxRef.current.postMessage({ type: "swaps", swaps, risk });
  }, []);

  const clearApproximation = React.useCallback(() => {
    setApproxOverrides({});
  }, []);

  const rows: Row[] = React.useMemo(
    () => data.map((d, i) => ({ id: i, Term: d.Term, Rate: d.Rate })),
    [data]
  );
  const dataPct = React.useMemo(() => data.map(d => ({ Term: d.Term, RatePct: (d.Rate == null ? null : Number(d.Rate) * 100) })), [data]);
  const dragBaselinePct = React.useMemo(() => {
    if (!dragState) return null;
    return dragState.baseCurve.map((d) => ({ Term: d.Term, RatePct: (d.Rate == null ? null : Number(d.Rate) * 100) }));
  }, [dragState]);
  const rateDomain = React.useMemo(() => {
    const vals = dataPct.map((d) => (d.RatePct == null ? null : Number(d.RatePct))).filter((v) => typeof v === "number") as number[];
    const minVal = vals.length ? Math.min(...vals) : 0;
    const maxVal = vals.length ? Math.max(...vals) : 0;
    const spread = maxVal - minVal;
    const pad = Math.max(0.2, spread * 0.15 || 0.2);
    const lo = minVal - pad;
    const hi = maxVal + pad;
    return { min: lo, max: hi };
  }, [dataPct]);
  const rateDeltaFromPixels = React.useCallback((dy: number) => {
    const span = rateDomain.max - rateDomain.min;
    const h = chartSize.height || 1;
    if (!span || !Number.isFinite(span)) return 0;
    return (-dy * span) / h;
  }, [rateDomain, chartSize.height]);
  const computeIntervalMs = React.useCallback((fpsVal: number) => {
    return Math.max(100, Math.round(1000 / Math.max(1, Math.min(10, fpsVal))));
  }, []);
  const commitCurve = React.useCallback((rows: Array<{ Term: string; Rate: number }>) => {
    setMovedTerm(null);
    setMoveDir(null);
    setData(rows);
    pushApproxMarket(rows);
    workerRef.current?.postMessage({ type: "applyCurve", data: rows });
  }, [pushApproxMarket]);
  const shiftCurveFromDelta = React.useCallback((state: DragState, deltaPct: number) => {
    const delta = deltaPct / 100;
    return state.baseCurve.map((row, idx) => {
      if (state.mode === "point" && idx !== state.targetIndex) return row;
      return { ...row, Rate: Number(row.Rate) + delta };
    });
  }, []);
  const beginDrag = React.useCallback((mode: "curve" | "point", clientY: number, targetIndex?: number) => {
    if (!data.length) return;
    autoWasRunningRef.current = auto;
    if (auto) workerRef.current?.postMessage({ type: "stopAuto" });
    if (mode === "curve") setHoveredTerm(null);
    setDragState({ mode, startClientY: clientY, baseCurve: data, targetIndex });
  }, [auto, data]);
  const handleDragMove = React.useCallback((clientY: number) => {
    setDragState((state) => {
      if (!state) return state;
      const deltaPct = rateDeltaFromPixels(clientY - state.startClientY);
      const next = shiftCurveFromDelta(state, deltaPct);
      setData(next);
      pushApproxMarket(next);
      return state;
    });
  }, [rateDeltaFromPixels, shiftCurveFromDelta, pushApproxMarket]);
  const finalizeDrag = React.useCallback((clientY: number) => {
    setDragState((state) => {
      if (!state) return state;
      const deltaPct = rateDeltaFromPixels(clientY - state.startClientY);
      const next = shiftCurveFromDelta(state, deltaPct);
      commitCurve(next);
      if (autoWasRunningRef.current && auto) {
        const intervalMs = computeIntervalMs(fps);
        workerRef.current?.postMessage({ type: "startAuto", intervalMs });
      }
      autoWasRunningRef.current = false;
      return null;
    });
  }, [rateDeltaFromPixels, shiftCurveFromDelta, commitCurve, auto, computeIntervalMs, fps]);

  React.useEffect(() => {
    if (!dragState) return;
    const onMove = (ev: MouseEvent) => handleDragMove(ev.clientY);
    const onUp = (ev: MouseEvent) => finalizeDrag(ev.clientY);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragState, handleDragMove, finalizeDrag]);

  const columns: GridColDef<Row>[] = [
    { field: "Term", headerName: "Term", width: 120 },
    {
      field: "Rate",
      headerName: "Rate",
      width: 160,
      type: "number",
      renderCell: (params) => {
        const term = (params.row as Row).Term;
        const isMoved = term === movedTerm;
        const dir = moveDir;
        const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "";
        const cls = isMoved ? (dir === "up" ? "flash-up" : dir === "down" ? "flash-down" : "") : "";
        const val = typeof params.value === "number" ? (params.value as number) * 100 : params.value;
        return (
          <div className="flex items-center gap-1">
            {isMoved && arrow && (
              <span className={dir === "up" ? "text-green-400" : "text-red-400"}>
                {arrow}
              </span>
            )}
            <span key={`${term}-${seq}`} className={`font-mono ${cls}`}>
              {typeof val === "number" ? val.toFixed(3) + "%" : val}
            </span>
          </div>
        );
      },
    },
  ];

  const toggleAuto = () => {
    const now = !auto;
    setAuto(now);
    const intervalMs = computeIntervalMs(fps);
    if (now) workerRef.current?.postMessage({ type: "startAuto", intervalMs });
    else workerRef.current?.postMessage({ type: "stopAuto" });
  };

  const onFpsChange = (_: Event, val: number | number[]) => {
    const v = Array.isArray(val) ? val[0] : val;
    setFps(v);
    const intervalMs = computeIntervalMs(v);
    workerRef.current?.postMessage({ type: "updateInterval", intervalMs });
  };

  const onShockChange = (_: Event, val: number | number[]) => {
    const v = Array.isArray(val) ? val[0] : val;
    setShockBps(v);
    if (ready) {
      workerRef.current?.postMessage({ type: "setTickParams", params: { sigma_bps: v } });
    }
  };

  const Controls = (
    <div className="flex items-center justify-between mb-3">
      {/* Left group: slider only */}
      <div className="flex items-center gap-4">
        <div className="text-sm text-gray-300 whitespace-nowrap">Data refresh frequency</div>
        <div className="w-56">
          <Slider
            value={fps}
            min={1}
            max={10}
            step={1}
            marks={Array.from({length:10},(_,i)=>{
              const v=i+1; return {value:v,label: v===1? '1x': `${v}x`};
            })}
            onChange={onFpsChange}
            valueLabelDisplay="auto"
            valueLabelFormat={(v)=> v===1? '1x': `${v}x`}
            sx={{ mt: 0 }}
          />
        </div>
      </div>

      {/* Right group: play/pause toggle aligned to end with labels */}
      <div className="flex items-center">
        <div className="flex items-center gap-2 text-sm select-none">
          <span className={auto ? "text-gray-600" : "text-gray-200"}>paused</span>
          <div
            className={`w-10 h-6 rounded-full p-1 transition-colors cursor-pointer ${auto ? "bg-green-500" : "bg-gray-600"}`}
            onClick={toggleAuto}
            role="switch"
            aria-checked={auto}
          >
            <div className={`h-4 w-4 bg-white rounded-full transition-transform ${auto ? "translate-x-4" : "translate-x-0"}`} />
          </div>
          <span className={auto ? "text-gray-200" : "text-gray-600"}>running</span>
        </div>
      </div>
    </div>
  );

  const CustomXAxisTick = (props: any) => {
    const { x, y, payload } = props;
    const label = payload?.value as string;
    const isMoved = label === movedTerm;
    const isHovered = label === hoveredTerm;
    const cls = isMoved ? (moveDir === "up" ? "flash-up" : moveDir === "down" ? "flash-down" : "") : isHovered ? "font-semibold text-amber-300" : "";
    const fill = isHovered ? "#fbbf24" : "#e5e7eb";
    return (
      <g transform={`translate(${x},${y})`} key={`${label}-${seq}`}>
        <text dy={16} textAnchor="middle" className={cls} style={{ fontSize: 12, fill }}>
          {label}
        </text>
      </g>
    );
  };

  const PointHandle = (props: any) => {
    const { cx, cy, payload, index } = props;
    if (cx == null || cy == null) return null;
    const term = payload?.Term as string;
    const isDragging = dragState?.mode === "point" && dragState.targetIndex === index;
    const active = hoveredTerm === term || isDragging;
    return (
      <g
        onMouseEnter={() => { setHoveredTerm(term); setHoveringCurve(true); }}
        onMouseLeave={() => { if (!dragState) { setHoveredTerm(null); setHoveringCurve(false); } }}
        onMouseDown={(e: any) => {
          e.stopPropagation();
          if (e?.button !== 0) return;
          const clientY = e?.clientY ?? 0;
          beginDrag("point", clientY, index);
          setHoveredTerm(term);
          setHoveringCurve(true);
        }}
        cursor="ns-resize"
      >
        <circle cx={cx} cy={cy} r={isDragging ? 7 : active ? 6 : 4} fill={isDragging ? "#f59e0b" : "#9ca3af"} stroke="#111827" strokeWidth={2} />
      </g>
    );
  };

  const isCurveActive = hoveringCurve || Boolean(dragState);

  const LeftPanel = (
    <div className="p-6 space-y-4">
      {/* Title + run toggle */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Datafeed</h1>
        <div className="flex items-center gap-2 text-sm select-none">
          <span className={auto ? "text-gray-600" : "text-gray-200"}>paused</span>
          <div
            className={`w-10 h-6 rounded-full p-1 transition-colors cursor-pointer ${auto ? "bg-green-500" : "bg-gray-600"}`}
            onClick={toggleAuto}
            role="switch"
            aria-checked={auto}
          >
            <div className={`h-4 w-4 bg-white rounded-full transition-transform ${auto ? "translate-x-4" : "translate-x-0"}`} />
          </div>
          <span className={auto ? "text-gray-200" : "text-gray-600"}>running</span>
        </div>
      </div>

      {/* Settings box */}
      <div className="w-full rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-3">
        <div className="flex items-center justify-between gap-6">
          <div className="text-sm text-gray-300 whitespace-nowrap">Refresh frequency</div>
          <div className="w-56">
            <Slider
              value={fps}
              min={1}
              max={10}
              step={1}
              marks={Array.from({ length: 10 }, (_, i) => {
                const v = i + 1; return { value: v, label: v === 1 ? '1x' : `${v}x` };
              })}
              onChange={onFpsChange}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => v === 1 ? '1x' : `${v}x`}
              sx={{ mt: 0 }}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-6">
          <div className="text-sm text-gray-300 whitespace-nowrap">Tick magnitude (bp)</div>
          <div className="w-56">
            <Slider
              value={shockBps}
              min={5}
              max={75}
              step={5}
              marks={[5, 15, 25, 35, 45, 55, 65, 75].map(v => ({ value: v, label: `${v}` }))}
              onChange={onShockChange}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => `${v} bp`}
              sx={{ mt: 0 }}
            />
          </div>
        </div>
        <div className="text-xs text-gray-500">Drag the curve for parallel shifts or drag individual points to craft scenarios; simulated ticks continue from the shifted base.</div>
      </div>

      {/* Market chart */}
      <div className="w-full rounded-lg border border-gray-800 bg-gray-900 p-3">
        <div className="h-60 w-full" ref={chartBoxRef}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={dataPct}
              margin={{ top: 10, right: 16, bottom: 0, left: 0 }}
              onMouseEnter={() => setHoveringCurve(true)}
              onMouseLeave={() => { if (!dragState) { setHoveringCurve(false); setHoveredTerm(null); } }}
              onMouseDown={(_, e: any) => {
                if (e?.button !== 0) return;
                const clientY = e?.clientY ?? 0;
                beginDrag("curve", clientY);
                setHoveringCurve(true);
              }}
              style={{ cursor: dragState ? "grabbing" : "grab" }}
              isAnimationActive={false}
            >
              <defs>
                <linearGradient id="rateFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="Term" tick={<CustomXAxisTick />} axisLine={{ stroke: "#374151" }} tickLine={{ stroke: "#374151" }} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} axisLine={{ stroke: "#374151" }} tickLine={{ stroke: "#374151" }} domain={[rateDomain.min, rateDomain.max]} />
              <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", color: "#e5e7eb" }} />
              {dragBaselinePct && (
                <Area
                  type="monotone"
                  dataKey="RatePct"
                  data={dragBaselinePct}
                  stroke="#6b7280"
                  strokeWidth={2}
                  strokeDasharray="6 5"
                  fill="none"
                  isAnimationActive={false}
                />
              )}
              <Area type="monotone" dataKey="RatePct" stroke="#f59e0b" strokeWidth={isCurveActive ? 3 : 2} fill="url(#rateFill)" fillOpacity={isCurveActive ? 0.35 : 0.25} isAnimationActive={false} />
              <Scatter data={dataPct} fill="#f59e0b" shape={(p: any) => <PointHandle {...p} />} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Rates table (compact) */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
        <div className="text-sm text-gray-300 mb-1">Rates</div>
        <div className="h-48">
          <DataGrid
            rows={rows}
            columns={columns}
            disableColumnMenu
            hideFooter
            density="compact"
            sx={{
              color: "#e5e7eb",
              border: 0,
              "& .MuiDataGrid-columnHeaders": { backgroundColor: "#0b1220" },
              "& .MuiDataGrid-row": { backgroundColor: "#111827" },
              "& .MuiDataGrid-cell": { borderColor: "#1f2937" },
            }}
          />
        </div>
      </div>
    </div>
  );

  // Calibration worker and data
  const calibRef = React.useRef<Worker | null>(null);
  const [calibReady, setCalibReady] = React.useState(false);
  const [discount, setDiscount] = React.useState<Array<{ term: string; df: number }>>([]);
  const [zero, setZero] = React.useState<Array<{ term: string; zero_rate: number }>>([]);
  const [forwardAnchors, setForwardAnchors] = React.useState<Array<{ term: string; days: number; forward_rate: number }>>([]);
  const [forwardDaily, setForwardDaily] = React.useState<Array<{ day: number; rate: number }>>([]);
  const [calibErr, setCalibErr] = React.useState<string | null>(null);
  const [calibrating, setCalibrating] = React.useState(false);
  const [autoCalibrated, setAutoCalibrated] = React.useState(false);

  React.useEffect(() => {
    const w = new Worker(new URL("../../workers/calibration.worker.ts", import.meta.url));
    calibRef.current = w;
    w.onmessage = (e: MessageEvent) => {
      const msg = e.data || {};
      if (msg.type === "ready") {
        setCalibReady(true);
      } else if (msg.type === "curves") {
        setCalibrating(false);
        setDiscount(msg.discount as any[]);
        setZero(msg.zero as any[]);
        const fw = (msg.forward as any[]).map((r: any) => ({ term: r.term, days: r.days, forward_rate: r.forward_rate }));
        setForwardAnchors(fw);
        // Build daily step function (left-constant)
        const sorted = [...fw].sort((a,b)=>a.days-b.days);
        const maxDay = sorted.length ? sorted[sorted.length-1].days : 0;
        const daily: Array<{day:number; rate:number}> = [];
        let idx = 0;
        for (let d=0; d<=maxDay; d++) {
          while (idx+1 < sorted.length && sorted[idx+1].days <= d) idx++;
          const rate = sorted[idx]?.forward_rate ?? (sorted[0]?.forward_rate ?? 0);
          daily.push({ day: d, rate });
        }
        setForwardDaily(daily);
      } else if (msg.type === "error") {
        setCalibrating(false);
        setCalibErr(String(msg.error ?? "Unknown error"));
      }
    };
    w.postMessage({ type: "init", baseUrl: "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/", datafeedUrl: "/py/datafeed.py", calibrationUrl: "/py/curve_calibration.py" });
    return () => {
      w.terminate();
      calibRef.current = null;
    };
  }, []);

  const recalibrate = () => {
    if (!calibReady) return;
    setCalibrating(true);
    calibRef.current?.postMessage({ type: "recalibrate", market: data });
  };

  // Auto-trigger a recalibration once, when calibration worker is ready and we have market data
  React.useEffect(() => {
    if (calibReady && !autoCalibrated && data && data.length > 0) {
      setAutoCalibrated(true);
      setCalibrating(true);
      calibRef.current?.postMessage({ type: "recalibrate", market: data });
    }
  }, [calibReady, autoCalibrated, data]);

  const RightPanel = (
    <div className="p-6 space-y-4 min-w-[320px]">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-400">{calibErr ? <span className="text-red-500">{calibErr}</span> : calibReady ? "calibration ready" : "loading rateslib..."}</div>
        <button onClick={recalibrate} disabled={!calibReady || calibrating} className="inline-flex items-center rounded-md border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-blue-300 hover:bg-blue-500/20 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50">
          {calibrating ? "recalibrating..." : "recalibrate"}
        </button>
      </div>

      {/* Top row: two half-width charts */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
          <div className="text-sm text-gray-300 mb-1">Discount Curve</div>
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={discount} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="dfFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="term" tick={{ fill: "#9ca3af", fontSize: 10 }} interval={0} axisLine={{ stroke: "#374151" }} tickLine={{ stroke: "#374151" }} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} axisLine={{ stroke: "#374151" }} tickLine={{ stroke: "#374151" }} />
                <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", color: "#e5e7eb" }} cursor={{ stroke: "#374151" }} />
                <Area type="monotone" dataKey="df" stroke="#a78bfa" strokeWidth={1.5} fill="url(#dfFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
          <div className="text-sm text-gray-300 mb-1">Zero Curve</div>
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={zero} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="zrFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="term" tick={{ fill: "#9ca3af", fontSize: 10 }} interval={0} axisLine={{ stroke: "#374151" }} tickLine={{ stroke: "#374151" }} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} axisLine={{ stroke: "#374151" }} tickLine={{ stroke: "#374151" }} />
                <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", color: "#e5e7eb" }} cursor={{ stroke: "#374151" }} />
                <Area type="monotone" dataKey="zero_rate" stroke="#34d399" strokeWidth={1.5} fill="url(#zrFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom row: full width forward curve */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
        <div className="text-sm text-gray-300 mb-1">Forward Curve</div>
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={[...forwardAnchors].sort((a,b)=>a.days-b.days)} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="fwFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="term" tick={{ fill: "#9ca3af", fontSize: 10 }} interval={0} axisLine={{ stroke: "#374151" }} tickLine={{ stroke: "#374151" }} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} axisLine={{ stroke: "#374151" }} tickLine={{ stroke: "#374151" }} />
              <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", color: "#e5e7eb" }} cursor={{ stroke: "#374151" }} />
              <Area type="stepAfter" dataKey="forward_rate" stroke="#f59e0b" strokeWidth={1.5} fill="url(#fwFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );

  const Top = (
    <HorizontalSplit left={LeftPanel} right={RightPanel} initialLeftPct={0.33} />
  );

  const Bottom = (
    <div className="p-4 space-y-2">
      <div className="text-sm text-gray-300">Blotter</div>
      <BlotterGrid
        approxReady={approxReady}
        approxOverrides={approxOverrides}
        requestApproximation={requestApproximation}
        clearApproximation={clearApproximation}
        hasCurveData={data.length > 0}
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <VerticalSplit top={Top} bottom={Bottom} initialTopHeight={520} />
      {swapId && (
        <Modal title={`Swap ${swapId}`}>
          <div className="space-y-3 text-sm text-gray-200">
            <div>
              Swap ID: <span className="font-mono text-blue-300">{swapId}</span>
            </div>
            <div className="text-gray-400">Detail view coming next. This modal preserves the running datafeed and calibration workers.</div>
            <div className="pt-2">
              <button onClick={closeSwap} className="px-3 py-1.5 rounded-md border border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700">Close</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

type BlotterGridProps = {
  approxReady: boolean;
  approxOverrides: Record<string, any>;
  requestApproximation: (swaps: any[], risk: any[]) => void;
  clearApproximation: () => void;
  hasCurveData: boolean;
};

function BlotterGrid({ approxReady, approxOverrides, requestApproximation, clearApproximation, hasCurveData }: BlotterGridProps) {
  const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  const fmtDate = React.useCallback((v: any) => {
    if (!v) return "";
    const d = typeof v === "string" || typeof v === "number" ? new Date(v) : (v as Date);
    if (isNaN(d.getTime())) return String(v);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, []);

  const apiCols: ApiColumn[] = generatedColumns || [];
  const initialColumns: GridColDef<BlotterRow>[] = React.useMemo(() => {
    const cols: GridColDef<BlotterRow>[] = (apiCols.length ? apiCols : [{ field: generatedIdField || "ID" }])
      .filter((c) => c.field !== "RowType")
      .map((c) => {
        const base: GridColDef<BlotterRow> = {
          field: c.field,
          headerName: c.field,
          flex: 1,
        };
        const t = (c.type || "").toLowerCase();
        if (t.includes("int") || t.includes("decimal") || t.includes("double") || t.includes("float") || t.includes("real") || t.includes("bigint")) {
          base.type = "number";
          base.flex = undefined;
          base.width = 140;
        } else if (t.includes("date") || t.includes("timestamp")) {
          base.width = 140;
          base.valueFormatter = (params: any) => fmtDate(params.value);
          base.renderCell = (params: any) => <span>{fmtDate(params.value)}</span>;
        } else {
          base.width = 200;
        }
        if (c.field === "ParRate") {
          base.align = "right";
          base.width = 140;
          base.renderCell = (p: any) => {
            const baseVal = (p.row as any).__baseParRate;
            const cur = p.value == null ? null : Number(p.value);
            const delta = baseVal == null || cur == null ? 0 : cur - Number(baseVal);
            const dir = delta > 1e-6 ? "up" : delta < -1e-6 ? "down" : "flat";
            const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "";
            const color = dir === "up" ? "text-green-400" : dir === "down" ? "text-red-400" : "text-gray-200";
            return (
              <span className={`flex items-center justify-end gap-1 ${color}`}>
                {arrow && <span>{arrow}</span>}
                <span>{cur == null ? "" : `${cur.toFixed(2)}%`}</span>
              </span>
            );
          };
        }
        if (c.field === "NPV") {
          base.align = "right";
          base.width = 180;
          base.renderCell = (p: any) => {
            const baseVal = (p.row as any).__baseNPV;
            const cur = p.value == null ? null : Number(p.value);
            const delta = baseVal == null || cur == null ? 0 : cur - Number(baseVal);
            const dir = delta > 1e-6 ? "up" : delta < -1e-6 ? "down" : "flat";
            const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "";
            const color = dir === "up" ? "text-green-400" : dir === "down" ? "text-red-400" : "text-gray-200";
            const formatted = cur == null ? "" : `USD ${usd.format(Number(Math.abs(cur))).replace("$", "$ ")}`;
            return (
              <span className={`flex items-center justify-end gap-1 ${color}`}>
                {arrow && <span>{arrow}</span>}
                <span>{formatted}</span>
              </span>
            );
          };
        }
        if (c.field === "ParSpread") {
          base.valueFormatter = (p: any) => (p.value == null ? "" : `${Number(p.value).toFixed(2)} bp`);
          base.renderCell = (p: any) => <span>{p.value == null ? "" : `${Number(p.value).toFixed(2)} bp`}</span>;
          base.align = "right";
        }
        if (c.field === "FixedRate") {
          base.valueFormatter = (p: any) => (p.value == null ? "" : `${Number(p.value).toFixed(2)} %`);
          base.renderCell = (p: any) => <span>{p.value == null ? "" : `${Number(p.value).toFixed(2)} %`}</span>;
          base.align = "right";
        }
        return base;
      });
    // ID column as link
    const idName = (generatedIdField || "ID").toLowerCase();
    const idx = cols.findIndex((c) => c.field.toLowerCase() === idName);
    if (idx >= 0) {
      cols[idx] = {
        ...cols[idx],
        headerName: generatedIdField || cols[idx].headerName,
        renderCell: (params) => <SwapLink id={params.value} />,
        width: 180,
      } as GridColDef<BlotterRow>;
    }
    // Ensure Notional present and formatted
    const nIdx = cols.findIndex((c) => c.field === "Notional");
    const notionalCol: GridColDef<BlotterRow> = {
      field: "Notional",
      headerName: "Notional",
      width: 180,
      sortable: false,
      valueFormatter: (p: any) => (p.value == null ? "" : `USD ${usd.format(Math.abs(Number(p.value))).replace("$", "$ ")}`),
      renderCell: (p: any) => <span>{p.value == null ? "" : `USD ${usd.format(Math.abs(Number(p.value))).replace("$", "$ ")}`}</span>,
      align: "right",
    };
    if (nIdx >= 0) cols[nIdx] = { ...cols[nIdx], ...notionalCol };
    else cols.push(notionalCol);
    return cols;
  }, [apiCols, fmtDate]);

  const [columns, setColumns] = React.useState<GridColDef<BlotterRow>[]>(initialColumns);
  const [rows, setRows] = React.useState<BlotterRow[]>([]);
  const [rowCount, setRowCount] = React.useState(0);
  const [paginationModel, setPaginationModel] = React.useState<GridPaginationModel>({ page: 0, pageSize: 20 });
  const [sortModel, setSortModel] = React.useState<GridSortModel>([
    { field: (generatedIdField as string) || "ID", sort: "asc" },
  ]);
  const [loading, setLoading] = React.useState(false);

  const sanitizeRecord = React.useCallback((row: Record<string, any>) => {
    const out: Record<string, any> = {};
    Object.entries(row || {}).forEach(([key, value]) => {
      out[key] = typeof value === "bigint" ? Number(value) : value;
    });
    return out;
  }, []);

  const requestApprox = React.useCallback(async (baseRows: BlotterRow[]) => {
    if (!approxReady || !hasCurveData) return;
    if (!baseRows || !baseRows.length) return;
    const ids = baseRows
      .map((r) => r.ID ?? r.id)
      .filter((id) => id != null)
      .map((id) => String(id));
    if (!ids.length) return;
    try {
      const query = ids.map((id) => encodeURIComponent(id)).join(",");
      const res = await fetch(`/api/risk-batch?ids=${query}`);
      if (!res.ok) throw new Error(`risk fetch failed: ${res.status}`);
      const data = await res.json();
      const riskRows: any[] = Array.isArray(data.rows) ? data.rows : [];
      const sanitizedRisk = riskRows.map((row) => sanitizeRecord(row));
      const swapsPayload = baseRows.map((row) => ({
        ID: row.ID ?? row.id,
        id: row.id,
        FixedRate: row.FixedRate == null ? null : Number(row.FixedRate),
        NPV: row.NPV == null ? null : Number(row.NPV),
        ParRate: row.ParRate == null ? null : Number(row.ParRate),
        Notional: row.Notional == null ? null : Number(row.Notional),
      }));
      requestApproximation(swapsPayload, sanitizedRisk);
    } catch (err) {
      console.error("[blotter] risk fetch", err);
    }
  }, [approxReady, hasCurveData, requestApproximation, sanitizeRecord]);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    const sortField = sortModel[0]?.field ?? generatedIdField ?? "id";
    const sortOrder = (sortModel[0]?.sort ?? "asc") as "asc" | "desc";
    const url = `/api/swaps?page=${paginationModel.page}&pageSize=${paginationModel.pageSize}&sortField=${sortField}&sortOrder=${sortOrder}`;
    const res = await fetch(url);
    const data = await res.json();
    const baseRows: BlotterRow[] = data.rows || [];
    setRows(baseRows);
    setRowCount(data.total || 0);
    clearApproximation();
    requestApprox(baseRows).catch((err) => console.error("[blotter] approx", err));
    setLoading(false);
  }, [paginationModel.page, paginationModel.pageSize, sortModel, clearApproximation, requestApprox]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  React.useEffect(() => {
    const currentSortField = sortModel[0]?.field;
    if (!currentSortField || !columns.some((c) => c.field === currentSortField)) {
      setSortModel([{ field: columns[0]?.field ?? (generatedIdField as string) ?? "ID", sort: "asc" }]);
    }
  }, [columns]);

  const displayRows = React.useMemo(() => {
    return rows.map((row) => {
      const key = row.ID ?? row.id;
      const override = key == null ? null : approxOverrides[String(key)];
      const baseNPV = row.NPV == null ? null : Number(row.NPV);
      const baseParRate = row.ParRate == null ? null : Number(row.ParRate);
      return {
        ...row,
        __baseNPV: baseNPV,
        __baseParRate: baseParRate,
        ...(override || {}),
        id: row.id,
      };
    });
  }, [rows, approxOverrides]);

  return (
    <div className="h-[420px] border border-gray-800 rounded-md bg-gray-900 flex flex-col">
      {/* Controls bar (top) */}
      <div className="flex items-center justify-between gap-4 px-3 py-2 border-b border-gray-800 bg-gray-900">
        <div className="text-sm text-gray-300">Blotter</div>
        <div className="flex items-center gap-3 text-sm">
          <label className="text-gray-400">Rows per page</label>
          <select
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200"
            value={paginationModel.pageSize}
            onChange={(e) => setPaginationModel((m) => ({ ...m, pageSize: Number(e.target.value), page: 0 }))}
          >
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <button
              className="px-2 py-1 rounded bg-gray-800 border border-gray-700 text-gray-200 disabled:opacity-50"
              disabled={paginationModel.page <= 0}
              onClick={() => setPaginationModel((m) => ({ ...m, page: Math.max(0, m.page - 1) }))}
            >
              Prev
            </button>
            <button
              className="px-2 py-1 rounded bg-gray-800 border border-gray-700 text-gray-200 disabled:opacity-50"
              disabled={(paginationModel.page + 1) * paginationModel.pageSize >= rowCount}
              onClick={() => setPaginationModel((m) => ({ ...m, page: m.page + 1 }))}
            >
              Next
            </button>
            <span className="text-gray-400">
              {rowCount > 0
                ? `${paginationModel.page * paginationModel.pageSize + 1}–${Math.min((paginationModel.page + 1) * paginationModel.pageSize, rowCount)} of ${rowCount}`
                : '0 of 0'}
            </span>
          </div>
        </div>
      </div>

      {/* Grid (scrolls) */}
      <div className="flex-1 min-h-0">
        <DataGrid
          rows={displayRows}
          rowCount={rowCount}
          columns={columns}
          loading={loading}
          paginationMode="server"
          sortingMode="server"
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          sortModel={sortModel}
          onSortModelChange={setSortModel}
          pageSizeOptions={[10, 20, 50, 100]}
          getRowId={(row) => row.id}
          disableColumnMenu
          hideFooter
          sx={{
            color: '#e5e7eb',
            border: 0,
            '& .MuiDataGrid-columnHeaders': { backgroundColor: '#0b1220' },
            '& .MuiDataGrid-row': { backgroundColor: '#111827' },
            '& .MuiDataGrid-cell': { borderColor: '#1f2937' },
          }}
        />
      </div>
    </div>
  );
}

function SwapLink({ id }: { id: string | number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    // Prevent DataGrid from also handling this event
    e.stopPropagation();
    // @ts-ignore — hint MUI Grid that the event is handled
    (e as any).defaultMuiPrevented = true;
    const sp = new URLSearchParams(searchParams?.toString() || "");
    sp.set("swap", String(id));
    router.push(`${pathname}?${sp.toString()}`, { scroll: false });
  };
  return (
    <a href={`/swap/${id}`} onClick={onClick} className="text-blue-400 underline hover:text-blue-300">
      {String(id)}
    </a>
  );
}
