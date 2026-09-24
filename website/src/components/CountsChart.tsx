"use client";

import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { classColor } from "@/lib/colors";
import { fmtTime } from "@/lib/format";
import type { Counts } from "@/lib/types";

const ORDER = ["car", "bus", "truck", "motorcycle", "bicycle", "person"];

/** Stacked mean objects on screen per class over time. */
export function CountsChart({ counts, height = 220 }: { counts: Counts; height?: number }) {
  const classes = ORDER.filter((c) => counts[c]?.some((v) => v > 0));
  const data = counts.t.map((t, i) => Object.fromEntries([["t", t], ...classes.map((c) => [c, counts[c][i]])]));
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(t: number) => fmtTime(t).replace(/\.0$/, "")}
            tick={{ fontSize: 10, fill: "var(--muted)" }}
            stroke="var(--border)"
          />
          <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} stroke="var(--border)" />
          <Tooltip
            labelFormatter={(t) => `${fmtTime(Number(t))} (5 s bin)`}
            formatter={(v, n) => [Number(v).toFixed(1), n]}
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} iconType="square" />
          {classes.map((c) => (
            <Area
              key={c}
              type="monotone"
              dataKey={c}
              stackId="1"
              stroke={classColor(c)}
              fill={classColor(c)}
              fillOpacity={0.55}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
