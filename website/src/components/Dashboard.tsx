"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { eventColor } from "@/lib/colors";
import { fmtTime, labelName } from "@/lib/format";
import type { Results } from "@/lib/types";

import { EventTimeline } from "./EventTimeline";
import { Card, Stat } from "./ui";

const tooltipStyle = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 };
const axis = { tick: { fontSize: 10, fill: "var(--muted)" }, stroke: "var(--border)" };

/** Operator view over all sample videos: what happened, where in time, how often. */
export function Dashboard({ results }: { results: Results }) {
  const ids = Object.keys(results.videos);
  const classes = [...new Set(ids.flatMap((id) => results.videos[id].events.map((e) => e[2])))].sort();
  const [filter, setFilter] = useState<string | null>(null);

  const all = useMemo(
    () =>
      Object.entries(results.videos)
        .flatMap(([id, v]) => v.events.map(([s, e, label]) => ({ id, s, e, label })))
        .filter((x) => !filter || x.label === filter)
        .sort((a, b) => a.id.localeCompare(b.id) || a.s - b.s),
    [results, filter],
  );

  const hours = ids.reduce((a, id) => a + results.videos[id].duration, 0) / 3600;
  const flagged = all.reduce((a, x) => a + x.e - x.s, 0);
  const perVideo = ids.map((id) => {
    const row: Record<string, string | number> = { video: id.replace(/\.[^.]+$/, "") };
    for (const c of classes) row[c] = results.videos[id].events.filter((e) => e[2] === c).length;
    return row;
  });
  const perMinute = (() => {
    const bins: Record<string, number>[] = [];
    for (const id of ids)
      for (const [s, , label] of results.videos[id].events) {
        const m = Math.floor(s / 60);
        bins[m] ??= { minute: m };
        bins[m][label] = (bins[m][label] ?? 0) + 1;
      }
    return Array.from(bins, (b, m) => b ?? { minute: m });
  })();

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Filter:</span>
        {[null, ...classes].map((c) => (
          <button
            key={c ?? "all"}
            type="button"
            onClick={() => setFilter(c)}
            aria-pressed={filter === c}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
              filter === c ? "border-text bg-text text-bg" : "border-border text-muted hover:text-text"
            }`}
          >
            {c && <span className="h-2 w-2 rounded-full" style={{ background: eventColor(c) }} />}
            {c ? labelName(c) : "all classes"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Events" value={all.length} hint={`in ${(hours * 60).toFixed(1)} min of footage`} />
        <Stat label="Per hour" value={(all.length / hours).toFixed(0)} hint="at this junction, samples only" />
        <Stat label="Flagged time" value={`${((100 * flagged) / (hours * 3600)).toFixed(0)}%`} hint={`${fmtTime(flagged)} in total`} />
        <Stat
          label="Peak risk"
          value={Math.max(...ids.map((id) => results.videos[id].risk_max)).toFixed(2)}
          hint="alarm threshold 0.50"
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 text-sm font-semibold">Events per video</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perVideo} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="video" {...axis} />
                <YAxis allowDecimals={false} {...axis} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--surface-2)" }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {classes
                  .filter((c) => !filter || c === filter)
                  .map((c) => (
                    <Bar key={c} dataKey={c} name={labelName(c)} stackId="a" fill={eventColor(c)} isAnimationActive={false} />
                  ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <h3 className="mb-3 text-sm font-semibold">Event onsets by minute of clip (all videos)</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perMinute} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="minute" tickFormatter={(m: number) => `${m}′`} {...axis} />
                <YAxis allowDecimals={false} {...axis} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={(m) => `minute ${m}–${Number(m) + 1}`} cursor={{ fill: "var(--surface-2)" }} />
                {classes
                  .filter((c) => !filter || c === filter)
                  .map((c) => (
                    <Bar key={c} dataKey={c} name={labelName(c)} stackId="a" fill={eventColor(c)} isAnimationActive={false} />
                  ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="mt-5">
        <h3 className="mb-3 text-sm font-semibold">All videos at a glance</h3>
        <EventTimeline
          duration={Math.max(...ids.map((id) => results.videos[id].duration))}
          rows={ids.map((id) => ({
            name: id.replace(/\.[^.]+$/, ""),
            segments: results.videos[id].events.filter((e) => !filter || e[2] === filter).map(([s, e, l]) => [s, e, l]),
          }))}
        />
      </Card>

      <Card className="mt-5">
        <h3 className="mb-3 text-sm font-semibold">Event log</h3>
        <div className="max-h-96 overflow-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="sticky top-0 bg-surface text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="py-2 font-medium">video</th>
                <th className="py-2 font-medium">class</th>
                <th className="py-2 font-medium">start</th>
                <th className="py-2 font-medium">end</th>
                <th className="py-2 text-right font-medium">duration</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {all.map((x, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="py-1.5">{x.id.replace(/\.[^.]+$/, "")}</td>
                  <td className="py-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: eventColor(x.label) }} />
                      {labelName(x.label)}
                    </span>
                  </td>
                  <td className="py-1.5">{fmtTime(x.s)}</td>
                  <td className="py-1.5">{fmtTime(x.e)}</td>
                  <td className="py-1.5 text-right">{(x.e - x.s).toFixed(1)} s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
