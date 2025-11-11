"use client";

import * as React from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import VerticalSplit from "@/components/VerticalSplit";
import HorizontalSplit from "@/components/HorizontalSplit";

type Row = { id: number; Term: string; Rate: number };

export default function DatafeedPage() {
  const workerRef = React.useRef<Worker | null>(null);
  const [data, setData] = React.useState<Array<{ Term: string; Rate: number }>>([]);
  const [ready, setReady] = React.useState(false);
  const [auto, setAuto] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [movedTerm, setMovedTerm] = React.useState<string | null>(null);
  const [moveDir, setMoveDir] = React.useState<"up" | "down" | "flat" | null>(null);
  const [seq, setSeq] = React.useState(0);

  React.useEffect(() => {
    const w = new Worker(new URL("../../workers/datafeed.worker.ts", import.meta.url));
    workerRef.current = w;
    w.onmessage = (e: MessageEvent) => {
      const msg = e.data || {};
      if (msg.type === "ready") {
        setReady(true);
        w.postMessage({ type: "get" });
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

  const simulateOnce = () => {
    workerRef.current?.postMessage({ type: "simulateOnce" });
  };

  const toggleAuto = () => {
    const now = !auto;
    setAuto(now);
    if (now) workerRef.current?.postMessage({ type: "startAuto", intervalMs: 100 });
    else workerRef.current?.postMessage({ type: "stopAuto" });
  };

  const Controls = (
    <div className="flex items-center justify-between mb-3">
      <div className="text-sm text-gray-400">
        {error ? <span className="text-red-500">{error}</span> : ready ? "datafeed ready" : "loading pyodide..."}
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={simulateOnce}
          className="inline-flex items-center rounded-md border border-orange-500/40 bg-orange-500/10 px-3 py-1.5 text-orange-300 hover:bg-orange-500/20 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
        >
          simulate market move
        </button>
        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
          <div className={`w-10 h-6 rounded-full p-1 transition-colors ${auto ? "bg-green-500" : "bg-gray-600"}`} onClick={toggleAuto}>
            <div className={`h-4 w-4 bg-white rounded-full transition-transform ${auto ? "translate-x-4" : "translate-x-0"}`} />
          </div>
          auto-run 1/s
        </label>
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
        <text dy={16} textAnchor="middle" className={cls} style={{ fontSize: 12 }}>
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

  const makeSeries = React.useCallback(() => Array.from({ length: 24 }, (_, i) => ({ x: i, y: Math.sin(i / 3) + Math.random() * 0.2 })), []);
  const [p1] = React.useState(makeSeries);
  const [p2] = React.useState(makeSeries);
  const [p3] = React.useState(makeSeries);

  const PlaceholderChart = ({ data }: { data: Array<{ x: number; y: number }> }) => (
    <div className="w-full rounded-lg border border-gray-800 bg-gray-900 p-3">
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="phFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="x" tick={{ fill: "#9ca3af", fontSize: 10 }} axisLine={{ stroke: "#374151" }} tickLine={{ stroke: "#374151" }} />
            <YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} axisLine={{ stroke: "#374151" }} tickLine={{ stroke: "#374151" }} />
            <Area type="monotone" dataKey="y" stroke="#60a5fa" strokeWidth={1.5} fill="url(#phFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  const RightPanel = (
    <div className="p-6 space-y-4 min-w-[260px]">
      <PlaceholderChart data={p1} />
      <PlaceholderChart data={p2} />
      <PlaceholderChart data={p3} />
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
