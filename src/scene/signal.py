"""Read the visible vehicle signal head (red / amber / green) from frames."""
from __future__ import annotations

import cv2
import numpy as np

from src.scene.registration import warp_points

UNKNOWN, RED, AMBER, GREEN = 0, 1, 2, 3
STATE_NAMES = {UNKNOWN: "unknown", RED: "red", AMBER: "amber", GREEN: "green"}

# HSV hue ranges (OpenCV 0..180) of a lit lamp.
_HUES = {RED: [(0, 12), (165, 180)], AMBER: [(13, 35)], GREEN: [(55, 100)]}
_MIN_SAT, _MIN_VAL = 90, 70
_MIN_LIT_AREA = 3.0    # lit pixels needed, in reference-pixel units (x scale^2 in the video)


class SignalReader:
    """Classifies the lamp state of one signal head.

    `lamps` maps state -> lamp centre in reference pixels; `H` maps reference
    pixels into this video. Each lamp is read in a small window so a few pixels
    of registration error do not matter.
    """

    def __init__(self, lamps: dict[int, tuple[float, float]], H: np.ndarray, ref_window: float = 7.0):
        self.centres = {s: warp_points(H, [c])[0] for s, c in lamps.items()}
        scale = float(np.sqrt(abs(np.linalg.det(H[:2, :2]))))
        self.half = max(3, int(round(ref_window * scale)))
        self.min_lit = _MIN_LIT_AREA * scale ** 2

    def _lit_pixels(self, hsv_patch: np.ndarray, state: int) -> int:
        h, s, v = hsv_patch[..., 0], hsv_patch[..., 1], hsv_patch[..., 2]
        colour = np.zeros(h.shape, bool)
        for lo, hi in _HUES[state]:
            colour |= (h >= lo) & (h <= hi)
        lit = colour & (s >= _MIN_SAT) & (v >= _MIN_VAL)
        return int(lit.sum())

    def read(self, frame: np.ndarray) -> int:
        scores = {}
        for state, (x, y) in self.centres.items():
            x, y = int(round(x)), int(round(y))
            patch = frame[max(0, y - self.half):y + self.half, max(0, x - self.half):x + self.half]
            if patch.size == 0:
                return UNKNOWN
            scores[state] = self._lit_pixels(cv2.cvtColor(patch, cv2.COLOR_BGR2HSV), state)
        best = max(scores, key=scores.get)
        if scores[best] < self.min_lit:
            return UNKNOWN
        # red + amber together (pre-green) still means "stop"
        return RED if best == AMBER and scores.get(RED, 0) >= self.min_lit else best


def smooth_states(states: np.ndarray, min_run: int = 3) -> np.ndarray:
    """Fill UNKNOWN samples with the last known state and remove runs shorter than `min_run`."""
    out = states.copy()
    last = UNKNOWN
    for i, s in enumerate(out):
        if s == UNKNOWN:
            out[i] = last
        else:
            last = s
    # suppress flicker: a short run takes the value of the preceding run
    i = 0
    while i < len(out):
        j = i
        while j < len(out) and out[j] == out[i]:
            j += 1
        if j - i < min_run and i > 0:
            out[i:j] = out[i - 1]
        i = j
    return out
