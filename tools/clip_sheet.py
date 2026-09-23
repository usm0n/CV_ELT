"""One contact sheet of a short time window (proxy frames, optional crop), for pinning event boundaries.

    python tools/clip_sheet.py C3896 178 184 [n=8] [x0 y0 x1 y1]     # times in s, crop in proxy px

Output: outputs/clips/<stem>_<t0>-<t1>.jpg (2 rows, time burned into each tile).
"""
from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np

PROXY_DIR = Path("outputs/proxies")


def main() -> None:
    stem, t0, t1 = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
    n = int(sys.argv[4]) if len(sys.argv) > 4 else 8
    crop = [int(v) for v in sys.argv[5:9]] if len(sys.argv) >= 9 else None
    cap = cv2.VideoCapture(str(PROXY_DIR / f"{stem}.mp4"))
    tiles = []
    for t in np.linspace(t0, t1, n):
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ok, frame = cap.read()
        if not ok:
            continue
        if crop:
            frame = frame[crop[1]:crop[3], crop[0]:crop[2]]
        frame = cv2.resize(frame, (640, int(640 * frame.shape[0] / frame.shape[1])))
        cv2.putText(frame, f"{t:.1f}s", (8, 28), 0, 0.9, (0, 0, 0), 5)
        cv2.putText(frame, f"{t:.1f}s", (8, 28), 0, 0.9, (0, 255, 255), 2)
        tiles.append(frame)
    cols = (len(tiles) + 1) // 2
    while len(tiles) < 2 * cols:
        tiles.append(np.zeros_like(tiles[0]))
    sheet = np.vstack([np.hstack(tiles[:cols]), np.hstack(tiles[cols:])])
    out = Path("outputs/clips") / f"{stem}_{t0:.1f}-{t1:.1f}.jpg"
    out.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(out), sheet, [cv2.IMWRITE_JPEG_QUALITY, 80])
    print(out)


if __name__ == "__main__":
    main()
