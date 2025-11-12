"use client";

import * as React from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import { Slider } from "@mui/material";
import VerticalSplit from "@/components/VerticalSplit";
import HorizontalSplit from "@/components/HorizontalSplit";

type Row = { id: number; Term: string; Rate: number };

export default function DatafeedPage() {
  const workerRef = React.useRef<Worker | null>(null);
  const [data, setData] = React.useState<Array<{ Term: string; Rate: number }>>([]);
  const [ready, setReady] = React.useState(false);
  const [auto, setAuto] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [movedTerm, setMovedTerm] = React.useState<string | null>(null);
  const [moveDir, setMoveDir] = React.useState<"up" | "down" | "flat" | null>(null);
  const [seq, setSeq] = React.useState(0);
  const [fps, setFps] = React.useState(1); // ticks per second

  React.useEffect(() => {
    const w = new Worker(new URL("../../workers/datafeed.worker.ts", import.meta.url));
    workerRef.current = w;
    w.onmessage = (e: MessageEvent) => {
      const msg = e.data || {};
      if (msg.type === "ready") {
        setReady(true);
        w.postMessage({ type: "get" });
        // start auto by default at 1 Hz
        const intervalMs = 1000; // 1 second
        w.postMessage({ type: "startAuto", intervalMs });
      } else if (msg.type === "data") {
        setData(msg.data as Array<{ Term: string; Rate: number }>);
        if (msg.movedTerm) {
          setMovedTerm(msg.movedTerm as string);
          setMoveDir((msg.dir as any) || "flat");
          setSeq((s) => s + 1);
        }
      } else if (msg.type === "error") {
        setError(String(msg.error ?? "Unknown error"));
      }
    };
    w.postMessage({ type: "init", baseUrl: "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/", pythonUrl: "/py/datafeed.py" });
    return () => {
      if (auto) w.postMessage({ type: "stopAuto" });
      w.terminate();
      workerRef.current = null;
    };
  }, []);

  const rows: Row[] = React.useMemo(
    () => data.map((d, i) => ({ id: i, Term: d.Term, Rate: d.Rate })),
    [data]
  );

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
        return (
          <div className="flex items-center gap-1">
            {isMoved && arrow && (
              <span className={dir === "up" ? "text-green-400" : "text-red-400"}>
                {arrow}
              </span>
            )}
            <span key={`${term}-${seq}`} className={`font-mono ${cls}`}>
              {typeof params.value === "number" ? (params.value as number).toFixed(3) : params.value}
            </span>
          </div>
        );
      },
    },
  ];

  const toggleAuto = () => {
    const now = !auto;
    setAuto(now);
    const intervalMs = Math.max(100, Math.round(1000 / Math.max(1, Math.min(10, fps))))
    if (now) workerRef.current?.postMessage({ type: "startAuto", intervalMs });
    else workerRef.current?.postMessage({ type: "stopAuto" });
  };

  const onFpsChange = (_: Event, val: number | number[]) => {
    const v = Array.isArray(val) ? val[0] : val;
    setFps(v);
    const intervalMs = Math.max(100, Math.round(1000 / Math.max(1, Math.min(10, v))));
    workerRef.current?.postMessage({ type: auto ? "updateInterval" : "noop", intervalMs });
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
    const cls = isMoved ? (moveDir === "up" ? "flash-up" : moveDir === "down" ? "flash-down" : "") : "";
    return (
      <g transform={`translate(${x},${y})`} key={`${label}-${seq}`}>
        <text dy={16} textAnchor="middle" className={cls} style={{ fontSize: 12, fill: '#e5e7eb' }}>
          {label}
        </text>
      </g>
    );
  };

  const LeftPanel = (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">this is a datafeed</h1>
      <div className="w-full rounded-lg border border-gray-800 bg-gray-900 p-3">
        {Controls}
        <div className="h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="rateFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="Term" tick={<CustomXAxisTick />} axisLine={{ stroke: "#374151" }} tickLine={{ stroke: "#374151" }} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} axisLine={{ stroke: "#374151" }} tickLine={{ stroke: "#374151" }} domain={["dataMin - 0.2", "dataMax + 0.2"]} />
              <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", color: "#e5e7eb" }} />
              <Area type="monotone" dataKey="Rate" stroke="#f59e0b" strokeWidth={2} fill="url(#rateFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
        <div className="h-[460px]">
          <DataGrid
            rows={rows}
            columns={columns}
            disableColumnMenu
            hideFooterSelectedRowCount
            initialState={{ pagination: { paginationModel: { pageSize: 20, page: 0 } } }}
            pageSizeOptions={[10, 20, 50]}
            sx={{
              color: "#e5e7eb",
              border: 0,
              "& .MuiDataGrid-columnHeaders": { backgroundColor: "#0b1220" },
              "& .MuiDataGrid-row": { backgroundColor: "#111827" },
              "& .MuiDataGrid-cell": { borderColor: "#1f2937" },
              "& .MuiDataGrid-footerContainer": { backgroundColor: "#0b1220" },
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

  const RightPanel = (
    <div className="p-6 space-y-4 min-w-[320px]">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-400">{calibErr ? <span className="text-red-500">{calibErr}</span> : calibReady ? "calibration ready" : "loading rateslib..."}</div>
        <button onClick={recalibrate} disabled={!calibReady || calibrating} className="inline-flex items-center rounded-md border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-blue-300 hover:bg-blue-500/20 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50">
          {calibrating ? "recalibrating..." : "recalibrate"}
        </button>
      </div>

      <div className="w-full rounded-lg border border-gray-800 bg-gray-900 p-3">
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
              <Area type="monotone" dataKey="df" stroke="#a78bfa" strokeWidth={1.5} fill="url(#dfFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="w-full rounded-lg border border-gray-800 bg-gray-900 p-3">
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
              <Area type="monotone" dataKey="zero_rate" stroke="#34d399" strokeWidth={1.5} fill="url(#zrFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="w-full rounded-lg border border-gray-800 bg-gray-900 p-3">
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
              <Area type="stepAfter" dataKey="forward_rate" stroke="#f59e0b" strokeWidth={1.5} fill="url(#fwFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );

  const Top = (
    <HorizontalSplit left={LeftPanel} right={RightPanel} initialLeftPct={0.62} />
  );

  const Bottom = (
    <div className="p-4">
      <div className="max-w-3xl text-sm text-gray-300">
        This area is for explanatory text. It is visually separated to emphasize the upper app as a standalone module. Use the handle to resize vertically.
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <VerticalSplit top={Top} bottom={Bottom} initialTopHeight={520} />
    </div>
  );
}
