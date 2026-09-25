"""Live demo API (Docker, CPU): upload an .mp4, get events, risk and annotated playback.

    uvicorn demo.app:app --port 7860            # from the repository root

    POST /jobs            multipart `file` (.mp4, <= MAX_MB, <= MAX_SECONDS)  -> {"id": ...}
    POST /uploads         start a chunked upload (for clips over MAX_MB)      -> {"id": ..., "chunk_mb": ...}
    PUT  /uploads/{id}    raw bytes of the next chunk, `?offset=` bytes already sent
    POST /uploads/{id}/finish?name=  check the video and queue it             -> {"id": ...}
    POST /jobs/sample     run the bundled sample clip (the finished result is reused)
    GET  /jobs/{id}       state, progress (0..1), queue position, result when done
    GET  /media/{id}.mp4  annotated playback
    GET  /health          model settings and limits

CPU settings (env, read before the pipeline is imported):
    DEMO_DETECTOR         weights file in weights/ for Part A (default yolo11n.pt; the submission uses yolo11m.pt)
    DEMO_SAMPLE_INTERVAL  seconds between Part A frames (default 0.2; the submission uses 0.1)
    DEMO_ORIGINS          comma-separated CORS origins (default *)
    DEMO_SAMPLE           path of the sample clip behind POST /jobs/sample (default demo/sample.mp4)
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import cv2
from fastapi import FastAPI, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src import config  # noqa: E402

# Must happen before src.perception.detector is imported: its defaults bind at import time.
config.DETECTOR_WEIGHTS = config.WEIGHTS_DIR / os.environ.get("DEMO_DETECTOR", "yolo11n.pt")
config.SAMPLE_INTERVAL = float(os.environ.get("DEMO_SAMPLE_INTERVAL", "0.2"))

from demo.jobs import JOBS_DIR, JobQueue  # noqa: E402

MAX_MB = 95                  # the Cloudflare tunnel in front rejects request bodies over 100 MB
MAX_UPLOAD_MB = 4096         # chunked uploads: a raw 2-minute 4K clip from the camera is ~2.2 GB
UPLOAD_CHUNK_MB = 32         # per PUT, well under the tunnel's cap
MAX_SECONDS = 150            # the page asks for <= 2 min; a little slack for rounding
CHUNK = 1 << 20
SAMPLE = Path(os.environ.get("DEMO_SAMPLE", ROOT / "demo" / "sample.mp4"))
SAMPLE_NAME = "sample_C3902_78-123s.mp4"

app = FastAPI(title="WIUT CV demo")
app.add_middleware(CORSMiddleware, allow_origins=os.environ.get("DEMO_ORIGINS", "*").split(","),
                   allow_methods=["GET", "POST"], allow_headers=["*"])
jobs = JobQueue()


@app.get("/health")
def health() -> dict:
    return {"ok": True, "detector": config.DETECTOR_WEIGHTS.name, "sample_interval": config.SAMPLE_INTERVAL,
            "enabled_classes": sorted(config.ENABLED_CLASSES), "max_mb": MAX_UPLOAD_MB, "chunk_mb": UPLOAD_CHUNK_MB,
            "max_seconds": MAX_SECONDS, "sample": SAMPLE.exists()}


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

    return _queue(job_id, path, name)


def _queue(job_id: str, path: Path, name: str) -> dict:
    """Check that `path` is a readable clip of at most MAX_SECONDS, then queue it."""
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


def _upload_path(upload_id: str) -> Path:
    path = JOBS_DIR / Path(upload_id).name / "input.mp4"
    if not path.exists():
        raise HTTPException(404, "Unknown upload.")
    return path


@app.post("/uploads")
def start_upload() -> dict:
    job_id, d = jobs.new_job_dir()
    (d / "input.mp4").touch()
    return {"id": job_id, "chunk_mb": UPLOAD_CHUNK_MB}


@app.put("/uploads/{upload_id}")
async def upload_chunk(upload_id: str, offset: int, request: Request) -> dict:
    path = _upload_path(upload_id)
    size = path.stat().st_size
    if offset != size:                         # a retried chunk that already landed, or a gap:
        async for _ in request.stream():       # drain it so the connection stays usable,
            pass
        return {"received": size}              # and tell the client where to resume
    with path.open("ab") as f:
        async for part in request.stream():
            size += len(part)
            if size > MAX_UPLOAD_MB * 2**20:
                f.close()
                path.unlink(missing_ok=True)
                raise HTTPException(413, f"File is larger than {MAX_UPLOAD_MB // 1024} GB.")
            f.write(part)
    return {"received": size}


@app.post("/uploads/{upload_id}/finish")
def finish_upload(upload_id: str, name: str = "upload.mp4") -> dict:
    name = Path(name).name
    if not name.lower().endswith((".mp4", ".mov", ".m4v")):
        raise HTTPException(400, "Please upload an .mp4 video.")
    return _queue(Path(upload_id).name, _upload_path(upload_id), name)


@app.post("/jobs/sample")
def sample_job() -> dict:
    """Queue the bundled sample clip; once it has finished, every later click gets that result."""
    if not SAMPLE.exists():
        raise HTTPException(404, "No sample clip on this server.")
    cached = jobs.pinned_job()
    if cached is not None:
        return {"id": cached}
    job_id, d = jobs.new_job_dir()
    (d / "input.mp4").symlink_to(SAMPLE.resolve())
    jobs.submit(job_id, SAMPLE_NAME, pin=True)
    return {"id": job_id}


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
