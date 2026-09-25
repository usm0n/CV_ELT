"""Detect + track a whole video into a flat observation table (one decode pass)."""
from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Callable

import numpy as np
import supervision as sv
from src.vendor.trackers.core.bytetrack.tracker import ByteTrackTracker

from src import config
from src.perception.detector import Detector
from src.video import Sample, VideoMeta, iter_samples

# Observation table columns; boxes are in work-frame pixels (src.video.WORK_WIDTH wide).
COLS = ("t", "track_id", "coco_cls", "conf", "x1", "y1", "x2", "y2")
CACHE_VERSION = "v2"


def make_tracker(sample_fps: float) -> ByteTrackTracker:
    return ByteTrackTracker(frame_rate=sample_fps, lost_track_buffer=int(2 * sample_fps),
                            track_activation_threshold=0.4, high_conf_det_threshold=0.5,
                            minimum_consecutive_frames=2)


def update_tracker(tracker: ByteTrackTracker, det: np.ndarray) -> np.ndarray:
    """Feed one frame of detections (N, 6) and return confirmed tracks (M, 7): box, conf, cls, id."""
    d = sv.Detections(xyxy=det[:, :4].astype(float), confidence=det[:, 4], class_id=det[:, 5].astype(int))
    out = tracker.update(d)
    keep = out.tracker_id >= 0
    return np.concatenate([out.xyxy[keep], out.confidence[keep, None], out.class_id[keep, None],
                           out.tracker_id[keep, None]], axis=1)


def _cache_path(meta: VideoMeta) -> Path | None:
    if config.CACHE_DIR is None:
        return None
    p = Path(meta.path)
    key = (f"{CACHE_VERSION}:{p.name}:{p.stat().st_size}:{config.SAMPLE_INTERVAL}:"
           f"{config.DETECTOR_WEIGHTS.name}:{config.DETECTOR_IMGSZ}")
    return config.CACHE_DIR / f"{p.stem}-{hashlib.sha1(key.encode()).hexdigest()[:10]}.npz"


def scan_video(meta: VideoMeta, detector: Detector | None = None,
               on_full_frame: Callable[[float, np.ndarray], None] | None = None,
               batch: int = config.DETECTOR_BATCH) -> np.ndarray:
    """Decode once; detect + track every sample; pass full-res frames to `on_full_frame`.

    Returns the (N, 8) observation table (see COLS).
    """
    detector = detector or Detector()
    tracker = make_tracker(1.0 / config.SAMPLE_INTERVAL)
    rows: list[np.ndarray] = []
    buf: list[Sample] = []

    def flush() -> None:
        for s, det in zip(buf, detector([b.work for b in buf])):
            tr = update_tracker(tracker, det)
            if len(tr):
                rows.append(np.column_stack([np.full(len(tr), s.t), tr[:, 6], tr[:, 5], tr[:, 4], tr[:, :4]]))
        buf.clear()

    for sample in iter_samples(meta.path, min_interval=config.SAMPLE_INTERVAL):
        if sample.full is not None and on_full_frame is not None:
            on_full_frame(sample.t, sample.full)
            sample.full = None                      # release the 4K frame early
        buf.append(sample)
        if len(buf) == batch:
            flush()
    flush()
    return np.concatenate(rows).astype(np.float64) if rows else np.zeros((0, len(COLS)))


def load_cached(meta: VideoMeta) -> dict | None:
    path = _cache_path(meta)
    return dict(np.load(path)) if path is not None and path.exists() else None


def save_cached(meta: VideoMeta, **arrays: np.ndarray) -> None:
    path = _cache_path(meta)
    if path is not None:
        path.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(path, **arrays)
