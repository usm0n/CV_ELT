"""Contact sheets of rule candidates for visual review.

    WIUT_CACHE_DIR=.cache python tools/review_candidates.py samples/C3896.MP4 red_light stop_line

Frames come from the 720p proxy (outputs/proxies/<stem>.mp4); the objects a rule
blamed are boxed in red, other road users in grey. Output: outputs/review/<stem>/.
"""
from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.pipeline import analyze  # noqa: E402
from src.video import WORK_WIDTH  # noqa: E402

N_FRAMES = 4
PROXY_DIR = Path("outputs/proxies")


def boxes_at(ctx, t: float, scale: float) -> list[tuple[int, str, np.ndarray]]:
    out = []
    for tr in ctx.tracks:
        if tr.t[0] - 0.05 <= t <= tr.t[-1] + 0.05:
            i = int(np.argmin(np.abs(tr.t - t)))
            if abs(tr.t[i] - t) < 0.3:
                out.append((tr.id, tr.cls, tr.boxes[i] * scale))
    return out


def main() -> None:
    video, labels = sys.argv[1], sys.argv[2:] or None
    ctx, candidates = analyze(video, labels)
    stem = Path(video).stem
    cap = cv2.VideoCapture(str(PROXY_DIR / f"{stem}.mp4"))
    scale = cap.get(cv2.CAP_PROP_FRAME_WIDTH) / WORK_WIDTH
    out_dir = Path("outputs/review") / stem
    out_dir.mkdir(parents=True, exist_ok=True)
    for label, cands in candidates.items():
        print(f"{label}: {len(cands)} candidates")
        for k, c in enumerate(sorted(cands)):
            tiles = []
            for t in np.linspace(max(0.0, c.start - 0.5), c.end, N_FRAMES):
                cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
                ok, frame = cap.read()
                if not ok:
                    continue
                for tid, cls, b in boxes_at(ctx, t, scale):
                    hit = tid in c.track_ids
                    colour, width = ((0, 0, 255), 3) if hit else ((170, 170, 170), 1)
                    cv2.rectangle(frame, tuple(b[:2].astype(int)), tuple(b[2:].astype(int)), colour, width)
                    if hit:
                        cv2.putText(frame, f"{tid} {cls}", (int(b[0]), int(b[1]) - 4), 0, 0.6, colour, 2)
                cv2.putText(frame, f"{label} #{k} t={t:.1f}s", (10, 30), 0, 0.9, (0, 255, 255), 2)
                tiles.append(cv2.resize(frame, (640, 360)))
            if tiles:
                sheet = np.vstack([np.hstack(tiles[:2]), np.hstack(tiles[2:4])]) if len(tiles) == 4 else np.hstack(tiles)
                cv2.imwrite(str(out_dir / f"{label}_{k:02d}_{c.start:.1f}-{c.end:.1f}.jpg"), sheet)
            print(f"  #{k}: {c.start:.1f}-{c.end:.1f} ids={c.track_ids[:6]} {c.note}")


if __name__ == "__main__":
    main()
