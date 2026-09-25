import { labelName } from "@/lib/format";
import type { Ablation } from "@/lib/types";

const BUDGET = 3; // x video length, Part A + Part B together

/** Dev Score A and Part A runtime per detector / frame-rate / input-size variant. */
export function AblationTable({ ablation }: { ablation: Ablation }) {
  const best = Math.max(...ablation.rows.map((r) => r.score_a));
  const classes = [...new Set(ablation.rows.flatMap((r) => Object.keys(r.per_class)))].sort();
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">variant</th>
            <th className="px-3 py-3 font-medium">dev Score A</th>
            {classes.map((c) => (
              <th key={c} className="px-3 py-3 font-medium">
                {labelName(c)}
                <span className="block font-normal normal-case">mean F1</span>
              </th>
            ))}
            <th className="px-4 py-3 font-medium">
              Part A time
              <span className="block font-normal normal-case">× video length (budget {BUDGET}× for A + B)</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {ablation.rows.map((r) => (
            <tr key={r.name} className="border-b border-border last:border-0">
              <td className="px-4 py-3 font-medium">{r.name}</td>
              <td className="px-3 py-3">
                <span className={`tabular-nums ${r.score_a === best ? "font-semibold text-good" : ""}`}>{r.score_a.toFixed(3)}</span>
              </td>
              {classes.map((c) => (
                <td key={c} className="px-3 py-3 tabular-nums text-muted">
                  {(r.per_class[c] ?? 0).toFixed(2)}
                </td>
              ))}
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="relative h-2 w-28 rounded-full bg-surface-2">
                    <div
                      className={`h-full rounded-full ${r.x_realtime > BUDGET * 0.66 ? "bg-warn" : "bg-accent"}`}
                      style={{ width: `${Math.min(100, (100 * r.x_realtime) / BUDGET)}%` }}
                    />
                  </div>
                  <span className="tabular-nums">{r.x_realtime.toFixed(2)}×</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-border px-4 py-3 text-xs text-muted">
        All variants use the same rules and thresholds, scored with the official evaluate.py on our dev labels (
        {Math.round(ablation.video_sec / 60)} min of video). Times from one run on an {ablation.machine}.
      </p>
    </div>
  );
}
