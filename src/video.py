"""Video reading.

The camera records 4K 10-bit H.264 (IBBP GOP) at 29.97 fps, so decoding dominates the
runtime. Part A decodes with PyAV and skips non-reference (B) frames, which the codec can
drop without decoding: with a P frame every 3rd frame this yields ~10 fps of frames for a
third of the decode cost. Frames are scaled to WORK_WIDTH inside the decoder (sws), and a
full-resolution frame is produced only every `full_every` seconds for the traffic-signal
reader, whose lamps are a few pixels wide.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator

import av
import cv2
import numpy as np

WORK_WIDTH = 1920


@dataclass(frozen=True)
class VideoMeta:
    path: str
    fps: float
    n_frames: int
    width: int
    height: int

    @property
    def duration(self) -> float:
        return self.n_frames / self.fps if self.fps else 0.0


def read_meta(path: str) -> VideoMeta:
    """Same numbers as the organizers' harness (OpenCV), so durations agree exactly."""
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise RuntimeError(f"cannot open {path}")
    meta = VideoMeta(
        path=path,
        fps=cap.get(cv2.CAP_PROP_FPS) or 25.0,
        n_frames=int(cap.get(cv2.CAP_PROP_FRAME_COUNT)),
        width=int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
        height=int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
    )
    cap.release()
    return meta


@dataclass
class Sample:
    t: float                       # seconds from the first frame
    work: np.ndarray               # BGR, WORK_WIDTH wide
    full: np.ndarray | None        # BGR at native resolution, only every `full_every` seconds


def iter_samples(path: str, min_interval: float = 0.1, full_every: float = 0.4,
                 work_width: int = WORK_WIDTH) -> Iterator[Sample]:
    """Yield frames at most every `min_interval` seconds (reference frames only)."""
    with av.open(path) as container:
        stream = container.streams.video[0]
        stream.thread_type = "AUTO"
        stream.codec_context.skip_frame = "NONREF"
        # timestamps relative to the stream start (the first *displayed* frame), matching
        # the harness's frame_index / fps even though the first decoded frame may be later
        t0 = float(stream.start_time * stream.time_base) if stream.start_time is not None else 0.0
        next_t, next_full = 0.0, 0.0
        for frame in container.decode(stream):
            if frame.pts is None:
                continue
            t = float(frame.time) - t0
            if t + 1e-6 < next_t:
                continue
            next_t = t + min_interval * 0.9
            h = round(frame.height * work_width / frame.width)
            work = frame.reformat(width=work_width, height=h, format="bgr24").to_ndarray()
            full = None
            if t + 1e-6 >= next_full:
                full = frame.to_ndarray(format="bgr24")
                next_full = t + full_every * 0.9
            yield Sample(t=t, work=work, full=full)
