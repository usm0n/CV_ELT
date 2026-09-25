"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { eventColor } from "@/lib/colors";
import { fmtTime, labelName } from "@/lib/format";
import { DEMO_API } from "@/lib/site";
import type { DemoJob, DemoResult } from "@/lib/types";

import { CountsChart } from "./CountsChart";
import { EventTimeline, TimelineLegend } from "./EventTimeline";
import { RiskChart } from "./RiskChart";
import { Card } from "./ui";

const MAX_MB = 200;
const MAX_SECONDS = 120;
const POLL_MS = 2000;
const JOB_KEY = "demo-job";

const STAGES: { key: DemoJob["state"]; label: string }[] = [
  { key: "queued", label: "Queued" },
  { key: "analyzing", label: "Detect + track + rules (Part A)" },
  { key: "risk", label: "Causal risk, frame by frame (Part B)" },
  { key: "rendering", label: "Rendering annotated video" },
  { key: "done", label: "Done" },
];

type Health = { detector: string; sample_interval: number; enabled_classes: string[] } | "offline" | null;

function videoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(v.duration);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(NaN); // the browser may not decode it; the server checks again
    };
    v.src = url;
  });
}

export function LiveDemo() {
  const [health, setHealth] = useState<Health>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upload, setUpload] = useState<number | null>(null);
  const [job, setJob] = useState<DemoJob | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!DEMO_API) return;
    fetch(`${DEMO_API}/health`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setHealth)
      .catch(() => setHealth("offline"));
    // resume a job started before a reload of this tab
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem(JOB_KEY);
    } catch {}
    if (saved)
      fetch(`${DEMO_API}/jobs/${saved}`)
        .then((r) => (r.ok ? (r.json() as Promise<DemoJob>) : null))
        .then((j) => j && setJob(j))
        .catch(() => {});
  }, []);

  // poll the running job
  const jobId = job?.id;
  const finished = job?.state === "done" || job?.state === "error";
  useEffect(() => {
    if (!jobId || finished) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch(`${DEMO_API}/jobs/${jobId}`);
        if (r.status === 404) {
          try {
            sessionStorage.removeItem(JOB_KEY);
          } catch {}
          if (!stop) setJob(null);
          return;
        }
        const j = (await r.json()) as DemoJob;
        if (!stop) setJob(j);
      } catch {
        /* transient network error: keep polling */
      }
      if (!stop) timer = setTimeout(tick, POLL_MS);
    };
    let timer = setTimeout(tick, 300);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [jobId, finished]);

  const choose = useCallback(async (f: File | undefined) => {
    setError(null);
    if (!f) return;
    if (!/\.(mp4|mov|m4v)$/i.test(f.name)) return setError("Please choose an .mp4 video.");
    if (f.size > MAX_MB * 2 ** 20) return setError(`That file is ${(f.size / 2 ** 20).toFixed(0)} MB; the limit is ${MAX_MB} MB.`);
    const d = await videoDuration(f);
    if (d > MAX_SECONDS + 1) return setError(`That video is ${Math.round(d)} s long; the demo accepts up to 2 minutes.`);
    setFile(f);
  }, []);

  const submit = () => {
    if (!file) return;
    setError(null);
    setJob(null);
    setUpload(0);
    const form = new FormData();
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${DEMO_API}/jobs`);
    xhr.upload.onprogress = (e) => e.lengthComputable && setUpload(e.loaded / e.total);
    xhr.onload = () => {
      setUpload(null);
      let body: { id?: string; detail?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && body.id) {
        try {
          sessionStorage.setItem(JOB_KEY, body.id);
        } catch {}
        setJob({ id: body.id, name: file.name, state: "queued", progress: 0, queue_position: null, elapsed: 0, error: null, result: null });
      } else setError(body.detail ?? `Upload failed (HTTP ${xhr.status}).`);
    };
    xhr.onerror = () => {
      setUpload(null);
      setError("Could not reach the demo server. It may be waking up; try again in a minute.");
    };
    xhr.send(form);
  };

  const reset = () => {
    setJob(null);
    setFile(null);
    try {
      sessionStorage.removeItem(JOB_KEY);
    } catch {}
  };

  if (!DEMO_API)
    return (
      <Card>
        <p className="text-sm text-muted">
          The demo server URL is not configured for this build. Set <code className="font-mono">NEXT_PUBLIC_DEMO_API</code> and
          rebuild.
        </p>
      </Card>
    );

  const busy = upload !== null || (job !== null && !finished);

  return (
    <div className="space-y-5">
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-muted">
            Accepts <strong className="text-text">.mp4, up to 2 minutes and {MAX_MB} MB</strong>. It runs on 2 CPU cores, so
            processing takes about 4–5× the clip length (a 20 s clip ≈ 1.5 min, a 2-minute clip ≈ 9 min).
          </span>
          <ServerBadge health={health} />
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!busy) void choose(e.dataTransfer.files[0]);
          }}
          className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors ${
            dragging ? "border-accent bg-accent-soft" : "border-border"
          }`}
        >
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted">
            <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
          </svg>
          {file ? (
            <p className="text-sm">
              <span className="font-medium">{file.name}</span>{" "}
              <span className="text-muted">({(file.size / 2 ** 20).toFixed(1)} MB)</span>
            </p>
          ) : (
            <p className="text-sm text-muted">Drop a video here, or</p>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:border-text disabled:opacity-50"
            >
              {file ? "Choose another" : "Choose a video"}
            </button>
            {file && (
              <button
                type="button"
                disabled={busy}
                onClick={submit}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                Run the model
              </button>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="video/mp4,video/quicktime,.mp4,.mov,.m4v"
            className="hidden"
            onChange={(e) => void choose(e.target.files?.[0])}
          />
        </div>
        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">
            {error}
          </p>
        )}
        <p className="mt-3 text-xs text-muted">
          The model is tuned to the competition camera: it registers every clip to our reference view of that junction. On
          footage from another camera it still runs, but the scene rules (stop line, junction box) will not line up.
        </p>
      </Card>

      {upload !== null && (
        <Card>
          <Progress label="Uploading" value={upload} />
        </Card>
      )}

      {job && !finished && <JobProgress job={job} />}

      {job?.state === "error" && (
        <Card>
          <p className="text-sm font-medium text-bad">The run failed.</p>
          <p className="mt-1 font-mono text-xs text-muted">{job.error}</p>
          <button type="button" onClick={reset} className="mt-3 text-sm text-accent hover:underline">
            Try another video
          </button>
        </Card>
      )}

      {job?.state === "done" && job.result && <DemoOutput result={job.result} elapsed={job.elapsed} onReset={reset} />}
    </div>
  );
}

