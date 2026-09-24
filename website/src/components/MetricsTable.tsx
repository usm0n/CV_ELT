import { eventColor } from "@/lib/colors";
import { labelName } from "@/lib/format";
import type { Metrics } from "@/lib/types";

import { Swatch } from "./ui";

const TAUS = ["0.3", "0.5", "0.7"] as const;

function f1Cell(f1: number) {
  const tone = f1 >= 0.8 ? "text-good" : f1 >= 0.4 ? "text-warn" : "text-bad";
  return <span className={`font-medium tabular-nums ${tone}`}>{f1.toFixed(2)}</span>;
}

/** Per-class Part A report from the official evaluate.py, against our dev labels. */
export function MetricsTable({ metrics }: { metrics: Metrics }) {
  const a = metrics.part_a;
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">class</th>
            {TAUS.map((t) => (
              <th key={t} className="px-3 py-3 font-medium">
                tIoU {t}
                <span className="block font-normal normal-case">TP / FP / FN · F1</span>
              </th>
            ))}
            <th className="px-4 py-3 text-right font-medium">mean F1</th>
          </tr>
        </thead>
        <tbody>
          {a.classes.map((c) => {
            const row = a.per_class[c];
            return (
              <tr key={c} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-2 font-medium">
                    <Swatch color={eventColor(c)} />
                    {labelName(c)}
                  </span>
                </td>
                {TAUS.map((t) => (
                  <td key={t} className="px-3 py-3 tabular-nums text-muted">
                    {row[t].tp} / {row[t].fp} / {row[t].fn} · {f1Cell(row[t].f1)}
                  </td>
                ))}
                <td className="px-4 py-3 text-right">{f1Cell(row.f1_mean)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t border-border bg-surface-2/60">
          <tr>
            <td className="px-4 py-3 font-semibold">Score A (macro)</td>
            {TAUS.map((t) => (
              <td key={t} className="px-3 py-3 text-xs text-muted">
                micro F1 {a.micro[t].f1.toFixed(2)} · class-agnostic {a.class_agnostic[t].f1.toFixed(2)}
              </td>
            ))}
            <td className="px-4 py-3 text-right text-base font-semibold tabular-nums">{a.score_a.toFixed(3)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
