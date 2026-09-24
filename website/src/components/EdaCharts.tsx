"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { SIGNAL_COLORS } from "@/lib/colors";
import { fmtTime } from "@/lib/format";
import type { Eda } from "@/lib/types";

import { CountsChart } from "./CountsChart";
import { EventTimeline } from "./EventTimeline";
import { Card } from "./ui";

const LINE_COLORS = ["#4dabf7", "#ff922b", "#51cf66", "#cc5de8"];
const tooltipStyle = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 };
const axis = { tick: { fontSize: 10, fill: "var(--muted)" }, stroke: "var(--border)" };

export function CountsPanel({ eda }: { eda: Eda }) {
  const ids = Object.keys(eda.videos);
  const [id, setId] = useState(ids[0]);
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Road users on screen, by class</h3>
        <VideoPicker ids={ids} value={id} onChange={setId} />
      </div>
      <CountsChart counts={eda.videos[id].counts} />
      <p className="mt-2 text-xs text-muted">Mean tracked objects per processed frame, in {eda.count_bin} s bins.</p>
    </Card>
  );
}

export function BrightnessPanel({ eda }: { eda: Eda }) {
  const ids = Object.keys(eda.videos);
  const rows = new Map<number, Record<string, number>>();
  for (const id of ids)
    for (const [t, b] of eda.videos[id].brightness) rows.set(t, { ...(rows.get(t) ?? { t }), [id]: b });
  const data = [...rows.values()].sort((a, b) => a.t - b.t);
  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold">Mean frame brightness (0–255)</h3>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="t" type="number" tickFormatter={(t: number) => fmtTime(t).replace(/\.0$/, "")} {...axis} />
            <YAxis domain={[0, 255]} {...axis} />
            <Tooltip contentStyle={tooltipStyle} labelFormatter={(t) => fmtTime(Number(t))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {ids.map((id, i) => (
              <Line key={id} dataKey={id} name={id.replace(/\.[^.]+$/, "")} stroke={LINE_COLORS[i % 4]} dot={false} strokeWidth={2} connectNulls isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export function SignalPanel({ eda }: { eda: Eda }) {
  const ids = Object.keys(eda.videos);
  const stats = ids.map((id) => {
    const runs = eda.videos[id].signal;
    const inner = runs.slice(1, -1); // first/last runs are cut by the clip boundaries
    const mean = (st: string) => {
      const xs = inner.filter((r) => r[2] === st).map((r) => r[1] - r[0]);
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    };
    const total = runs.reduce((a, r) => a + r[1] - r[0], 0) || 1;
    const share = (st: string) => runs.filter((r) => r[2] === st).reduce((a, r) => a + r[1] - r[0], 0) / total;
    return { id, red: mean("red"), green: mean("green"), redShare: share("red"), unknown: share("unknown") };
  });
  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold">Signal phases read from the visible signal head</h3>
      {ids.map((id) => (
        <div key={id} className="mb-2">
          <EventTimeline duration={eda.videos[id].duration} rows={[]} signal={eda.videos[id].signal} />
          <p className="-mt-3 mb-3 text-[11px] text-muted">{id}</p>
        </div>
      ))}
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[420px] text-xs">
          <thead className="text-left text-muted">
            <tr>
              <th className="py-1.5 font-medium">video</th>
              <th className="font-medium">mean red</th>
              <th className="font-medium">mean green</th>
              <th className="font-medium">time on red</th>
              <th className="font-medium">unreadable</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {stats.map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="py-1.5">{s.id}</td>
                <td>{s.red ? `${s.red.toFixed(0)} s` : "–"}</td>
                <td>{s.green ? `${s.green.toFixed(0)} s` : "–"}</td>
                <td>{(s.redShare * 100).toFixed(0)}%</td>
                <td>{(s.unknown * 100).toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 flex gap-3 text-xs text-muted">
        {(["red", "amber", "green"] as const).map((s) => (
          <span key={s} className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-3 rounded-sm" style={{ background: SIGNAL_COLORS[s] }} /> {s}
          </span>
        ))}
      </p>
    </Card>
  );
}

export function SpeedPanel({ eda }: { eda: Eda }) {
  const ids = Object.keys(eda.videos);
  const edges = eda.videos[ids[0]].speed_hist.edges;
  const data = edges.slice(0, -1).map((e, i) => {
    const row: Record<string, number> = { v: +(e + (edges[1] - edges[0]) / 2).toFixed(2) };
    let tot = 0;
    for (const id of ids) tot += eda.videos[id].speed_hist.counts[i];
    row.samples = tot;
    return row;
  });
  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold">Vehicle speed distribution (body heights / s, all samples)</h3>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="v" {...axis} />
            <YAxis scale="log" domain={[1, "auto"]} allowDataOverflow {...axis} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v, "track samples"]} labelFormatter={(v) => `${v} body heights/s`} />
            <Bar dataKey="samples" fill="var(--accent)" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-muted">
        Log scale. The spike at zero is the red-light queue. Speeds are measured in the vehicle&apos;s own height per second,
        a rough perspective-free unit, because the camera is not calibrated.
      </p>
    </Card>
  );
}

function VideoPicker({ ids, value, onChange }: { ids: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1 rounded-lg border border-border p-0.5">
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`rounded-md px-2 py-1 text-xs ${id === value ? "bg-text text-bg" : "text-muted hover:text-text"}`}
        >
          {id.replace(/\.[^.]+$/, "")}
        </button>
      ))}
    </div>
  );
}
