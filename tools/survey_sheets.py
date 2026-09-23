"""Dense contact sheets of a whole video, for manual dev-set labelling.

    WIUT_CACHE_DIR=.cache python tools/survey_sheets.py samples/C3896.MP4 [step_s] [x0 y0 x1 y1]

Each sheet is a 2x2 grid of proxy frames `step_s` apart (default 3 s) with the time and the
signal state burned in; tracked people are boxed in yellow, vehicles in thin grey, so small
pedestrians stay visible. An optional crop (proxy px) zooms into one region.
Output: outputs/survey/<stem>/<start>.jpg
"""
from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.pipeline import analyze  # noqa: E402
from src.scene.signal import STATE_NAMES  # noqa: E402
from src.video import WORK_WIDTH  # noqa: E402
from tools.review_candidates import PROXY_DIR, boxes_at  # noqa: E402

TILE = (960, 540)


def main() -> None:
    video = sys.argv[1]
    step = float(sys.argv[2]) if len(sys.argv) > 2 else 3.0
    crop = [int(v) for v in sys.argv[3:7]] if len(sys.argv) >= 7 else None
    ctx, _ = analyze(video, [])
    stem = Path(video).stem
    cap = cv2.VideoCapture(str(PROXY_DIR / f"{stem}.mp4"))
    scale = cap.get(cv2.CAP_PROP_FRAME_WIDTH) / WORK_WIDTH
    out_dir = Path("outputs/survey") / (stem + ("_crop" if crop else ""))
    out_dir.mkdir(parents=True, exist_ok=True)
    times = np.arange(0.0, ctx.meta.duration, step)
    for k in range(0, len(times), 4):
        tiles = []
        for t in times[k:k + 4]:
            cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
            ok, frame = cap.read()
            if not ok:
                frame = np.zeros((720, 1280, 3), np.uint8)
            for tid, cls, b in boxes_at(ctx, t, scale):
                p0, p1 = tuple(b[:2].astype(int)), tuple(b[2:].astype(int))
                if cls == "person":
                    cv2.rectangle(frame, p0, p1, (0, 255, 255), 2)
                    cv2.putText(frame, str(tid), (p0[0], p0[1] - 3), 0, 0.45, (0, 255, 255), 1)
                else:
                    cv2.rectangle(frame, p0, p1, (160, 160, 160), 1)
            state = STATE_NAMES[int(ctx.signal_at(np.array([t]))[0])]
            if crop:
                frame = frame[crop[1]:crop[3], crop[0]:crop[2]]
            frame = cv2.resize(frame, TILE)
            cv2.putText(frame, f"{stem} t={t:.1f}s {state}", (10, 34), 0, 1.0, (0, 0, 0), 5)
            cv2.putText(frame, f"{stem} t={t:.1f}s {state}", (10, 34), 0, 1.0, (0, 255, 255), 2)
            tiles.append(frame)
        while len(tiles) < 4:
            tiles.append(np.zeros_like(tiles[0]))
        sheet = np.vstack([np.hstack(tiles[:2]), np.hstack(tiles[2:])])
        cv2.imwrite(str(out_dir / f"{times[k]:06.1f}.jpg"), sheet, [cv2.IMWRITE_JPEG_QUALITY, 80])
    print(f"{stem}: {len(range(0, len(times), 4))} sheets -> {out_dir}")


if __name__ == "__main__":
    main()