function ServerBadge({ health }: { health: Health }) {
  if (health === null) return <span className="text-muted">checking server…</span>;
  if (health === "offline")
    return (
      <span className="inline-flex items-center gap-1.5 text-warn">
        <span className="h-2 w-2 rounded-full bg-warn" /> server asleep or offline: the first request may take a minute
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-good">
      <span className="h-2 w-2 rounded-full bg-good" /> online · {health.detector} · every {health.sample_interval} s
    </span>
  );
}

function Progress({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted">{Math.round(value * 100)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  );
}

function JobProgress({ job }: { job: DemoJob }) {
  const idx = STAGES.findIndex((s) => s.key === job.state);
  const eta = job.progress > 0.03 && job.elapsed > 5 ? (job.elapsed / job.progress) * (1 - job.progress) : null;
  return (
    <Card>
      <Progress label={job.state === "queued" ? "Waiting for the worker" : "Processing"} value={job.progress ?? 0} />
      <p className="mt-2 text-xs text-muted">
        {job.state === "queued" && job.queue_position ? `${job.queue_position} video(s) ahead of yours. ` : ""}
        {job.elapsed > 0 && `Elapsed ${fmtTime(job.elapsed).replace(/\.\d$/, "")}`}
        {eta !== null && ` · about ${fmtTime(eta).replace(/\.\d$/, "")} left`}
        {" · you can leave this tab open; the job keeps running."}
      </p>
      <ol className="mt-4 grid gap-2 text-sm sm:grid-cols-5">
        {STAGES.map((s, i) => (
          <li
            key={s.key}
            className={`rounded-lg border px-3 py-2 ${
              i < idx ? "border-good/40 text-good" : i === idx ? "border-accent font-medium text-text" : "border-border text-muted"
            }`}
          >
            <span className="mr-1">{i < idx ? "✓" : i === idx ? "●" : "○"}</span>
            {s.label}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function DemoOutput({ result, elapsed, onReset }: { result: DemoResult; elapsed: number; onReset: () => void }) {
  const [time, setTime] = useState(0);
  const ref = useRef<HTMLVideoElement>(null);
  const d = result.video.duration;
  const seek = (t: number) => {
    setTime(t);
    if (ref.current) {
      ref.current.currentTime = t;
      void ref.current.play().catch(() => {});
    }
  };
  const labels = [...new Set(result.events.map((e) => e[2]))];
  const download = () => {
    const blob = new Blob([JSON.stringify({ [result.video.name]: { events: result.events, risk: result.risk } }, null, 1)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${result.video.name.replace(/\.[^.]+$/, "")}_events.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">
            {result.events.length} event{result.events.length === 1 ? "" : "s"} in {result.video.name}
          </h3>
          <p className="text-xs text-muted">
            {result.video.width}×{result.video.height} · {result.video.fps} fps · {fmtTime(d)} · processed in{" "}
            {fmtTime(elapsed).replace(/\.\d$/, "")} with {result.detector}
          </p>
        </div>
        <div className="mt-4 grid gap-5 lg:grid-cols-5">
          <video
            ref={ref}
            src={`${DEMO_API}${result.video_url}`}
            controls
            playsInline
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
            className="aspect-video w-full rounded-xl border border-border bg-black lg:col-span-3"
          />
          <div className="lg:col-span-2">
            {result.events.length === 0 ? (
              <p className="text-sm text-muted">
                No stop-line or jaywalking events found. The risk curve and object counts below still show what the model
                saw.
              </p>
            ) : (
              <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
                {result.events.map(([s, e, label], i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => seek(s)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-2"
                    >
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: eventColor(label) }} />
                      <span className="flex-1">{labelName(label)}</span>
                      <span className="tabular-nums text-muted">
                        {fmtTime(s)}–{fmtTime(e)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex gap-3 text-sm">
              <button type="button" onClick={download} className="text-accent hover:underline">
                Download JSON
              </button>
              <button type="button" onClick={onReset} className="text-muted hover:text-text">
                Run another video
              </button>
            </div>
          </div>
        </div>
      </Card>
      <Card>
        <h3 className="mb-3 text-sm font-semibold">Timeline</h3>
        <EventTimeline duration={d} rows={[{ name: "events", segments: result.events }]} signal={result.signal} current={time} onSeek={seek} />
        {labels.length > 0 && <TimelineLegend labels={labels} />}
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 text-sm font-semibold">Accident risk</h3>
          <RiskChart risk={result.risk} duration={d} current={time} onSeek={seek} />
        </Card>
        <Card>
          <h3 className="mb-3 text-sm font-semibold">Road users on screen</h3>
          <CountsChart counts={result.counts} height={170} />
        </Card>
      </div>
    </>
  );
}
