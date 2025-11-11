"use client";

import * as React from "react";
import { SOURCE_CURVE } from "@/data/sourceCurve";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { DataGrid, GridColDef } from "@mui/x-data-grid";

export default function DatafeedPage() {
  const rows = React.useMemo(
    () => SOURCE_CURVE.map((d, id) => ({ id, Term: d.Term, Rate: d.Rate })),
    []
  );
  const columns: GridColDef<typeof rows[number]>[] = [
    { field: "Term", headerName: "Term", width: 120 },
    { field: "Rate", headerName: "Rate", width: 140, type: "number" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-gray-950 text-gray-100">
      <div className="flex-1 p-6">
        <h1 className="text-xl font-semibold mb-4">this is a datafeed</h1>
        <div className="space-y-4">
          <div className="w-full rounded-lg border border-gray-800 bg-gray-900 p-3">
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={SOURCE_CURVE} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="rateFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="Term" tick={{ fill: "#9ca3af", fontSize: 12 }} axisLine={{ stroke: "#374151" }} tickLine={{ stroke: "#374151" }} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} axisLine={{ stroke: "#374151" }} tickLine={{ stroke: "#374151" }} domain={["dataMin - 0.2", "dataMax + 0.2"]} />
                  <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", color: "#e5e7eb" }} />
                  <Area type="monotone" dataKey="Rate" stroke="#f59e0b" strokeWidth={2} fill="url(#rateFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
            <div className="h-[520px]">
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
      </div>

      <div className="border-t border-gray-800 bg-gray-900 p-4 resize-y overflow-auto" style={{ minHeight: 120 }}>
        <div className="max-w-3xl text-sm text-gray-300">
          This area is for explanatory text. It is visually separated to emphasize the upper app as a standalone module. Drag the bottom edge to resize vertically.
        </div>
      </div>
    </div>
  );
}

