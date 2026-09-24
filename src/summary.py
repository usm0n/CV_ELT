"""Compact per-video summaries for display (website export and live demo)."""
from __future__ import annotations

from typing import TYPE_CHECKING

import numpy as np

from src.scene.signal import STATE_NAMES

if TYPE_CHECKING:
    from src.events import Context


def pool_risk(risk: list[list[float]], step: float = 0.5) -> list[list[float]]:
    """Max-pool a [[t, score], ...] curve into `step`-second bins."""
    out: dict[int, float] = {}
    for t, s in risk:
        b = int(t // step)
        out[b] = max(out.get(b, 0.0), float(s))
    return [[round(b * step, 2), round(s, 4)] for b, s in sorted(out.items())]


def object_counts(tracks, duration: float, bin_s: float = 5.0) -> dict:
    """Mean tracked objects per sampled frame, per class, in `bin_s` bins."""
    n = max(int(np.ceil(duration / bin_s)), 1)
    times = np.unique(np.concatenate([tr.t for tr in tracks] or [np.zeros(0)]))
    frames = np.maximum(np.bincount(np.minimum((times // bin_s).astype(int), n - 1), minlength=n), 1)
    per: dict[str, np.ndarray] = {}
    for tr in tracks:
        b = np.minimum((tr.t // bin_s).astype(int), n - 1)
        per[tr.cls] = per.get(tr.cls, np.zeros(n)) + np.bincount(b, minlength=n)
    out = {"t": [round(b * bin_s, 1) for b in range(n)]}
    out.update({k: [round(float(x), 2) for x in v / frames] for k, v in sorted(per.items())})
    return out


def signal_runs(ctx: "Context") -> list[list]:
    """Signal phases as [[start, end, "red" | "amber" | "green" | "unknown"], ...]."""
    runs, s, t = [], ctx.signal_state, ctx.signal_t
    i = 0
    while i < len(s):
        j = i
        while j < len(s) and s[j] == s[i]:
            j += 1
        end = float(t[j]) if j < len(s) else ctx.meta.duration
        runs.append([round(float(t[i]), 2), round(end, 2), STATE_NAMES[int(s[i])]])
        i = j
    return runs
