"""Part B: causal accident risk from time-to-closest-approach between tracked vehicles.

Runs a small detector + ByteTrack on a downscaled frame every RISK_INTERVAL seconds, using only
frames already seen. For every pair of moving road users it extrapolates the current relative
motion and asks: will they come within CONTACT (in body sizes) within the anticipation horizon?
The closer and sooner, the higher the score.

No sample video contains an accident, so the mapping is calibrated the other way round: on
all four samples (ordinary dense traffic, ~18 min) the score must stay below the alarm
threshold, so an alarm means "sharper than anything in normal traffic here".
"""
from __future__ import annotations

import sys
import time

import cv2
import numpy as np

from src import config
from src.perception.detector import Detector
from src.perception.tracker import make_tracker, update_tracker

RISK_INTERVAL = 0.2        # s between processed frames
RISK_WIDTH = 1280          # px; frame width fed to the detector
RISK_WEIGHTS = config.WEIGHTS_DIR / "yolo11n.pt"
HISTORY = 1.0              # s of positions used for velocity
MIN_SPEED = 0.6            # body sizes / s; parked / queued vehicles never collide
CONTACT = 0.6              # body sizes at closest approach that counts as a conflict
HORIZON = 5.0              # s
TTC_SCALE = 1.5            # s; score halves every TTC_SCALE seconds of time to contact
EMA = 0.5                  # smoothing of the raw score between processed frames
# Monotone recalibration (keeps the ranking, so AP is unchanged): raw scores up to KNEE map
# into [0, 0.5). KNEE sits above the highest raw score over all four sample videos (0.94), so
# an alarm (>= 0.5) needs a conflict sharper than anything seen in ~18 min of normal traffic.
KNEE = 0.96
TIME_FACTOR = 3.0          # official budget: Part A + Part B <= 3 x video duration
SAFETY = 0.85              # never plan past this share of the budget
# The guard projects the whole run from the time used so far, which over the first seconds is
# mostly start-up cost multiplied by (duration / t); it may only act after GUARD_AFTER seconds.
GUARD_AFTER = 10.0
ROAD_USERS = {2, 3, 5, 7, 0, 1}   # car, motorcycle, bus, truck, person, bicycle
VEHICLES = {2, 3, 5, 7}


def calibrate(raw: float) -> float:
    if raw < KNEE:
        return 0.5 * raw / KNEE
    return 0.5 + 0.5 * (raw - KNEE) / (1.0 - KNEE)


class RiskModel:
    def __init__(self) -> None:
        self.detector = Detector(weights=RISK_WEIGHTS, imgsz=RISK_WIDTH)
        self.detector([np.zeros((720, RISK_WIDTH, 3), np.uint8)])   # load and warm up outside the timed run
        self.reset()

    def reset(self, duration: float = 0.0, part_a_sec: float = 0.0) -> None:
        self.budget = SAFETY * TIME_FACTOR * duration - part_a_sec   # wall time left for Part B
        self.wall0 = time.perf_counter()
        self.tracker = make_tracker(1.0 / RISK_INTERVAL)
        self.hist: dict[int, list[tuple[float, float, float, float, int]]] = {}   # id -> (t, x, y, size, cls)
        self.next_t = 0.0
        self.score = 0.0
        self.raw = 0.0
        self.busy = 0.0            # s of wall time spent in processed steps
        self.duration = duration
        self.guarding = False

    def _affordable(self, t: float) -> bool:
        """Would one more processed frame still let the harness finish the video in time?

        Projects the rest of the run from what has been seen: harness decoding (wall time not
        spent in our steps) scales with the frames left, our own work with the steps left.
        """
        if self.duration <= 0 or t < GUARD_AFTER:
            return True
        elapsed = time.perf_counter() - self.wall0
        left = max(self.duration - t, 0.0) / t
        decode = (elapsed - self.busy) * left
        ours = self.busy * left
        ok = elapsed + decode + ours < self.budget
        if not ok and not self.guarding:
            print(f"risk: time budget guard engaged at t={t:.1f}s; holding the last score", file=sys.stderr)
        self.guarding = not ok
        return ok

    def step(self, frame: np.ndarray, t: float) -> float:
        # the harness decodes every 4K frame on top of Part A; skip work rather than bust the budget
        if t + 1e-6 < self.next_t or not self._affordable(t):
            return self.score
        t0 = time.perf_counter()
        self.raw = self._process(frame, t)
        self.score = calibrate(self.raw)
        self.busy += time.perf_counter() - t0
        return self.score

    def _process(self, frame: np.ndarray, t: float) -> float:
        self.next_t = t + RISK_INTERVAL * 0.95
        h, w = frame.shape[:2]
        scale = RISK_WIDTH / w
        small = cv2.resize(frame, (RISK_WIDTH, round(h * scale)), interpolation=cv2.INTER_AREA)
        det = self.detector([small])[0]
        det = det[np.isin(det[:, 5].astype(int), list(ROAD_USERS))]
        tracks = update_tracker(self.tracker, det)
        for x1, y1, x2, y2, _, cls, tid in tracks:
            size = max(y2 - y1, 0.5 * (x2 - x1), 1.0)
            self.hist.setdefault(int(tid), []).append((t, (x1 + x2) / 2, y2, size, int(cls)))
        for tid in list(self.hist):
            self.hist[tid] = [r for r in self.hist[tid] if t - r[0] <= HISTORY]
            if not self.hist[tid]:
                del self.hist[tid]
        return EMA * self.raw + (1 - EMA) * self._pair_risk(t)

    def _states(self, t: float) -> list[tuple[np.ndarray, np.ndarray, float, int]]:
        out = []
        for rows in self.hist.values():
            if len(rows) < 3 or t - rows[-1][0] > 1e-3:
                continue
            a = np.asarray(rows)
            dt = a[-1, 0] - a[0, 0]
            if dt < 0.5:
                continue
            pos = a[-1, 1:3]
            vel = (a[-1, 1:3] - a[0, 1:3]) / dt
            size = float(np.median(a[:, 3]))
            out.append((pos, vel, size, int(a[-1, 4])))
        return out

    def _pair_risk(self, t: float) -> float:
        states = self._states(t)
        best = 0.0
        for i in range(len(states)):
            pi, vi, si, ci = states[i]
            for j in range(i + 1, len(states)):
                pj, vj, sj, cj = states[j]
                if ci not in VEHICLES and cj not in VEHICLES:
                    continue
                size = 0.5 * (si + sj)
                if max(np.linalg.norm(vi), np.linalg.norm(vj)) < MIN_SPEED * size:
                    continue
                p, v = pj - pi, vj - vi
                vv = float(v @ v)
                if vv < 1e-6:
                    continue
                t_star = -float(p @ v) / vv
                if not 0.0 < t_star <= HORIZON:
                    continue
                d_min = float(np.linalg.norm(p + v * t_star)) / size
                if d_min >= CONTACT:
                    continue
                closeness = 1.0 - d_min / CONTACT
                best = max(best, closeness * 0.5 ** (t_star / TTC_SCALE))
        return best
