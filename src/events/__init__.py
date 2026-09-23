"""Event rules. Each rule module registers one class: Context -> raw intervals."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

import numpy as np

from src.events.segments import Candidate
from src.scene.layout import Scene
from src.scene.signal import UNKNOWN
from src.tracks import Track
from src.video import VideoMeta


@dataclass
class Context:
    meta: VideoMeta
    tracks: list[Track]
    scene: Scene
    signal_t: np.ndarray
    signal_state: np.ndarray
    cache: dict = field(default_factory=dict, repr=False)   # per-video intermediates shared by rules

    def signal_at(self, t: np.ndarray) -> np.ndarray:
        """Signal state at arbitrary times (last reading at or before t)."""
        if not len(self.signal_t):
            return np.full(np.shape(t), UNKNOWN)
        idx = np.searchsorted(self.signal_t, t, side="right") - 1
        return np.where(idx >= 0, self.signal_state[np.clip(idx, 0, None)], UNKNOWN)

    def phases(self, state: int) -> list[tuple[float, float]]:
        """Maximal runs of one signal state as (start, end); end = first reading of the next state."""
        out: list[tuple[float, float]] = []
        s = self.signal_state
        i = 0
        while i < len(s):
            j = i
            while j < len(s) and s[j] == s[i]:
                j += 1
            if s[i] == state:
                end = float(self.signal_t[j]) if j < len(s) else self.meta.duration
                out.append((float(self.signal_t[i]), end))
            i = j
        return out


@dataclass(frozen=True)
class Rule:
    fn: Callable[[Context], list[Candidate]]
    merge_gap: float = 1.0   # join fragments closer than this (s)
    min_len: float = 0.5     # drop segments shorter than this (s)


RULES: dict[str, Rule] = {}


def register(label: str, merge_gap: float = 1.0, min_len: float = 0.5):
    def deco(fn: Callable[[Context], list[Candidate]]):
        RULES[label] = Rule(fn, merge_gap, min_len)
        return fn
    return deco


def load_rules() -> dict[str, Rule]:
    """Import every rule module (each registers its classes) and return the registry."""
    from src.events import pedestrian_rules, signal_rules, vehicle_rules  # noqa: F401

    return RULES
