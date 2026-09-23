"""Per-object trajectories with smoothed kinematics built from the observation table.

Positions and speeds are expressed in reference-view pixels (see src/scene/registration.py)
so that every rule works in one coordinate frame regardless of per-video zoom/shift.
Boxes stay in video pixels for rendering.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np
from scipy.ndimage import uniform_filter1d

from src import config

SMOOTH_WINDOW = 5  # samples (~0.6 s at 8.3 fps)


@dataclass
class Track:
    id: int
    cls: str                      # majority COCO class name
    t: np.ndarray                 # (N,) seconds
    boxes: np.ndarray             # (N, 4) x1, y1, x2, y2 in video pixels
    to_ref: np.ndarray = field(default_factory=lambda: np.eye(3), repr=False)  # video px -> reference px
    foot: np.ndarray = field(init=False)   # (N, 2) smoothed bottom-centre (ground contact), reference px
    vel: np.ndarray = field(init=False)    # (N, 2) reference px/s
    speed: np.ndarray = field(init=False)  # (N,) reference px/s
    size: float = field(init=False)        # median box height, reference px

    def __post_init__(self) -> None:
        raw = np.column_stack([(self.boxes[:, 0] + self.boxes[:, 2]) / 2, self.boxes[:, 3]])
        raw = cv2.perspectiveTransform(raw.reshape(-1, 1, 2), self.to_ref).reshape(-1, 2)
        w = min(SMOOTH_WINDOW, len(raw))
        self.foot = uniform_filter1d(raw, size=w, axis=0, mode="nearest")
        if len(self.t) > 1:
            self.vel = np.gradient(self.foot, self.t, axis=0)
        else:
            self.vel = np.zeros_like(self.foot)
        self.speed = np.linalg.norm(self.vel, axis=1)
        scale = float(np.sqrt(abs(np.linalg.det(self.to_ref[:2, :2]))))
        self.size = float(np.median(self.boxes[:, 3] - self.boxes[:, 1])) * scale

    @property
    def is_vehicle(self) -> bool:
        return self.cls in config.VEHICLE_CLASSES

    @property
    def is_person(self) -> bool:
        return self.cls == "person"

    @property
    def rel_speed(self) -> np.ndarray:
        """Speed in own-body-heights per second: a rough perspective-invariant speed."""
        return self.speed / max(self.size, 1.0)

    @property
    def duration(self) -> float:
        return float(self.t[-1] - self.t[0])


def build_tracks(table: np.ndarray, to_ref: np.ndarray | None = None, min_len: int = 3) -> list[Track]:
    """Group the (N, 9) observation table (see perception.tracker.COLS) into Track objects.

    `to_ref` maps video pixels to reference pixels (inverse of the registration homography).
    """
    to_ref = np.eye(3) if to_ref is None else to_ref
    tracks = []
    if not len(table):
        return tracks
    ids = table[:, 1].astype(int)
    for tid in np.unique(ids):
        rows = table[ids == tid]
        rows = rows[np.argsort(rows[:, 0])]
        if len(rows) < min_len:
            continue
        cls_ids, counts = np.unique(rows[:, 2].astype(int), return_counts=True)
        cls = config.COCO_KEEP[int(cls_ids[np.argmax(counts)])]
        tracks.append(Track(id=int(tid), cls=cls, t=rows[:, 0], boxes=rows[:, 4:8], to_ref=to_ref))
    return tracks
