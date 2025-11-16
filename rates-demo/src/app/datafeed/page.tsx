"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { DataGrid, GridColDef, GridPaginationModel, GridSortModel } from "@mui/x-data-grid";
import { Slider } from "@mui/material";
import VerticalSplit from "@/components/VerticalSplit";
import HorizontalSplit from "@/components/HorizontalSplit";
import { columnsMeta as generatedColumns, idField as generatedIdField } from "@/generated/blotterColumns";
import Modal from "@/components/Modal";

type Row = { id: number; Term: string; Rate: number };
type ApiColumn = { field: string; type?: string };
type BlotterRow = Record<string, any> & { id: string | number };

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
  const randomWorkerRef = React.useRef<Worker | null>(null);
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
        console.log("[datafeed worker] ready");
        setReady(true);
        w.postMessage({ type: "get" });
        // start auto by default at 1 Hz
        const intervalMs = 1000; // 1 second
        w.postMessage({ type: "startAuto", intervalMs });
      } else if (msg.type === "data") {
        console.log("[datafeed worker] tick", msg.data?.length);
        setData(msg.data as Array<{ Term: string; Rate: number }>);
        if (msg.movedTerm) {
          setMovedTerm(msg.movedTerm as string);
          setMoveDir((msg.dir as any) || "flat");
          setSeq((s) => s + 1);
        }
      } else if (msg.type === "error") {
        setError(String(msg.error ?? "Unknown error"));
        console.error("[datafeed worker] error", msg.error);
      }
    };
    w.postMessage({ type: "init", baseUrl: "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/", pythonUrl: "/py/datafeed.py" });
    return () => {
      if (auto) w.postMessage({ type: "stopAuto" });
      w.terminate();
      workerRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    const w = new Worker(new URL("../../workers/random.worker.ts", import.meta.url));
    randomWorkerRef.current = w;
    w.onmessage = (e: MessageEvent) => {
      const msg = e.data || {};
      if (msg.type === "ready") {
        console.log("[random worker] ready");
      } else if (msg.type === "random") {
        console.log("[random worker] value", msg.value);
      } else if (msg.type === "log") {
        console.log(`[random worker] ${msg.message}`);
      } else if (msg.type === "error") {
        console.error("[random worker] error", msg.error);
      }
    };
    w.postMessage({ type: "init", baseUrl: "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/", randomUrl: "/py/random.py" });
    return () => {
      w.terminate();
      randomWorkerRef.current = null;
    };
  }, []);

  const rows: Row[] = React.useMemo(
    () => data.map((d, i) => ({ id: i, Term: d.Term, Rate: d.Rate })),
    [data]
  );
  const dataPct = React.useMemo(() => data.map(d => ({ Term: d.Term, RatePct: (d.Rate == null ? null : Number(d.Rate) * 100) })), [data]);

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
      <div className="w-full rounded-lg border border-gray-800 bg-gray-900 p-3">
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
      </div>

      {/* Market chart */}
      <div className="w-full rounded-lg border border-gray-800 bg-gray-900 p-3">
        <div className="h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dataPct} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
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
              <Area type="monotone" dataKey="RatePct" stroke="#f59e0b" strokeWidth={2} fill="url(#rateFill)" />
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
      <BlotterGrid />
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

function BlotterGrid() {
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
        if (c.field === "FixedRate" || c.field === "ParRate") {
          base.valueFormatter = (p: any) => (p.value == null ? "" : `${Number(p.value).toFixed(2)}%`);
          base.renderCell = (p: any) => <span>{p.value == null ? "" : `${Number(p.value).toFixed(2)}%`}</span>;
          base.align = "right";
        }
        if (c.field === "NPV") {
          base.valueFormatter = (p: any) => (p.value == null ? "" : `USD ${usd.format(Number(p.value)).replace("$", "$ ")}`);
          base.renderCell = (p: any) => <span>{p.value == null ? "" : `USD ${usd.format(Number(p.value)).replace("$", "$ ")}`}</span>;
          base.align = "right";
          base.width = 180;
        }
        if (c.field === "ParSpread") {
          base.valueFormatter = (p: any) => (p.value == null ? "" : `${Number(p.value).toFixed(2)} bp`);
          base.renderCell = (p: any) => <span>{p.value == null ? "" : `${Number(p.value).toFixed(2)} bp`}</span>;
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
    setLoading(false);
  }, [paginationModel.page, paginationModel.pageSize, sortModel]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  React.useEffect(() => {
    const currentSortField = sortModel[0]?.field;
    if (!currentSortField || !columns.some((c) => c.field === currentSortField)) {
      setSortModel([{ field: columns[0]?.field ?? (generatedIdField as string) ?? "ID", sort: "asc" }]);
    }
  }, [columns]);

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
          rows={rows}
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
