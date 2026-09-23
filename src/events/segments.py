"""Turn per-sample flags or raw intervals into clean, non-overlapping event segments."""
from __future__ import annotations

from typing import NamedTuple

import numpy as np

Interval = tuple[float, float]


class Candidate(NamedTuple):
    """A raw event hypothesis from a rule, with the objects involved (for review/rendering)."""
    start: float
    end: float
    track_ids: tuple[int, ...] = ()
    note: str = ""


def mask_to_intervals(t: np.ndarray, mask: np.ndarray, dt: float) -> list[Interval]:
    """Contiguous runs of True samples -> [start, end] where end extends one sample (dt)."""
    out: list[Interval] = []
    if not len(mask):
        return out
    m = np.concatenate([[False], mask.astype(bool), [False]])
    starts = np.flatnonzero(~m[:-1] & m[1:])
    ends = np.flatnonzero(m[:-1] & ~m[1:]) - 1
    for s, e in zip(starts, ends):
        out.append((float(t[s]), float(t[e] + dt)))
    return out


def merge_intervals(intervals, gap: float = 0.0) -> list[Interval]:
    """Union of intervals (or Candidates), also joining ones separated by <= `gap` seconds."""
    merged: list[list[float]] = []
    for s, e in sorted((float(c[0]), float(c[1])) for c in intervals):
        if merged and s - merged[-1][1] <= gap:
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([s, e])
    return [(s, e) for s, e in merged]


def finalize(intervals, duration: float, merge_gap: float = 1.0,
             min_len: float = 0.5) -> list[Interval]:
    """Merge fragments, drop blips, clip to [0, duration]. Output never self-overlaps."""
    out = []
    for s, e in merge_intervals(intervals, merge_gap):
        s, e = max(0.0, s), min(duration, e)
        if e - s >= min_len:
            out.append((round(s, 2), round(e, 2)))
    return out
