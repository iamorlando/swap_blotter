"use client";

import * as React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid, Cell } from "recharts";
import type { RiskExposure } from "@/lib/riskSeries";

type RiskBarChartProps = {
  exposures: RiskExposure[];
  height?: number | string;
};

export function RiskBarChart({ exposures, height = 240 }: RiskBarChartProps) {
  if (!exposures || exposures.length === 0) {
    return (
      <div className="h-full min-h-[120px] flex items-center justify-center text-sm text-gray-500">
        No risk buckets available.
      </div>
    );
  }

  const maxAbs = Math.max(1, ...exposures.map((e) => Math.abs(e.exposure)));
  const domain = [-maxAbs * 1.1, maxAbs * 1.1];

  return (
    <div className="h-full w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={exposures} margin={{ top: 4, right: 8, bottom: 2, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis
            dataKey="term"
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            interval={0}
            height={32}
            axisLine={{ stroke: "#374151" }}
            tickLine={{ stroke: "#374151" }}
          />
          <YAxis
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            axisLine={{ stroke: "#374151" }}
            tickLine={{ stroke: "#374151" }}
            domain={domain}
            tickFormatter={(v: number) => Number.isFinite(v) ? v.toFixed(1) : ""}
          />
          <ReferenceLine y={0} stroke="#4b5563" strokeDasharray="4 3" />
          <Tooltip
            cursor={{ fill: "#111827", fillOpacity: 0.1 }}
            contentStyle={{ background: "#0b1220", border: "1px solid #374151", color: "#e5e7eb" }}
            formatter={(value: any) => (Number.isFinite(Number(value)) ? Number(value).toFixed(2) : value)}
            labelFormatter={(label: any) => `Tenor ${label}`}
          />
          <Bar dataKey="exposure" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {exposures.map((entry, idx) => (
              <Cell key={idx} fill={entry.exposure >= 0 ? "#f59e0b" : "#22d3ee"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
