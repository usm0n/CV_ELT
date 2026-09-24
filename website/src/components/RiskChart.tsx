"use client";

import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { fmtTime } from "@/lib/format";
import type { Curve } from "@/lib/types";

interface Props {
  risk: Curve;
  duration: number;
  current?: number;
  onSeek?: (t: number) => void;
  height?: number;
}

/** Part B risk score over time with the official alarm threshold (0.5). */
export function RiskChart({ risk, duration, current, onSeek, height = 170 }: Props) {
  const data = risk.map(([t, r]) => ({ t, r }));
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: -18 }}
          onClick={(e) => {
            if (onSeek && e && e.activeLabel !== undefined) onSeek(Number(e.activeLabel));
          }}
          style={{ cursor: onSeek ? "pointer" : undefined }}
        >
          <defs>
            <linearGradient id="riskFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.45} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={[0, duration]}
            tickFormatter={(t: number) => fmtTime(t).replace(/\.0$/, "")}
            tick={{ fontSize: 10, fill: "var(--muted)" }}
            stroke="var(--border)"
          />
          <YAxis domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tick={{ fontSize: 10, fill: "var(--muted)" }} stroke="var(--border)" />
          <Tooltip
            formatter={(v) => [Number(v).toFixed(3), "risk"]}
            labelFormatter={(t) => fmtTime(Number(t))}
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "var(--muted)" }}
          />
          <ReferenceLine
            y={0.5}
            stroke="var(--bad)"
            strokeDasharray="4 4"
            label={{ value: "alarm 0.5", position: "insideTopRight", fontSize: 10, fill: "var(--bad)" }}
          />
          {current !== undefined && <ReferenceLine x={current} stroke="var(--text)" strokeWidth={1.5} />}
          <Area type="stepAfter" dataKey="r" stroke="var(--accent)" strokeWidth={1.5} fill="url(#riskFill)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
