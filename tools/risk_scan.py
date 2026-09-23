"""Run the Part B estimator over sample videos like the harness does and report alarm statistics.

    python tools/risk_scan.py samples [stride]

There are no accidents in the samples, so the goal is a quiet curve: every alarm here is false.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import cv2

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from evaluate import alarm_starts  # noqa: E402
from solution import RiskEstimator  # noqa: E402


def main() -> None:
    folder = Path(sys.argv[1] if len(sys.argv) > 1 else "samples")
    est = RiskEstimator()
    out = {}
    for path in sorted(p for p in folder.iterdir() if p.suffix.lower() == ".mp4"):
        cap = cv2.VideoCapture(str(path))
        fps = cap.get(cv2.CAP_PROP_FPS)
        est.reset({"video_id": path.name, "fps": fps, "width": 0, "height": 0,
                   "n_frames": int(cap.get(cv2.CAP_PROP_FRAME_COUNT))})
        curve, i, t0 = [], 0, time.perf_counter()
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            curve.append([i / fps, est.step(frame, i / fps)])
            i += 1
        wall = time.perf_counter() - t0
        s = [c[1] for c in curve]
        top = sorted(curve, key=lambda c: -c[1])[:5]
        print(f"{path.name}: {i / fps:.0f}s video, {wall:.0f}s wall ({wall / (i / fps):.2f}x), "
              f"max {max(s):.2f}, alarms {alarm_starts(curve)}, top {[(round(t, 1), round(v, 2)) for t, v in top]}",
              flush=True)
        out[path.name] = curve[::6]
    Path("outputs/risk_curves.json").write_text(json.dumps(out))


if __name__ == "__main__":
    main()
