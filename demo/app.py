"""Live demo API (Hugging Face Space, CPU): upload an .mp4, get events, risk and annotated playback.

    uvicorn demo.app:app --port 7860            # from the repository root

    POST /jobs            multipart `file` (.mp4, <= MAX_MB, <= MAX_SECONDS)  -> {"id": ...}
    GET  /jobs/{id}       state, progress (0..1), queue position, result when done
    GET  /media/{id}.mp4  annotated playback
    GET  /health          model settings and limits

CPU settings (env, read before the pipeline is imported):
    DEMO_DETECTOR         weights file in weights/ for Part A (default yolo11n.pt; the submission uses yolo11m.pt)
    DEMO_SAMPLE_INTERVAL  seconds between Part A frames (default 0.2; the submission uses 0.1)
    DEMO_ORIGINS          comma-separated CORS origins (default *)
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import cv2
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src import config  # noqa: E402

# Must happen before src.perception.detector is imported: its defaults bind at import time.
config.DETECTOR_WEIGHTS = config.WEIGHTS_DIR / os.environ.get("DEMO_DETECTOR", "yolo11n.pt")
config.SAMPLE_INTERVAL = float(os.environ.get("DEMO_SAMPLE_INTERVAL", "0.2"))

from demo.jobs import JOBS_DIR, JobQueue  # noqa: E402

MAX_MB = 200
MAX_SECONDS = 150            # the page asks for <= 2 min; a little slack for rounding
CHUNK = 1 << 20

app = FastAPI(title="WIUT CV demo")
app.add_middleware(CORSMiddleware, allow_origins=os.environ.get("DEMO_ORIGINS", "*").split(","),
                   allow_methods=["GET", "POST"], allow_headers=["*"])
jobs = JobQueue()


@app.get("/health")
def health() -> dict:
    return {"ok": True, "detector": config.DETECTOR_WEIGHTS.name, "sample_interval": config.SAMPLE_INTERVAL,
            "enabled_classes": sorted(config.ENABLED_CLASSES), "max_mb": MAX_MB, "max_seconds": MAX_SECONDS}


@app.post("/jobs")
async def create_job(file: UploadFile) -> dict:
    name = Path(file.filename or "upload.mp4").name
    if not name.lower().endswith((".mp4", ".mov", ".m4v")):
        raise HTTPException(400, "Please upload an .mp4 video.")
    job_id, d = jobs.new_job_dir()
    path = d / "input.mp4"
    size = 0
    with path.open("wb") as f:
        while chunk := await file.read(CHUNK):
            size += len(chunk)
            if size > MAX_MB * 2**20:
                f.close()
                path.unlink(missing_ok=True)
                raise HTTPException(413, f"File is larger than {MAX_MB} MB.")
            f.write(chunk)

    cap = cv2.VideoCapture(str(path))
    fps, n = cap.get(cv2.CAP_PROP_FPS), cap.get(cv2.CAP_PROP_FRAME_COUNT)
    ok = cap.isOpened() and fps > 0 and n > 0
    cap.release()
    if not ok:
        path.unlink(missing_ok=True)
        raise HTTPException(400, "Could not read this video. Use H.264 .mp4.")
    if n / fps > MAX_SECONDS:
        path.unlink(missing_ok=True)
        raise HTTPException(400, f"Video is {n / fps:.0f} s long; the demo accepts up to 2 minutes.")
    jobs.submit(job_id, name)
    return {"id": job_id, "duration": round(n / fps, 2)}


@app.get("/jobs/{job_id}")
def get_job(job_id: str) -> dict:
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(404, "Unknown job (jobs are kept for a limited time).")
    return job


@app.get("/media/{job_id}.mp4")
def media(job_id: str) -> FileResponse:
    path = JOBS_DIR / Path(job_id).name / "annotated.mp4"
    if not path.exists():
        raise HTTPException(404, "Not rendered yet.")
    return FileResponse(path, media_type="video/mp4")
