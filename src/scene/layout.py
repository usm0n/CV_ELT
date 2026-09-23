"""Scene layout in reference coordinates + learned priors (drivable area, traffic flow)."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np
import yaml

from src.scene.registration import REF_SIZE
from src.scene.signal import AMBER, GREEN, RED

SCENE_FILE = Path(__file__).with_name("scene.yaml")
PRIORS_FILE = Path(__file__).with_name("priors.npz")   # built by tools/build_scene_priors.py


def _poly(p) -> np.ndarray:
    return np.asarray(p, dtype=np.float32)


@dataclass
class Priors:
    """Learned from moving-vehicle trajectories of the sample videos.

    drivable: (h, w) bool grid, True where vehicles drive.
    flow:     (h, w, K, 2) unit vectors of up to K dominant travel directions per cell.
    flow_n:   (h, w, K) support (number of track samples) per direction.
    """
    cell: int
    drivable: np.ndarray
    flow: np.ndarray
    flow_n: np.ndarray

    def _cells(self, pts: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        gx = np.clip((pts[:, 0] // self.cell).astype(int), 0, self.drivable.shape[1] - 1)
        gy = np.clip((pts[:, 1] // self.cell).astype(int), 0, self.drivable.shape[0] - 1)
        inside = (pts[:, 0] >= 0) & (pts[:, 1] >= 0) & (pts[:, 0] < REF_SIZE[0]) & (pts[:, 1] < REF_SIZE[1])
        return gy, gx, inside

    def on_road(self, pts: np.ndarray) -> np.ndarray:
        gy, gx, inside = self._cells(pts)
        return self.drivable[gy, gx] & inside

    def flow_agreement(self, pts: np.ndarray, vel: np.ndarray, min_support: int = 20) -> np.ndarray:
        """Best cosine between each velocity and the cell's dominant directions (NaN if unknown)."""
        gy, gx, inside = self._cells(pts)
        dirs, n = self.flow[gy, gx], self.flow_n[gy, gx]           # (N, K, 2), (N, K)
        unit = vel / np.maximum(np.linalg.norm(vel, axis=1, keepdims=True), 1e-6)
        cos = np.einsum("nkd,nd->nk", dirs, unit)
        cos[n < min_support] = np.nan
        out = np.full(len(pts), np.nan)
        valid = inside & ~np.all(np.isnan(cos), axis=1)
        out[valid] = np.nanmax(cos[valid], axis=1)
        return out


@dataclass
class Scene:
    lamps: dict[int, tuple[float, float]]
    stop_line_main: np.ndarray
    crosswalks: dict[str, np.ndarray]
    median: np.ndarray
    islands: list[np.ndarray]
    junction: np.ndarray
    priors: Priors | None = None
    _masks: dict = field(default_factory=dict, repr=False)

    @classmethod
    def load(cls, path: Path = SCENE_FILE, priors_path: Path = PRIORS_FILE) -> "Scene":
        d = yaml.safe_load(path.read_text())
        lamps = {RED: tuple(d["signal_lamps"]["red"]), AMBER: tuple(d["signal_lamps"]["amber"]),
                 GREEN: tuple(d["signal_lamps"]["green"])}
        priors = None
        if priors_path.exists():
            z = np.load(priors_path)
            priors = Priors(int(z["cell"]), z["drivable"], z["flow"], z["flow_n"])
        return cls(lamps=lamps, stop_line_main=_poly(d["stop_line_main"]),
                   crosswalks={k: _poly(v) for k, v in d["crosswalks"].items()},
                   median=_poly(d["median"]), islands=[_poly(p) for p in d["islands"]],
                   junction=_poly(d["junction"]), priors=priors)

    # --- geometry queries (all in reference pixels) ---------------------------
    def _mask(self, key: str, polys: list[np.ndarray]) -> np.ndarray:
        if key not in self._masks:
            m = np.zeros((REF_SIZE[1], REF_SIZE[0]), np.uint8)
            cv2.fillPoly(m, [p.astype(np.int32) for p in polys], 1)
            self._masks[key] = m.astype(bool)
        return self._masks[key]

    def _lookup(self, mask: np.ndarray, pts: np.ndarray) -> np.ndarray:
        x = np.clip(pts[:, 0].astype(int), 0, REF_SIZE[0] - 1)
        y = np.clip(pts[:, 1].astype(int), 0, REF_SIZE[1] - 1)
        inside = (pts[:, 0] >= 0) & (pts[:, 1] >= 0) & (pts[:, 0] < REF_SIZE[0]) & (pts[:, 1] < REF_SIZE[1])
        return mask[y, x] & inside

    def in_crosswalk(self, pts: np.ndarray, name: str | None = None, margin: int = 0) -> np.ndarray:
        """Inside a crosswalk polygon (or any, if `name` is None), grown by `margin` px."""
        key = f"cw:{name}:{margin}"
        if key not in self._masks:
            polys = [self.crosswalks[name]] if name else list(self.crosswalks.values())
            mask = self._mask(f"cw:{name}:0", polys)
            if margin:
                k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * margin + 1, 2 * margin + 1))
                mask = cv2.dilate(mask.astype(np.uint8), k).astype(bool)
            self._masks[key] = mask
        return self._lookup(self._masks[key], pts)

    def on_island(self, pts: np.ndarray, margin: int = 0) -> np.ndarray:
        key = f"islands:{margin}"
        if key not in self._masks:
            mask = self._mask("islands", self.islands + [self.median])
            if margin:
                k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * margin + 1, 2 * margin + 1))
                mask = cv2.dilate(mask.astype(np.uint8), k).astype(bool)
            self._masks[key] = mask
        return self._lookup(self._masks[key], pts)

    def in_junction(self, pts: np.ndarray) -> np.ndarray:
        return self._lookup(self._mask("junction", [self.junction]), pts)

    def side_of_stop_line(self, pts: np.ndarray) -> np.ndarray:
        """Signed side of the main stop line: < 0 before it (upstream), > 0 past it.

        Uses the line's end points; the polyline is nearly straight.
        """
        a, b = self.stop_line_main[0], self.stop_line_main[-1]
        n = np.array([-(b - a)[1], (b - a)[0]], dtype=np.float64)
        n /= np.linalg.norm(n)
        # orient so that the downstream side (towards the camera) is positive
        if n[1] < 0:
            n = -n
        return (pts - a) @ n

    def within_stop_line_span(self, pts: np.ndarray, margin: float = 20.0) -> np.ndarray:
        """True where a point projects onto the stop line segment (i.e. it is in the approach lanes)."""
        a, b = self.stop_line_main[0], self.stop_line_main[-1]
        d = b - a
        u = (pts - a) @ d / float(d @ d)
        m = margin / float(np.linalg.norm(d))
        return (u >= -m) & (u <= 1 + m)
