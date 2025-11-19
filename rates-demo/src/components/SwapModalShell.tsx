"use client";

import * as React from "react";
import { GridColDef } from "@mui/x-data-grid";

export type BlotterRow = Record<string, unknown> & { id: string | number };

type SwapModalShellProps = {
  swapId: string;
  onClose: () => void;
  swapRow: BlotterRow | null;
  riskRow: any;
  modalApprox: any;
};

export function SwapModalShell({ swapId, onClose, swapRow, riskRow: _riskRow, modalApprox }: SwapModalShellProps) {
  const [tab, setTab] = React.useState<"pricing" | "cashflows" | "fixings" | "risk">("pricing");
  React.useEffect(() => { setTab("pricing"); }, [swapId]);

  const counterparty = (swapRow as any)?.CounterpartyID ?? "—";
  const notional = swapRow?.Notional == null ? null : Math.abs(Number(swapRow.Notional));
  const startDate = swapRow && swapRow.StartDate ? new Date(String(swapRow.StartDate)) : null;
  const maturityDate = swapRow && swapRow.TerminationDate ? new Date(String(swapRow.TerminationDate)) : null;
  const fixedRate = swapRow?.FixedRate == null ? null : Number(swapRow.FixedRate);
  const liveNPV = modalApprox?.NPV as number | null | undefined;
  const livePar = modalApprox?.ParRate as number | null | undefined;
  const fmtUsd = (v: number | null | undefined) => v == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(v).replace("$", "$ ");
  const fmtPct = (v: number | null | undefined) => v == null ? "—" : `${Number(v).toFixed(2)}%`;
  const fmtDate = (d: Date | null) => {
    if (!d || isNaN(d.getTime())) return "—";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const InfoRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex flex-col">
      <span className="text-xs uppercase tracking-wide text-gray-500">{label}</span>
      <span className="text-sm text-gray-100">{value}</span>
    </div>
  );

  const TabButton = ({ id, label }: { id: "pricing" | "cashflows" | "fixings" | "risk"; label: string }) => (
    <button
      onClick={() => setTab(id)}
      className={`px-3 py-2 text-sm rounded-md border ${tab === id ? "border-amber-400 text-amber-300 bg-gray-800" : "border-gray-800 text-gray-400 hover:text-gray-200"}`}
    >
      {label}
    </button>
  );

  const riskRow = React.useMemo(() => {
    if (!_riskRow) return null;
    const out: Record<string, any> = {};
    Object.entries(_riskRow).forEach(([k, v]) => {
      out[k] = typeof v === "bigint" ? Number(v) : v;
    });
    return out;
  }, [_riskRow]);

  const riskGrid = React.useMemo(() => {
    if (!riskRow) return { cols: [], rows: [], dvo1: 0 };
    const entries: Array<{ term: string; exposure: number }> = [];
    Object.entries(riskRow).forEach(([key, val]) => {
      if (key === "R" || key === "PricingTime" || key === "z" || key.toLowerCase() === "rowtype" || key.toLowerCase() === "id") return;
      const num = typeof val === "number" ? val : Number(val);
      if (!Number.isFinite(num) || Number.isNaN(num) || Math.abs(num) < 1e-4 || num === 0) return;
      const term = key.startsWith("c_") ? key.slice(2) : key;
      entries.push({ term, exposure: num });
    });
    const cols: GridColDef<any>[] = [
      { field: "term", headerName: "Term", width: 120 },
      { field: "exposure", headerName: "Exposure", type: "number", width: 140 },
    ];
    const rows = entries.map((e, idx) => ({ id: idx, ...e }));
    const dvo1 = entries.reduce((acc, e) => acc + (Number.isFinite(e.exposure) ? e.exposure : 0), 0);
    return { cols, rows, dvo1 };
  }, [riskRow]);

  const renderTicker = (label: string, baseVal: number | null | undefined, liveVal: number | null | undefined, fmt: (n: number) => string) => {
    const base = baseVal == null ? null : Number(baseVal);
    const live = liveVal == null ? null : Number(liveVal);
    const delta = base == null || live == null ? 0 : live - base;
    const dir = delta > 1e-6 ? "up" : delta < -1e-6 ? "down" : "flat";
    const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "";
    const color = dir === "up" ? "text-green-400" : dir === "down" ? "text-red-400" : "text-gray-200";
    return (
      <div className={`flex items-center gap-1 text-sm ${color}`}>
        <span className="uppercase text-[11px] tracking-wide text-gray-500">{label}</span>
        {arrow && <span>{arrow}</span>}
        <span className="font-mono">{live == null ? "—" : fmt(live)}</span>
      </div>
    );
  };

  return (
    <div className="space-y-4 text-sm text-gray-200">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="text-lg font-semibold">Swap {swapId}</div>
            <span className="text-xs rounded-full bg-gray-800 border border-gray-700 px-2 py-0.5 text-gray-300">live</span>
            {swapRow && (
              <div className="flex items-center gap-3">
                {renderTicker("NPV", swapRow.NPV as number | null | undefined, liveNPV, fmtUsd)}
                {renderTicker("PAR", swapRow.ParRate as number | null | undefined, livePar, fmtPct)}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <InfoRow label="Notional" value={fmtUsd(notional)} />
            <InfoRow label="Counterparty" value={counterparty} />
            <InfoRow label="Start date" value={fmtDate(startDate)} />
            <InfoRow label="Maturity" value={fmtDate(maturityDate)} />
            <InfoRow label="Fixed rate" value={fmtPct(fixedRate)} />
            <InfoRow label="Swap type" value={(swapRow as any)?.SwapType ?? "SOFR"} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-1.5 rounded-md border border-gray-700 bg-gray-800 text-gray-100 hover:bg-gray-700">Full reval</button>
          <button onClick={onClose} className="px-3 py-1.5 rounded-md border border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800">Close</button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <TabButton id="pricing" label="Pricing summary" />
        <TabButton id="cashflows" label="Cashflows" />
        <TabButton id="fixings" label="Fixings" />
        <TabButton id="risk" label="Risk" />
      </div>

      <div className="border border-gray-800 rounded-md bg-gray-900 p-4 min-h-[260px]">
        {tab === "pricing" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="border border-gray-800 rounded-md p-3 bg-gray-950">
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">PV summary</div>
              <div className="space-y-1">
                <InfoRow label="NPV" value={renderTicker("NPV", swapRow?.NPV as number | null | undefined, liveNPV, fmtUsd)} />
                <InfoRow label="Par rate" value={renderTicker("Par", swapRow?.ParRate as number | null | undefined, livePar, fmtPct)} />
                <InfoRow label="Notional" value={fmtUsd(notional)} />
              </div>
            </div>
            <div className="border border-gray-800 rounded-md p-3 bg-gray-950">
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Details</div>
              <div className="grid grid-cols-2 gap-2">
                <InfoRow label="Start date" value={fmtDate(startDate)} />
                <InfoRow label="Maturity" value={fmtDate(maturityDate)} />
                <InfoRow label="Fixed rate" value={fmtPct(fixedRate)} />
                <InfoRow label="Swap type" value={(swapRow as any)?.SwapType ?? "SOFR"} />
              </div>
            </div>
          </div>
        )}

        {tab === "risk" && (
          <div className="space-y-3">
            <div className="text-xs uppercase tracking-wide text-gray-500">Risk by tenor</div>
            <div className="text-sm text-gray-200">
              dvo1: <span className="font-mono text-amber-300">{(riskGrid.dvo1 ?? 0).toFixed(2)}</span>
            </div>
            <div className="h-64 overflow-auto rounded-md border border-gray-800 bg-gray-950/60">
              <DataGridLike rows={riskGrid.rows} cols={riskGrid.cols} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DataGridLike({ rows, cols }: { rows: any[]; cols: GridColDef<any>[] }) {
  return (
    <table className="w-full text-sm text-gray-200 border border-gray-800 rounded-md">
      <thead className="bg-gray-900 border-b border-gray-800 sticky top-0 z-10">
        <tr>
          {cols.map((c) => (
            <th key={c.field} className="px-3 py-2 text-left font-medium text-gray-300">{c.headerName ?? c.field}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-gray-800">
            {cols.map((c) => (
              <td key={c.field} className="px-3 py-2">
                {String((r as any)[c.field] ?? "")}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
