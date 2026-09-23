"""Align a video's view to the reference view.

The "fixed" camera drifts between recordings (small zoom and shift), so scene
geometry is drawn once on `reference.jpg` and mapped into each video with a
homography estimated from SIFT matches on static structure.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np

REFERENCE_IMAGE = Path(__file__).with_name("reference.jpg")
REF_SIZE = (1920, 1080)          # reference image size (w, h); scene.yaml uses these pixel coords
MIN_INLIERS = 25


@lru_cache(maxsize=1)
def _reference_features():
    ref = cv2.imread(str(REFERENCE_IMAGE), cv2.IMREAD_GRAYSCALE)
    sift = cv2.SIFT_create(4000)
    kp, desc = sift.detectAndCompute(ref, None)
    return np.float32([k.pt for k in kp]), desc


def _to_ref_scale(frame: np.ndarray) -> tuple[np.ndarray, float]:
    """Resize a BGR frame to reference width; return (gray, scale video_px / ref_px)."""
    scale = frame.shape[1] / REF_SIZE[0]
    small = cv2.resize(frame, (REF_SIZE[0], round(frame.shape[0] / scale)), interpolation=cv2.INTER_AREA)
    return cv2.cvtColor(small, cv2.COLOR_BGR2GRAY), scale


def estimate_homography(frame: np.ndarray) -> np.ndarray:
    """Homography mapping reference pixels -> pixels of `frame` (any resolution).

    `frame` is ideally a median background of the video; a single frame also works
    because RANSAC discards matches on moving objects. Falls back to a pure scale
    when too few matches survive (e.g. a very different camera).
    """
    gray, scale = _to_ref_scale(frame)
    S = np.diag([scale, scale, 1.0])
    ref_pts, ref_desc = _reference_features()
    kp, desc = cv2.SIFT_create(4000).detectAndCompute(gray, None)
    if desc is None or len(kp) < MIN_INLIERS:
        return S
    matches = [a for a, b in cv2.BFMatcher().knnMatch(ref_desc, desc, k=2) if a.distance < 0.75 * b.distance]
    if len(matches) < MIN_INLIERS:
        return S
    src = ref_pts[[m.queryIdx for m in matches]]
    dst = np.float32([kp[m.trainIdx].pt for m in matches])
    H, inliers = cv2.findHomography(src, dst, cv2.RANSAC, 3.0)
    if H is None or int(inliers.sum()) < MIN_INLIERS:
        return S
    return S @ H


def median_background(path: str, n: int = 12, width: int = REF_SIZE[0]) -> np.ndarray:
    """Median of `n` keyframes spread over the video: moving traffic disappears.

    Seeks to keyframes only, so it costs a handful of decodes regardless of length.
    """
    import av

    frames = []
    with av.open(path) as container:
        stream = container.streams.video[0]
        stream.codec_context.skip_frame = "NONKEY"
        duration = float(stream.duration * stream.time_base) if stream.duration else float(container.duration) / 1e6
        for k in range(n):
            container.seek(int((k + 0.5) / n * duration / stream.time_base), stream=stream)
            frame = next(container.decode(stream), None)
            if frame is not None:
                h = round(frame.height * width / frame.width)
                frames.append(frame.reformat(width=width, height=h, format="bgr24").to_ndarray())
    return np.median(np.stack(frames), axis=0).astype(np.uint8)


def warp_points(H: np.ndarray, pts) -> np.ndarray:
    pts = np.asarray(pts, dtype=np.float64).reshape(-1, 1, 2)
    return cv2.perspectiveTransform(pts, H).reshape(-1, 2)
