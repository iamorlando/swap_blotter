"use client";

import * as React from "react";
import { GridColDef } from "@mui/x-data-grid";

export function tableToTsv(columns: Array<string | GridColDef<any>>, rows: any[]): string {
  if (!columns || !columns.length || !rows || !rows.length) return "";
  const headers = columns.map((col) => (typeof col === "string" ? col : (col.headerName || col.field || "")));
  const body = rows.map((row) =>
    columns.map((col) => {
      const key = typeof col === "string" ? col : col.field;
      const raw = (row as any)[key];
      if (raw == null) return "";
      return String(raw).replace(/\t/g, " ").replace(/\r?\n/g, " ");
    }).join("\t")
  );
  return [headers.join("\t"), ...body].join("\n");
}

export function CopyTableButton({ getText, className }: { getText: () => string | null | undefined; className?: string }) {
  const [copied, setCopied] = React.useState(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const performCopy = React.useCallback(async () => {
    const txt = getText?.() ?? "";
    if (!txt) return;
    try {
      await navigator.clipboard.writeText(txt);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = txt;
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
      } finally {
        document.body.removeChild(textarea);
      }
    }
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), 1500);
  }, [getText]);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleDragStart = React.useCallback((e: React.DragEvent<HTMLButtonElement>) => {
    const txt = getText?.() ?? "";
    if (!txt) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData("text/plain", txt);
    e.dataTransfer.setData("text/csv", txt.replace(/\t/g, ","));
  }, [getText]);

  const icon = copied ? (
    <svg className="w-4 h-4 text-green-400" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-7.414 7.414a1 1 0 01-1.414 0L3.293 9.414a1 1 0 111.414-1.414L8.5 11.793l6.793-6.793a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  ) : (
    <svg className="w-4 h-4 text-gray-200" viewBox="0 0 20 20" fill="currentColor">
      <path d="M6 2a2 2 0 00-2 2v8h2V4h6V2H6z" />
      <path d="M8 6a2 2 0 012-2h4.5A1.5 1.5 0 0116 5.5v11A1.5 1.5 0 0114.5 18h-7A1.5 1.5 0 016 16.5V8a2 2 0 012-2zm0 2v8.5a.5.5 0 00.5.5h6a.5.5 0 00.5-.5V6h-6a.5.5 0 00-.5.5z" />
    </svg>
  );

  return (
    <button
      type="button"
      className={`p-1 rounded bg-gray-900/80 border border-gray-700 hover:bg-gray-800 transition ${className ?? ""}`}
      onClick={performCopy}
      draggable
      onDragStart={handleDragStart}
      aria-label="Copy table"
    >
      {icon}
    </button>
  );
}

export function getTableDragHandlers(getText?: () => string | null | undefined) {
  if (!getText) return {};
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent<HTMLElement>) => {
      const txt = getText();
      if (!txt) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData("text/plain", txt);
      e.dataTransfer.setData("text/csv", txt.replace(/\t/g, ","));
    },
  };
}
