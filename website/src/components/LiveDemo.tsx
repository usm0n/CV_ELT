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

const MAX_MB = 4096; // demo/app.py MAX_UPLOAD_MB: big files go up in chunks (the tunnel caps one request at 100 MB)
const SINGLE_MB = 90; // below this, one plain POST
const CHUNK_RETRIES = 3;
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

type Health = { detector: string; sample_interval: number; enabled_classes: string[]; sample?: boolean } | "offline" | null;

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
    if (f.size > MAX_MB * 2 ** 20) return setError(`That file is ${(f.size / 2 ** 30).toFixed(1)} GB; the limit is ${MAX_MB / 1024} GB.`);
    const d = await videoDuration(f);
    if (d > MAX_SECONDS + 1) return setError(`That video is ${Math.round(d)} s long; the demo accepts up to 2 minutes.`);
    setFile(f);
  }, []);

  const started = (id: string, name: string) => {
    try {
      sessionStorage.setItem(JOB_KEY, id);
    } catch {}
    setJob({ id, name, state: "queued", progress: 0, queue_position: null, elapsed: 0, error: null, result: null });
  };

  const submit = async () => {
    if (!file) return;
    setError(null);
    setJob(null);
    setUpload(0);
    try {
      const id = file.size <= SINGLE_MB * 2 ** 20 ? await postWhole(file, setUpload) : await postChunked(file, setUpload);
      started(id, file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUpload(null);
    }
  };

  const runSample = async () => {
    setError(null);
    setJob(null);
    setFile(null);
    try {
      const r = await fetch(`${DEMO_API}/jobs/sample`, { method: "POST" });
      const body = (await r.json().catch(() => ({}))) as { id?: string; detail?: string };
      if (!r.ok || !body.id) throw new Error(body.detail ?? `Request failed (HTTP ${r.status}).`);
      started(body.id, "sample_C3902_78-123s.mp4");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the demo server. Try again in a minute.");
    }
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
            Accepts <strong className="text-text">.mp4 up to 2 minutes</strong>, including raw 4K clips straight from the
            camera (up to {MAX_MB / 1024} GB; large files upload in chunks). It runs on 2 CPU cores, so processing takes about 4–5× the
            clip length (a 20 s clip ≈ 1.5 min, a 2-minute clip ≈ 9 min).
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
            {!file && health !== "offline" && health?.sample && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void runSample()}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                Try our sample clip
              </button>
            )}
            {file && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void submit()}
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
        {health !== "offline" && health?.sample && (
          <p className="mt-3 text-xs text-muted">
            The sample is 45 s of the competition camera (C3902, 1:18–2:03) with a jaywalking pedestrian and a vehicle stopped
            past the stop line on red. Once it has run, the result comes back instantly.
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

type OnProgress = (fraction: number) => void;

function uploadError(status: number, text: string): Error {
  let detail: string | undefined;
  try {
    detail = (JSON.parse(text) as { detail?: string }).detail;
  } catch {}
  return new Error(detail ?? `Upload failed (HTTP ${status}).`);
}

function send(method: string, url: string, body: Document | XMLHttpRequestBodyInit | null, onProgress?: OnProgress) {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    if (onProgress) xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve(xhr.responseText) : reject(uploadError(xhr.status, xhr.responseText)));
    xhr.onerror = () => reject(new Error("Could not reach the demo server. It may be waking up; try again in a minute."));
    xhr.send(body);
  });
}

/** Small files: one multipart POST. */
async function postWhole(file: File, onProgress: OnProgress): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const body = JSON.parse(await send("POST", `${DEMO_API}/jobs`, form, onProgress)) as { id: string };
  return body.id;
}

/** Large files: start an upload, PUT it in chunks (each retried), then finish it. */
async function postChunked(file: File, onProgress: OnProgress): Promise<string> {
  const start = JSON.parse(await send("POST", `${DEMO_API}/uploads`, null)) as { id: string; chunk_mb: number };
  const size = start.chunk_mb * 2 ** 20;
  let offset = 0;
  while (offset < file.size) {
    const chunk = file.slice(offset, offset + size);
    for (let attempt = 1; ; attempt++) {
      try {
        const url = `${DEMO_API}/uploads/${start.id}?offset=${offset}`;
        const base = offset;
        const r = JSON.parse(await send("PUT", url, chunk, (f) => onProgress((base + f * chunk.size) / file.size))) as { received: number };
        offset = r.received;
        break;
      } catch (e) {
        if (attempt >= CHUNK_RETRIES) throw e;
      }
    }
  }
  onProgress(1);
  const done = JSON.parse(await send("POST", `${DEMO_API}/uploads/${start.id}/finish?name=${encodeURIComponent(file.name)}`, null)) as {
    id: string;
  };
  return done.id;
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
