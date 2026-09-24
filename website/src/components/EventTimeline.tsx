"use client";

import { eventColor, SIGNAL_COLORS } from "@/lib/colors";
import { fmtTime, labelName } from "@/lib/format";
import type { Segment, SignalRun } from "@/lib/types";

export interface TimelineRow {
  name: string;
  segments: Segment[];
}

interface Props {
  duration: number;
  rows: TimelineRow[];
  signal?: SignalRun[];
  current?: number;
  onSeek?: (t: number) => void;
}

const STATUS_TEXT = { tp: "matched", fp: "false positive", fn: "missed" } as const;

function ticks(duration: number): number[] {
  const step = duration > 240 ? 60 : duration > 90 ? 30 : duration > 30 ? 10 : 5;
  const out: number[] = [];
  for (let t = 0; t <= duration; t += step) out.push(t);
  return out;
}

/** Event segments on a shared time axis. Clicking a segment or the track seeks to that time. */
export function EventTimeline({ duration, rows, signal, current, onSeek }: Props) {
  const pct = (t: number) => `${(100 * Math.min(Math.max(t, 0), duration)) / duration}%`;
  const seekFromClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    const r = e.currentTarget.getBoundingClientRect();
    onSeek(((e.clientX - r.left) / r.width) * duration);
  };

  const track = (children: React.ReactNode, height = "h-7") => (
    <div className={`relative ${height} flex-1 rounded-md bg-surface-2 ${onSeek ? "cursor-pointer" : ""}`} onClick={seekFromClick}>
      {children}
      {current !== undefined && (
        <div className="pointer-events-none absolute inset-y-[-3px] w-0.5 bg-text" style={{ left: pct(current) }} />
      )}
    </div>
  );

  return (
    <div className="select-none text-xs">
      {signal && signal.length > 0 && (
        <div className="mb-1.5 flex items-center gap-2">
          <span className="w-24 shrink-0 text-muted sm:w-28">signal</span>
          {track(
            signal.map(([s, e, st], i) => (
              <div
                key={i}
                className="absolute inset-y-0"
                style={{ left: pct(s), width: pct(e - s), background: SIGNAL_COLORS[st], opacity: 0.55 }}
                title={`${st} ${fmtTime(s)}–${fmtTime(e)}`}
              />
            )),
            "h-3",
          )}
        </div>
      )}
      {rows.map((row) => (
        <div key={row.name} className="mb-1.5 flex items-center gap-2">
          <span className="w-24 shrink-0 truncate text-muted sm:w-28" title={row.name}>
            {row.name}
          </span>
          {track(
            row.segments.map(([s, e, label, status], i) => {
              const color = eventColor(label);
              const missed = status === "fn";
              const fp = status === "fp";
              return (
                <button
                  key={i}
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onSeek?.(s);
                  }}
                  title={`${labelName(label)} · ${fmtTime(s)}–${fmtTime(e)}${status ? ` · ${STATUS_TEXT[status]}` : ""}`}
                  className="absolute inset-y-1 min-w-[4px] rounded-[3px] transition-transform hover:scale-y-125 focus-visible:outline-2 focus-visible:outline-text"
                  style={{
                    left: pct(s),
                    width: pct(e - s),
                    background: missed
                      ? "transparent"
                      : fp
                        ? `repeating-linear-gradient(135deg, ${color} 0 4px, transparent 4px 7px)`
                        : color,
                    border: missed ? `1.5px dashed ${color}` : fp ? `1.5px solid ${color}` : "none",
                  }}
                  aria-label={`${labelName(label)} from ${fmtTime(s)} to ${fmtTime(e)}`}
                />
              );
            }),
          )}
        </div>
      ))}
      <div className="flex items-center gap-2">
        <span className="w-24 shrink-0 sm:w-28" />
        <div className="relative h-4 flex-1 text-[10px] text-muted">
          {ticks(duration).map((t) => (
            <span key={t} className="absolute -translate-x-1/2 tabular-nums" style={{ left: pct(t) }}>
              {fmtTime(t).replace(/\.0$/, "")}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TimelineLegend({ labels, withStatus = false }: { labels: string[]; withStatus?: boolean }) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
      {labels.map((l) => (
        <span key={l} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: eventColor(l) }} />
          {labelName(l)}
        </span>
      ))}
      {withStatus && (
        <>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-4 rounded-sm bg-muted" /> matched (tIoU ≥ 0.5)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-4 rounded-sm border border-muted"
              style={{ background: "repeating-linear-gradient(135deg, var(--muted) 0 3px, transparent 3px 5px)" }}
            />
            false positive
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-4 rounded-sm border border-dashed border-muted" /> missed
          </span>
        </>
      )}
    </div>
  );
}
