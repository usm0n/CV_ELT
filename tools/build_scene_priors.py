"""Learn scene priors from the sample videos' trajectories -> src/scene/priors.npz.

    WIUT_CACHE_DIR=.cache python tools/build_scene_priors.py samples

drivable  cells where moving vehicles' ground points were observed (closed + dilated)
flow      per cell, up to K dominant travel directions (peaks of a smoothed angle histogram)

This is the only "training" step of the rule-based part; it is deterministic.
"""
from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np
from scipy.ndimage import gaussian_filter1d

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.pipeline import observe  # noqa: E402
from src.scene.layout import PRIORS_FILE, Scene  # noqa: E402
from src.scene.registration import REF_SIZE  # noqa: E402
from src.tracks import build_tracks  # noqa: E402
from src.video import read_meta  # noqa: E402

CELL = 16                 # reference px per grid cell
MIN_SPEED = 25.0          # ref px/s: vehicle is moving
ANGLE_BINS = 36
K = 3                     # max directions per cell
MIN_PEAK_SHARE = 0.15     # a direction must hold this share of the cell's samples
DRIVABLE_MIN = 3          # samples per cell to count as drivable


def collect(folder: Path) -> tuple[np.ndarray, np.ndarray]:
    scene = Scene.load(priors_path=Path("/nonexistent"))
    pts, vels = [], []
    for path in sorted(p for p in folder.iterdir() if p.suffix.lower() == ".mp4"):
        obs = observe(read_meta(str(path)), scene)
        for tr in build_tracks(obs.table, to_ref=np.linalg.inv(obs.H)):
            if not tr.is_vehicle or len(tr.t) < 10:
                continue
            moving = tr.speed > MIN_SPEED
            pts.append(tr.foot[moving])
            vels.append(tr.vel[moving])
        print(f"{path.name}: {sum(len(p) for p in pts)} moving samples so far", flush=True)
    return np.concatenate(pts), np.concatenate(vels)


def build(pts: np.ndarray, vels: np.ndarray) -> dict:
    gw, gh = REF_SIZE[0] // CELL, REF_SIZE[1] // CELL
    gx = np.clip((pts[:, 0] // CELL).astype(int), 0, gw - 1)
    gy = np.clip((pts[:, 1] // CELL).astype(int), 0, gh - 1)
    ang = np.arctan2(vels[:, 1], vels[:, 0])
    abin = ((ang + np.pi) / (2 * np.pi) * ANGLE_BINS).astype(int) % ANGLE_BINS

    hist = np.zeros((gh, gw, ANGLE_BINS))
    np.add.at(hist, (gy, gx, abin), 1)
    # pool neighbouring cells (3x3) so sparse cells still get a direction estimate
    pooled = cv2.blur(hist.reshape(gh, gw, -1).astype(np.float32), (3, 3)) * 9
    pooled = gaussian_filter1d(pooled, sigma=1.0, axis=2, mode="wrap")

    count = hist.sum(axis=2)
    drivable = count >= DRIVABLE_MIN
    kernel = np.ones((3, 3), np.uint8)
    drivable = cv2.morphologyEx(drivable.astype(np.uint8), cv2.MORPH_CLOSE, kernel, iterations=2)
    drivable = cv2.dilate(drivable, kernel, iterations=1).astype(bool)

    flow = np.zeros((gh, gw, K, 2), np.float32)
    flow_n = np.zeros((gh, gw, K), np.float32)
    centres = (np.arange(ANGLE_BINS) + 0.5) / ANGLE_BINS * 2 * np.pi - np.pi
    for y in range(gh):
        for x in range(gw):
            h = pooled[y, x]
            total = h.sum()
            if total <= 0:
                continue
            peaks = [i for i in range(ANGLE_BINS) if h[i] >= h[i - 1] and h[i] > h[(i + 1) % ANGLE_BINS]]
            peaks = sorted(peaks, key=lambda i: -h[i])
            k = 0
            for i in peaks:
                # support: mass within +-30 degrees of the peak
                window = [(i + d) % ANGLE_BINS for d in range(-3, 4)]
                support = h[window].sum()
                if support / total < MIN_PEAK_SHARE or k == K:
                    continue
                flow[y, x, k] = (np.cos(centres[i]), np.sin(centres[i]))
                flow_n[y, x, k] = support
                k += 1
    return {"cell": CELL, "drivable": drivable, "flow": flow, "flow_n": flow_n}


def main() -> None:
    folder = Path(sys.argv[1] if len(sys.argv) > 1 else "samples")
    pts, vels = collect(folder)
    priors = build(pts, vels)
    np.savez_compressed(PRIORS_FILE, **priors)
    print(f"wrote {PRIORS_FILE}: drivable cells {int(priors['drivable'].sum())}, "
          f"cells with flow {int((priors['flow_n'][..., 0] > 0).sum())}")


if __name__ == "__main__":
    main()
