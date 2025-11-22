"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { buildRiskSeries } from "@/lib/riskSeries";
import { RiskBarChart } from "./RiskBarChart";
import { CopyTableButton, tableToTsv, getTableDragHandlers } from "./TableExportControls";

export type BlotterRow = Record<string, unknown> & { id: string | number };

type FloatFixingsState = {
  index: number | null;
  columns: string[];
  rows: any[];
  cashflow?: Record<string, any> | null;
  loading?: boolean;
};

type SwapModalShellProps = {
  swapId: string;
  onClose: () => void;
  swapRow: BlotterRow | null;
  riskData?: any;
  modalApprox: any;
  onFullReval?: () => void;
  fixedFlows?: any[];
  floatFlows?: any[];
  floatFixings?: FloatFixingsState | null;
  onRequestFloatFixings?: (index: number | null) => void;
  onRequestTermsheet?: () => void;
  termsheetLoading?: boolean;
};

export function SwapModalShell({
  swapId,
  onClose,
  swapRow,
  riskData,
  modalApprox,
  onFullReval,
  fixedFlows = [],
  floatFlows = [],
  floatFixings = null,
  onRequestFloatFixings,
  onRequestTermsheet,
  termsheetLoading,
}: SwapModalShellProps) {
  const [tab, setTab] = React.useState<"pricing" | "cashflows" | "fixings" | "risk">("pricing");
  React.useEffect(() => { setTab("pricing"); }, [swapId]);
  const [cashflowSubTab, setCashflowSubTab] = React.useState<"floating" | "fixed">("floating");
  React.useEffect(() => {
    if (tab !== "cashflows") setCashflowSubTab("floating");
  }, [tab]);

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const renderCounterpartyLink = () => {
    if (!counterparty || counterparty === "—") return counterparty;
    const createHref = () => {
      const sp = new URLSearchParams(searchParams?.toString() || "");
      sp.delete("swap");
      sp.set("counterparty", String(counterparty));
      const qs = sp.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    };
    const onClick = (e: React.MouseEvent) => {
      e.preventDefault();
      router.push(createHref(), { scroll: false });
    };
    return (
      <a href={createHref()} onClick={onClick} className="text-amber-300 underline hover:text-amber-100">
        {counterparty}
      </a>
    );
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
    if (!riskData) return null;
    const out: Record<string, any> = {};
    Object.entries(riskData).forEach(([k, v]) => {
      out[k] = typeof v === "bigint" ? Number(v) : v;
    });
    return out;
  }, [riskData]);

  const riskSeries = React.useMemo(() => buildRiskSeries(riskRow), [riskRow]);

  const renderTicker = (label: string, baseVal: number | null | undefined, liveVal: number | null | undefined, fmt: (n: number) => string, minimal?: boolean) => {
    const base = baseVal == null ? null : Number(baseVal);
    const live = liveVal == null ? null : Number(liveVal);
    const delta = base == null || live == null ? 0 : live - base;
    const dir = delta > 1e-6 ? "up" : delta < -1e-6 ? "down" : "flat";
    const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "";
    const color = dir === "up" ? "text-green-400" : dir === "down" ? "text-red-400" : "text-gray-200";
    return (
      <div className={`flex items-center ${minimal ? "gap-1 text-xs" : "gap-1 text-sm"} ${color}`}>
        {!minimal && <span className="uppercase text-[11px] tracking-wide text-gray-500">{label}</span>}
        <span className="inline-block w-4 text-center">{arrow || ""}</span>
        <span className={`font-mono ${minimal ? "min-w-[5rem] text-right" : ""}`}>{live == null ? "—" : fmt(live)}</span>
      </div>
    );
  };
  const formatFlowValue = (v: any) => {
    if (typeof v === "number") {
      if (Math.abs(v) >= 1e4) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
      if (Math.abs(v) < 1e-4 && v !== 0) return v.toExponential(4);
      return v.toFixed(6).replace(/0+$/, "").replace(/\.$/, "") || "0";
    }
    return v == null ? "" : String(v);
  };

  const prevFixedFlowsRef = React.useRef<Record<string, number>>({});
  const prevFloatFlowsRef = React.useRef<Record<string, number>>({});
  const prevFixingsRef = React.useRef<Record<string, number>>({});
  const prevTotalFixedNPVRef = React.useRef<number | null>(null);
  const prevTotalFloatNPVRef = React.useRef<number | null>(null);
  const fixedFlowColumns = React.useMemo(() => {
    if (!fixedFlows || !fixedFlows.length) return [];
    return Object.keys(fixedFlows[0]);
  }, [fixedFlows]);
  const floatFlowColumns = React.useMemo(() => {
    if (!floatFlows || !floatFlows.length) {
      return floatFixings?.cashflow ? Object.keys(floatFixings.cashflow) : [];
    }
    const cols = [...Object.keys(floatFlows[0])];
    if (floatFixings?.cashflow) {
      Object.keys(floatFixings.cashflow).forEach((key) => {
        if (!cols.includes(key)) cols.push(key);
      });
    }
    return cols;
  }, [floatFlows, floatFixings]);
  const floatRowsForDisplay = React.useMemo(() => {
    if (!floatFlows || !floatFlows.length) return [];
    const activeIdx = typeof floatFixings?.index === "number" ? floatFixings.index : null;
    const overrideRow = floatFixings?.cashflow && typeof floatFixings.cashflow === "object" ? floatFixings.cashflow : null;
    if (activeIdx == null || !overrideRow) return floatFlows;
    return floatFlows.map((row, idx) => (idx === activeIdx ? { ...row, ...overrideRow } : row));
  }, [floatFlows, floatFixings]);
  const annotatedFixedFlows = React.useMemo(
    () => annotateFlowRows(fixedFlows, fixedFlowColumns, prevFixedFlowsRef),
    [fixedFlows, fixedFlowColumns]
  );
  const annotatedFloatFlows = React.useMemo(
    () => annotateFlowRows(floatRowsForDisplay, floatFlowColumns, prevFloatFlowsRef),
    [floatRowsForDisplay, floatFlowColumns]
  );
  const totalFixedNPV = React.useMemo(() => {
    return annotatedFixedFlows.reduce((sum, row) => {
      const val = row?.NPV;
      return sum + (typeof val === "number" ? val : 0);
    }, 0);
  }, [annotatedFixedFlows]);
  const totalFloatNPV = React.useMemo(() => {
    return annotatedFloatFlows.reduce((sum, row) => {
      const val = row?.NPV;
      return sum + (typeof val === "number" ? val : 0);
    }, 0);
  }, [annotatedFloatFlows]);
  const legNPVBase = React.useMemo(() => {
    const prev = prevTotalFixedNPVRef.current;
    prevTotalFixedNPVRef.current = totalFixedNPV;
    return prev ?? totalFixedNPV;
  }, [totalFixedNPV]);
  const floatNPVBase = React.useMemo(() => {
    const prev = prevTotalFloatNPVRef.current;
    prevTotalFloatNPVRef.current = totalFloatNPV;
    return prev ?? totalFloatNPV;
  }, [totalFloatNPV]);
  const activeFixingsIndex = typeof floatFixings?.index === "number" ? floatFixings.index : null;
  const handleFloatRowClick = React.useCallback((rowIdx: number) => {
    if (!onRequestFloatFixings) return;
    if (activeFixingsIndex === rowIdx) {
      onRequestFloatFixings(null);
    } else {
      onRequestFloatFixings(rowIdx);
    }
  }, [onRequestFloatFixings, activeFixingsIndex]);
  const renderFixingsTable = React.useCallback(() => {
    if (!floatFixings) return null;
    if (floatFixings.loading) {
      return <div className="text-xs text-gray-400">Loading fixings...</div>;
    }
    const rows = Array.isArray(floatFixings.rows) ? floatFixings.rows : [];
    const columns = (Array.isArray(floatFixings.columns) && floatFixings.columns.length)
      ? floatFixings.columns
      : (rows.length ? Object.keys(rows[0]) : []);
    if (!columns.length) {
      return <div className="text-xs text-gray-500">No fixings available.</div>;
    }
    const annotatedRows = annotateFixingsRows(rows, columns, prevFixingsRef);
    const table = (
      <div className="max-h-48 overflow-auto border border-gray-800 rounded-md bg-gray-950/80">
        <table className="w-full text-[11px] text-gray-200">
          <thead className="bg-gray-900 border-b border-gray-800 sticky top-0">
            <tr>
              {columns.map((col) => (
                <th key={col} className="px-2 py-1 text-left font-medium text-gray-300">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((fixRow, idx) => (
              <tr key={idx} className="border-b border-gray-800">
                {columns.map((col) => {
                  const rawVal = fixRow?.[col];
                  const normalized = normalizeColumnKey(col);
                  const isTicker = TICKING_FIXING_COLUMNS.has(normalized);
                  const displayVal = formatFlowValue(rawVal);
                  const delta = annotatedRows[idx]?.__delta?.[col] ?? "flat";
                  const arrow = delta === "up" ? "▲" : delta === "down" ? "▼" : "";
                  const color = delta === "up" ? "text-green-400" : delta === "down" ? "text-red-400" : "text-gray-200";
                  const flash = delta === "up" ? "flash-up" : delta === "down" ? "flash-down" : "";
                  return (
                    <td key={col} className={`px-2 py-1 whitespace-nowrap font-mono ${color} ${flash}`}>
                      {isTicker ? (
                        <span className="flex items-center gap-1">
                          <span className="inline-block w-4 text-center">{arrow}</span>
                          <span>{displayVal}</span>
                        </span>
                      ) : (
                        displayVal
                      )}
                    </td>
                  );
                })}
              </tr>
            )) : (
              <tr>
                <td colSpan={columns.length} className="px-2 py-2 text-center text-gray-500 text-xs">No fixings rows.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
    return table;
  }, [floatFixings, prevFixingsRef]);

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
            <InfoRow label="Counterparty" value={renderCounterpartyLink()} />
            <InfoRow label="Start date" value={fmtDate(startDate)} />
            <InfoRow label="Maturity" value={fmtDate(maturityDate)} />
            <InfoRow label="Fixed rate" value={fmtPct(fixedRate)} />
            <InfoRow label="Swap type" value={(swapRow as any)?.SwapType ?? "SOFR"} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onFullReval}
            disabled={!onFullReval}
            className="px-3 py-1.5 rounded-md border border-gray-700 bg-gray-800 text-gray-100 hover:bg-gray-700 disabled:opacity-50"
          >
            Full reval
          </button>
          <button onClick={onClose} className="px-3 py-1.5 rounded-md border border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800">Close</button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <TabButton id="pricing" label="Pricing summary" />
        <TabButton id="cashflows" label="Cashflows" />
        <TabButton id="risk" label="Risk" />
      </div>

      <div className="border border-gray-800 rounded-md bg-gray-900 p-4 h-[360px] overflow-auto">
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
              <button
                type="button"
                onClick={onRequestTermsheet}
                disabled={!onRequestTermsheet || termsheetLoading}
                className="mt-3 flex items-center gap-1 text-xs text-amber-300 hover:text-amber-100 disabled:opacity-50"
              >
                {termsheetLoading ? (
                  <span>Generating termsheet…</span>
                ) : (
                  <>
                    <span>Open termsheet</span>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M12.5 3a.5.5 0 000 1h3.793l-7.146 7.146a.5.5 0 10.707.707L17 4.707V8.5a.5.5 0 001 0V3.5a.5.5 0 00-.5-.5H12.5z" />
                      <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3.5a.5.5 0 00-1 0V15a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h3.5a.5.5 0 000-1H5z" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {tab === "cashflows" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCashflowSubTab("floating")}
                className={`px-3 py-1.5 text-sm rounded-md border ${cashflowSubTab === "floating" ? "border-amber-400 text-amber-200" : "border-gray-700 text-gray-400"}`}
              >
                Floating
              </button>
              <button
                onClick={() => setCashflowSubTab("fixed")}
                className={`px-3 py-1.5 text-sm rounded-md border ${cashflowSubTab === "fixed" ? "border-amber-400 text-amber-200" : "border-gray-700 text-gray-400"}`}
              >
                Fixed
              </button>
            </div>
            {cashflowSubTab === "floating" ? (
              <>
                <div className="flex items-center justify-between text-xs uppercase tracking-wide text-gray-500">
                  <div>Floating leg cashflows</div>
                  <CopyTableButton getText={() => tableToTsv(floatFlowColumns, floatRowsForDisplay)} />
                </div>
                <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-amber-900 dark:text-amber-100 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/40 rounded-md">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-200 dark:bg-amber-500/30 text-amber-800 dark:text-amber-100 text-[10px] font-semibold">i</span>
                  <span className="text-amber-900 dark:text-amber-100">Click a floating cashflow row to view its fixing risk.</span>
                </div>
                <div className="text-sm text-gray-200 flex items-center gap-2">
                  <span className="text-gray-400">Leg NPV</span>
                  {renderTicker("", floatNPVBase, totalFloatNPV, (v) => formatFlowValue(v), true)}
                </div>
                <div className="h-64 overflow-auto rounded-md border border-gray-800 bg-gray-950/60" {...getTableDragHandlers(() => tableToTsv(floatFlowColumns, floatRowsForDisplay))}>
                  <table className="w-full text-xs text-gray-200">
                    <thead className="sticky top-0 bg-gray-900 border-b border-gray-800">
                      <tr>
                        {floatFlowColumns.map((col) => (
                          <th key={col} className="px-3 py-2 text-left font-medium text-gray-300">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {annotatedFloatFlows.length ? annotatedFloatFlows.map((row, idx) => {
                        const rowActive = activeFixingsIndex === idx;
                        const clickable = Boolean(onRequestFloatFixings);
                        return (
                          <React.Fragment key={idx}>
                            <tr
                              className={`border-b border-gray-800 ${clickable ? "cursor-pointer hover:bg-gray-800/30" : ""} ${rowActive ? "bg-gray-800/40" : ""}`}
                              onClick={clickable ? () => handleFloatRowClick(idx) : undefined}
                            >
                              {floatFlowColumns.map((col) => {
                                const val = row[col];
                                const delta = row.__delta?.[col] ?? "flat";
                                const color = delta === "up" ? "text-green-400" : delta === "down" ? "text-red-400" : "text-gray-200";
                                const flash = delta === "up" ? "flash-up" : delta === "down" ? "flash-down" : "";
                                const arrow = delta === "up" ? "▲" : delta === "down" ? "▼" : "";
                                const isValueCol = isHighlightedFlowColumn(col, FLOAT_VALUE_COLUMNS);
                                return (
                                  <td
                                    key={col}
                                    className={`px-3 py-2 whitespace-nowrap font-mono ${color} ${flash} ${isValueCol ? "w-32" : ""}`}
                                  >
                                    {isValueCol ? (
                                      <span className="flex items-center justify-end gap-1 w-full">
                                        <span className="inline-block w-4 text-center">{arrow || ""}</span>
                                        <span className="inline-block min-w-[6rem] text-right">{formatFlowValue(val)}</span>
                                      </span>
                                    ) : (
                                      <span className="flex items-center gap-1">
                                        <span className="inline-block w-4 text-center">{arrow || ""}</span>
                                        <span>{formatFlowValue(val)}</span>
                                      </span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                            {rowActive && (
                              <tr className="border-b border-gray-900 bg-gray-950/70">
                                <td colSpan={floatFlowColumns.length || 1} className="px-3 py-2">
                                  {renderFixingsTable()}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      }) : (
                        <tr>
                          <td colSpan={floatFlowColumns.length || 1} className="px-3 py-4 text-center text-gray-500">No floating cashflows available.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs uppercase tracking-wide text-gray-500">
                  <div>Fixed leg cashflows</div>
                  <CopyTableButton getText={() => tableToTsv(fixedFlowColumns, fixedFlows)} />
                </div>
                <div className="text-sm text-gray-200 flex items-center gap-2">
                  <span className="text-gray-400">Leg NPV</span>
                  {renderTicker("", legNPVBase, totalFixedNPV, (v) => formatFlowValue(v), true)}
                </div>
                <div className="h-64 overflow-auto rounded-md border border-gray-800 bg-gray-950/60" {...getTableDragHandlers(() => tableToTsv(fixedFlowColumns, fixedFlows))}>
                  <table className="w-full text-xs text-gray-200">
                  <thead className="sticky top-0 bg-gray-900 border-b border-gray-800">
                    <tr>
                      {fixedFlowColumns.map((col) => (
                        <th key={col} className="px-3 py-2 text-left font-medium text-gray-300">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {annotatedFixedFlows.length ? annotatedFixedFlows.map((row, idx) => (
                      <tr key={idx} className="border-b border-gray-800">
                        {fixedFlowColumns.map((col) => {
                          const val = row[col];
                          const delta = row.__delta?.[col] ?? "flat";
                          const color = delta === "up" ? "text-green-400" : delta === "down" ? "text-red-400" : "text-gray-200";
                          const flash = delta === "up" ? "flash-up" : delta === "down" ? "flash-down" : "";
                          const arrow = delta === "up" ? "▲" : delta === "down" ? "▼" : "";
                          const isValueCol = isHighlightedFlowColumn(col, FIXED_VALUE_COLUMNS);
                          return (
                            <td
                              key={col}
                              className={`px-3 py-2 whitespace-nowrap font-mono ${color} ${flash} ${isValueCol ? "w-32" : ""}`}
                            >
                              {isValueCol ? (
                                <span className="flex items-center justify-end gap-1 w-full">
                                  <span className="inline-block w-4 text-center">{arrow || ""}</span>
                                  <span className="inline-block min-w-[6rem] text-right">{formatFlowValue(val)}</span>
                                </span>
                              ) : (
                                <span className="flex items-center gap-1">
                                  <span className="inline-block w-4 text-center">{arrow || ""}</span>
                                  <span>{formatFlowValue(val)}</span>
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={fixedFlowColumns.length || 1} className="px-3 py-4 text-center text-gray-500">No fixed cashflows available.</td>
                      </tr>
                    )}
                  </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {tab === "risk" && (
          <div className="space-y-3">
            <div className="text-xs uppercase tracking-wide text-gray-500">Risk by tenor</div>
            <div className="text-sm text-gray-200">
              dvo1: <span className="font-mono text-amber-300">{(riskSeries.dvo1 ?? 0).toFixed(2)}</span>
            </div>
            <div className="h-64 rounded-md border border-gray-800 bg-gray-950/60 p-3">
              <RiskBarChart exposures={riskSeries.exposures} height="100%" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const FIXED_VALUE_COLUMNS = new Set<string>(["npv", "discount factor"]);
const FLOAT_VALUE_COLUMNS = new Set<string>(["npv", "discount factor", "rate", "cashflow"]);
const TICKING_FIXING_COLUMNS = new Set<string>(["fixing", "hedgingnotional"]);

function normalizeColumnKey(col: string) {
  return (col || "").toLowerCase().replace(/[\s_]/g, "");
}

function isHighlightedFlowColumn(col: string, targets: Set<string>) {
  if (!col) return false;
  return targets.has(col.toLowerCase());
}

function annotateFlowRows(
  flows: any[] = [],
  columns: string[] = [],
  prevRef: React.MutableRefObject<Record<string, number>>
) {
  const rows: Array<Record<string, any>> = [];
  const nextPrev: Record<string, number> = {};
  flows.forEach((row = {}, idx) => {
    const entry: Record<string, any> = { ...row, __delta: {} };
    columns.forEach((col) => {
      const val = row?.[col];
      if (typeof val === "number") {
        const key = `${idx}-${col}`;
        const prev = prevRef.current[key];
        let dir: "up" | "down" | "flat" = "flat";
        if (prev != null) {
          if (val > prev + 1e-10) dir = "up";
          else if (val < prev - 1e-10) dir = "down";
        }
        entry.__delta[col] = dir;
        nextPrev[key] = val;
      }
    });
    rows.push(entry);
  });
  prevRef.current = nextPrev;
  return rows;
}

function annotateFixingsRows(
  rows: any[],
  columns: string[],
  prevRef: React.MutableRefObject<Record<string, number>>
) {
  const nextPrev: Record<string, number> = {};
  const annotated = rows.map((row = {}, rowIdx) => {
    const entry: Record<string, any> = { ...row, __delta: {} };
    columns.forEach((col) => {
      const normalized = normalizeColumnKey(col);
      if (!TICKING_FIXING_COLUMNS.has(normalized)) return;
      const val = row?.[col];
      const num = coerceNumber(val);
      if (num == null) return;
      const key = `${rowIdx}-${normalized}`;
      const prev = prevRef.current[key];
      let dir: "up" | "down" | "flat" = "flat";
      if (prev != null) {
        if (num > prev + 1e-10) dir = "up";
        else if (num < prev - 1e-10) dir = "down";
      }
      entry.__delta[col] = dir;
      nextPrev[key] = num;
    });
    return entry;
  });
  prevRef.current = nextPrev;
  return annotated;
}

function coerceNumber(val: any): number | null {
  if (typeof val === "number") {
    return Number.isFinite(val) ? val : null;
  }
  if (typeof val === "bigint") {
    return Number(val);
  }
  if (typeof val === "string") {
    const cleaned = val.replace(/[^0-9eE+.-]/g, "");
    if (!cleaned) return null;
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}
