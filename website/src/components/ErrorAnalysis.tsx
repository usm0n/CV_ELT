import { eventColor } from "@/lib/colors";
import { fmtTime, labelName } from "@/lib/format";
import type { ErrorItem, Errors } from "@/lib/types";

import { Card, Swatch } from "./ui";

const CAUSES: { key: ErrorItem["cause"]; label: string; hint: string; tone: string }[] = [
  { key: "boundary", label: "Boundary", hint: "overlaps a segment of its class, but below the IoU threshold", tone: "bg-warn" },
  { key: "false_alarm", label: "False alarm", hint: "overlaps no label of its class", tone: "bg-bad" },
  { key: "missed", label: "Missed", hint: "no prediction of its class overlaps it", tone: "bg-bad/60" },
  { key: "class_off", label: "Class switched off", hint: "labelled, but a class we deliberately never predict", tone: "bg-muted/50" },
];

/** Every unmatched segment by cause, the confusion between classes, and how far matched boundaries are off. */
export function ErrorAnalysis({ errors }: { errors: Errors }) {
  const total = errors.items.length;
  const byCause = CAUSES.map((c) => ({ ...c, n: errors.items.filter((i) => i.cause === c.key).length }));
  const labels = [...new Set(Object.keys(errors.confusion).flatMap((k) => k.split("|")))].filter((l) => l !== "none").sort();
  const axis = [...labels, "none"];
  const cell = (g: string, p: string) => errors.confusion[`${g}|${p}`] ?? 0;
  const mixUps = labels.reduce((n, g) => n + labels.reduce((m, p) => m + (g === p ? 0 : cell(g, p)), 0), 0);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <h3 className="text-sm font-semibold">Why segments go unmatched</h3>
        <p className="mt-1 text-xs text-muted">
          {total} unmatched segments at tIoU {errors.match_tiou} (false positives and false negatives), by cause.
        </p>
        <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-surface-2" role="img" aria-label="Unmatched segments by cause">
          {byCause.map((c) => c.n > 0 && <div key={c.key} className={c.tone} style={{ width: `${(100 * c.n) / total}%` }} />)}
        </div>
        <ul className="mt-4 space-y-2 text-sm">
          {byCause.map((c) => (
            <li key={c.key} className="flex items-start gap-2">
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm ${c.tone}`} />
              <span className="flex-1">
                <span className="font-medium">{c.label}</span> <span className="text-muted">— {c.hint}</span>
              </span>
              <span className="tabular-nums">{c.n}</span>
            </li>
          ))}
        </ul>
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-accent">List every one</summary>
          <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-xs">
            {errors.items.map((i, k) => (
              <li key={k} className="flex items-center gap-2">
                <Swatch color={eventColor(i.label)} />
                <span className="w-7 font-mono uppercase text-muted">{i.kind}</span>
                <span className="flex-1">
                  {labelName(i.label)} · {i.video.replace(/\.[^.]+$/, "")} {fmtTime(i.seg[0])}–{fmtTime(i.seg[1])}
                </span>
                <span className="text-muted">{CAUSES.find((c) => c.key === i.cause)?.label}</span>
              </li>
            ))}
          </ul>
        </details>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold">Class confusion</h3>
        <p className="mt-1 text-xs text-muted">
          Every label paired with the best-overlapping prediction of <em>any</em> class (tIoU ≥ 0.3). Off-diagonal cells
          would be one class mistaken for another; “none” is a miss or a false alarm.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="text-xs">
            <thead>
              <tr>
                <th className="px-2 py-1 text-left font-normal text-muted">label ↓ · predicted →</th>
                {axis.map((p) => (
                  <th key={p} className="px-2 py-1 text-center font-medium">
                    {p === "none" ? "none" : labelName(p)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {axis.map((g) => (
                <tr key={g}>
                  <th className="px-2 py-1 text-left font-medium">{g === "none" ? "none" : labelName(g)}</th>
                  {axis.map((p) => {
                    const n = cell(g, p);
                    const tone = n === 0 ? "text-muted/40" : g === p ? "bg-good/15 text-good" : "bg-bad/10 text-bad";
                    return (
                      <td key={p} className={`rounded px-2 py-1 text-center tabular-nums ${tone}`}>
                        {g === "none" && p === "none" ? "" : n}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">
          {mixUps === 0
            ? "No class is mistaken for another: every error is a boundary, a miss or a false alarm within one class."
            : `${mixUps} label(s) overlap a prediction of a different class.`}
        </p>
      </Card>

      <Card className="lg:col-span-2">
        <h3 className="text-sm font-semibold">Boundary offsets of matched segments</h3>
        <p className="mt-1 text-xs text-muted">
          Predicted minus labelled time, in seconds, for every match at tIoU {errors.match_tiou}. Negative = we start or end
          earlier than the annotator.
        </p>
        <div className="mt-4 space-y-4">
          {Object.entries(errors.boundary_offsets).map(([label, offs]) => (
            <OffsetRow key={label} label={label} offsets={offs} />
          ))}
        </div>
      </Card>
    </div>
  );
}

const SPAN = 10; // s either side of zero

function OffsetRow({ label, offsets }: { label: string; offsets: [number, number][] }) {
  const mean = (k: 0 | 1) => offsets.reduce((a, o) => a + o[k], 0) / offsets.length;
  const x = (v: number) => `${50 + (50 * Math.max(-SPAN, Math.min(SPAN, v))) / SPAN}%`;
  return (
    <div>
      <p className="mb-1 flex items-center gap-2 text-xs font-medium">
        <Swatch color={eventColor(label)} /> {labelName(label)}
        <span className="font-normal text-muted">
          · start {mean(0) >= 0 ? "+" : ""}
          {mean(0).toFixed(1)} s, end {mean(1) >= 0 ? "+" : ""}
          {mean(1).toFixed(1)} s on average (n = {offsets.length})
        </span>
      </p>
      {(["start", "end"] as const).map((edge, k) => (
        <div key={edge} className="flex items-center gap-2 text-[11px] text-muted">
          <span className="w-8">{edge}</span>
          <div className="relative h-4 flex-1 rounded bg-surface-2">
            <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
            {offsets.map((o, i) => (
              <span
                key={i}
                title={`${o[k] >= 0 ? "+" : ""}${o[k].toFixed(2)} s`}
                className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-80"
                style={{ left: x(o[k]), background: eventColor(label) }}
              />
            ))}
          </div>
        </div>
      ))}
      <div className="ml-10 flex justify-between text-[10px] text-muted">
        <span>−{SPAN} s</span>
        <span>0</span>
        <span>+{SPAN} s</span>
      </div>
    </div>
  );
}
