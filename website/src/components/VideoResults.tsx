"use client";

import { useRef, useState } from "react";

import { eventColor } from "@/lib/colors";
import { fmtTime, labelName } from "@/lib/format";
import type { Segment, SignalRun, VideoResult } from "@/lib/types";

import { EventTimeline, TimelineLegend } from "./EventTimeline";
import { RiskChart } from "./RiskChart";
import { Card, Pending } from "./ui";

export interface VideoEntry {
  id: string;
  result: VideoResult;
  videoUrl: string | null;
  signal: SignalRun[] | null;
}

const STATUS_STYLE = {
  tp: "text-good",
  fp: "text-bad",
  fn: "text-warn",
} as const;

export function VideoResults({ videos }: { videos: VideoEntry[] }) {
  const [active, setActive] = useState(0);
  const [time, setTime] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const v = videos[active];
  const r = v.result;

  const seek = (t: number) => {
    const clamped = Math.max(0, Math.min(t, r.duration));
    setTime(clamped);
    if (videoRef.current) {
      videoRef.current.currentTime = clamped;
      videoRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
      void videoRef.current.play().catch(() => {});
    }
  };

  const labels = [...new Set([...r.events, ...r.labels].map((e) => e[2]))].sort();
  const rows: Segment[] = [...r.events].sort((a, b) => a[0] - b[0]);

  return (
    <div>
      <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1">
        {videos.map((x, i) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={i === active}
            onClick={() => {
              setActive(i);
              setTime(0);
            }}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium ${
              i === active ? "bg-text text-bg" : "text-muted hover:text-text"
            }`}
          >
            {x.id.replace(/\.[^.]+$/, "")}
            <span className="ml-1.5 text-xs opacity-70">{x.result.events.length}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3">
          {v.videoUrl ? (
            <video
              key={v.id}
              ref={videoRef}
              src={v.videoUrl}
              controls
              playsInline
              preload="metadata"
              onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
              className="aspect-video w-full rounded-xl border border-border bg-black"
            />
          ) : (
            <Pending what={`The annotated playback of ${v.id}`} />
          )}
        </div>
        <Card className="lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold">
            Predicted events <span className="font-normal text-muted">(click to jump)</span>
          </h3>
          {rows.length === 0 ? (
            <p className="text-sm text-muted">No events predicted.</p>
          ) : (
            <ul className="max-h-72 space-y-1 overflow-y-auto pr-1 text-sm">
              {rows.map(([s, e, label, status], i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => seek(s)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-2 ${
                      time >= s && time <= e ? "bg-surface-2" : ""
                    }`}
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: eventColor(label) }} />
                    <span className="flex-1 truncate">{labelName(label)}</span>
                    <span className="tabular-nums text-muted">
                      {fmtTime(s)}–{fmtTime(e)}
                    </span>
                    {status && <span className={`w-6 text-right text-xs font-medium uppercase ${STATUS_STYLE[status]}`}>{status}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted">
            TP / FP against our dev labels at tIoU ≥ 0.5. Missed dev-label events show as dashed boxes on the timeline.
          </p>
        </Card>
      </div>

      <Card className="mt-5">
        <h3 className="mb-3 text-sm font-semibold">Event timeline</h3>
        <EventTimeline
          duration={r.duration}
          rows={[
            { name: "predicted", segments: r.events },
            { name: "dev labels", segments: r.labels },
          ]}
          signal={v.signal ?? undefined}
          current={time}
          onSeek={seek}
        />
        <TimelineLegend labels={labels} withStatus />
      </Card>

      <Card className="mt-5">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">Accident risk (Part B, causal)</h3>
          <p className="text-xs text-muted">
            max {r.risk_max.toFixed(3)} · stays under the 0.5 alarm line: no accidents in the samples
          </p>
        </div>
        <RiskChart risk={r.risk} duration={r.duration} current={time} onSeek={seek} />
      </Card>
    </div>
  );
}
