"""Background job queue for the live demo: one worker, one video at a time.

A job runs the same code as the official harness (Part A via src.pipeline, Part B by streaming
every frame through solution.RiskEstimator), then renders an annotated mp4 with src.render.
"""
from __future__ import annotations

import os
import queue
import shutil
import threading
import time
import traceback
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path

import cv2

JOBS_DIR = Path(os.environ.get("DEMO_JOBS_DIR", "/tmp/demo_jobs"))
KEEP_JOBS = 20
# Share of the progress bar per stage (Part A dominates the runtime).
STAGES = {"analyzing": (0.0, 0.7), "risk": (0.7, 0.9), "rendering": (0.9, 1.0)}


@dataclass
class Job:
    id: str
    name: str
    state: str = "queued"            # queued | analyzing | risk | rendering | done | error
    progress: float = 0.0
    created: float = field(default_factory=time.time)
    started: float | None = None
    finished: float | None = None
    error: str | None = None
    result: dict | None = None

    def public(self, queue_pos: int | None) -> dict:
        d = asdict(self)
        d["queue_position"] = queue_pos
        d["elapsed"] = (self.finished or time.time()) - self.started if self.started else 0.0
        return d


class JobQueue:
    def __init__(self) -> None:
        self.jobs: dict[str, Job] = {}
        self.order: list[str] = []
        self.lock = threading.Lock()
        self.q: queue.Queue[str] = queue.Queue()
        JOBS_DIR.mkdir(parents=True, exist_ok=True)
        threading.Thread(target=self._worker, daemon=True).start()

    # --- API -----------------------------------------------------------------
    def new_job_dir(self) -> tuple[str, Path]:
        job_id = uuid.uuid4().hex[:12]
        d = JOBS_DIR / job_id
        d.mkdir(parents=True)
        return job_id, d

    def submit(self, job_id: str, name: str) -> Job:
        job = Job(id=job_id, name=name)
        with self.lock:
            self.jobs[job_id] = job
            self.order.append(job_id)
            self._prune()
        self.q.put(job_id)
        return job

    def get(self, job_id: str) -> dict | None:
        with self.lock:
            job = self.jobs.get(job_id)
            if job is None:
                return None
            waiting = [j for j in self.order if self.jobs[j].state == "queued"]
            pos = waiting.index(job_id) if job_id in waiting else None
            return job.public(pos)

    # --- internals -------------------------------------------------------------
    def _prune(self) -> None:
        while len(self.order) > KEEP_JOBS:
            old = self.order[0]
            if self.jobs[old].state not in ("done", "error"):
                break
            self.order.pop(0)
            self.jobs.pop(old, None)
            shutil.rmtree(JOBS_DIR / old, ignore_errors=True)

    def _set(self, job: Job, state: str, frac: float = 0.0) -> None:
        lo, hi = STAGES.get(state, (1.0, 1.0))
        with self.lock:
            job.state = state
            job.progress = round(lo + (hi - lo) * min(max(frac, 0.0), 1.0), 3)

    def _worker(self) -> None:
        while True:
            job = self.jobs.get(self.q.get())
            if job is None:
                continue
            job.started = time.time()
            try:
                job.result = run_job(job, JOBS_DIR / job.id, self._set)
                self._set(job, "done")
                job.progress = 1.0
            except Exception as e:  # noqa: BLE001 - reported to the page, never crashes the worker
                traceback.print_exc()
                job.state, job.error = "error", f"{type(e).__name__}: {e}"
            finally:
                job.finished = time.time()
                (JOBS_DIR / job.id / "input.mp4").unlink(missing_ok=True)


def run_job(job: Job, d: Path, set_state) -> dict:
    from solution import RiskEstimator
    from src import config
    from src.pipeline import analyze, events_from
    from src.render import render_video
    from src.summary import object_counts, pool_risk, signal_runs

    video = str(d / "input.mp4")
    set_state(job, "analyzing", 0.0)
    ctx, candidates = analyze(video, config.ENABLED_CLASSES, on_progress=lambda f: set_state(job, "analyzing", f))
    events = events_from(ctx, candidates)

    # Part B exactly as the harness drives it: every frame, in order, through step()
    set_state(job, "risk", 0.0)
    meta = ctx.meta
    est = RiskEstimator()
    est.reset({"video_id": job.name, "fps": meta.fps, "width": meta.width, "height": meta.height,
               "n_frames": meta.n_frames})
    cap = cv2.VideoCapture(video)
    risk, i = [], 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        t = i / meta.fps
        risk.append([round(t, 3), round(float(est.step(frame, t)), 4)])
        i += 1
        if i % 50 == 0:
            set_state(job, "risk", i / max(meta.n_frames, 1))
    cap.release()

    set_state(job, "rendering", 0.0)
    render_video(ctx, events, str(d / "annotated.mp4"), risk=risk, on_progress=lambda f: set_state(job, "rendering", f))

    return {
        "video": {"name": job.name, "width": meta.width, "height": meta.height, "fps": round(meta.fps, 3),
                  "duration": round(meta.duration, 2)},
        "events": events,
        "risk": pool_risk(risk),
        "counts": object_counts(ctx.tracks, meta.duration),
        "signal": signal_runs(ctx),
        "video_url": f"/media/{job.id}.mp4",
        "detector": config.DETECTOR_WEIGHTS.name,
    }
