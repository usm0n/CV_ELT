"""Annotated playback for the website: tracked boxes, scene layout, signal, events and risk.

Used by tools/export_site_data.py (sample videos) and demo/ (uploads). Frames come from
the same reference-frame decoder as Part A and are re-timed to a constant OUT_FPS, then
piped to ffmpeg as browser-friendly H.264 (yuv420p, faststart).
"""
from __future__ import annotations

import shutil
import subprocess
from typing import Callable

import cv2
import numpy as np

from src.events import Context
from src.scene.signal import AMBER, GREEN, RED
from src.video import WORK_WIDTH, iter_samples

OUT_FPS = 10
OUT_WIDTH = 960

# BGR; the website uses the same hues (website/src/lib/colors.ts)
CLASS_COLOURS = {"car": (235, 150, 60), "bus": (60, 200, 250), "truck": (40, 140, 240),
                 "motorcycle": (200, 90, 220), "bicycle": (160, 220, 90), "person": (90, 220, 90)}
EVENT_COLOURS = {"stop_line": (60, 60, 230), "jaywalking": (0, 170, 255)}
SIGNAL_COLOURS = {RED: (40, 40, 230), AMBER: (0, 190, 255), GREEN: (80, 200, 60)}


def ffmpeg_exe() -> str:
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError as e:
        raise RuntimeError("ffmpeg not found: install it or `pip install imageio-ffmpeg`") from e


class Annotator:
    """Draws one video's tracks, scene layout, signal state, active events and risk onto frames."""

    def __init__(self, ctx: Context, events: list[list], risk: list[list] | None = None) -> None:
        self.ctx, self.events = ctx, events
        self.tracks = [(tr.t, tr.boxes, tr.cls, tr.id) for tr in ctx.tracks]
        r = np.asarray(risk or [], dtype=np.float64).reshape(-1, 2)
        self.risk_t, self.risk_v = r[:, 0], r[:, 1]
        self.polys = self._scene_polys()

    def _scene_polys(self) -> list[tuple[np.ndarray, tuple[int, int, int]]]:
        """Scene polygons mapped from reference pixels into work-frame pixels."""
        if not self.ctx.tracks:
            return []
        H = np.linalg.inv(self.ctx.tracks[0].to_ref)     # reference px -> work px
        sc = self.ctx.scene
        polys = [(sc.stop_line_main, (60, 60, 230))]
        polys += [(p, (255, 255, 255)) for p in sc.crosswalks.values()]
        polys += [(sc.junction, (0, 200, 255))]
        return [(cv2.perspectiveTransform(p.reshape(-1, 1, 2).astype(np.float64), H).reshape(-1, 2), c)
                for p, c in polys]

    def boxes_at(self, t: float) -> list[tuple[str, int, np.ndarray]]:
        out = []
        for ts, boxes, cls, tid in self.tracks:
            if ts[0] - 0.05 <= t <= ts[-1] + 0.05:
                i = int(np.searchsorted(ts, t).clip(0, len(ts) - 1))
                if i > 0 and abs(ts[i - 1] - t) < abs(ts[i] - t):
                    i -= 1
                if abs(ts[i] - t) < 0.3:
                    out.append((cls, tid, boxes[i]))
        return out

    def draw(self, frame: np.ndarray, t: float) -> np.ndarray:
        """Annotate a BGR frame of any width showing time `t` (boxes are scaled from WORK_WIDTH)."""
        k = frame.shape[1] / WORK_WIDTH
        overlay = frame.copy()
        for i, (p, colour) in enumerate(self.polys):
            pts = (p * k).astype(np.int32)
            cv2.polylines(overlay, [pts], isClosed=i > 0, color=colour, thickness=2 if i == 0 else 1)
        frame = cv2.addWeighted(overlay, 0.55, frame, 0.45, 0)

        for cls, tid, b in self.boxes_at(t):
            x1, y1, x2, y2 = (b * k).astype(int)
            colour = CLASS_COLOURS.get(cls, (200, 200, 200))
            cv2.rectangle(frame, (x1, y1), (x2, y2), colour, 1 if cls == "person" else 2)
            cv2.putText(frame, f"{cls[:4]} {tid}", (x1, max(y1 - 3, 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.35, colour,
                        1, cv2.LINE_AA)

        h, w = frame.shape[:2]
        cv2.rectangle(frame, (0, 0), (w, 26), (20, 20, 20), -1)
        cv2.putText(frame, f"t = {t:6.1f} s", (8, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (240, 240, 240), 1,
                    cv2.LINE_AA)
        state = int(self.ctx.signal_at(np.array([t]))[0])
        if state in SIGNAL_COLOURS:
            cv2.circle(frame, (130, 13), 7, SIGNAL_COLOURS[state], -1)
        x = 150
        for s, e, label in self.events:
            if s <= t <= e:
                colour = EVENT_COLOURS.get(label, (0, 0, 255))
                (tw, _), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
                cv2.rectangle(frame, (x, 4), (x + tw + 10, 22), colour, -1)
                cv2.putText(frame, label, (x + 5, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1,
                            cv2.LINE_AA)
                x += tw + 16
        if len(self.risk_t):
            r = float(self.risk_v[max(int(np.searchsorted(self.risk_t, t, side="right")) - 1, 0)])
            bar = int(120 * r)
            cv2.rectangle(frame, (w - 190, 7), (w - 70, 19), (80, 80, 80), 1)
            cv2.rectangle(frame, (w - 190, 7), (w - 190 + bar, 19), (40, 40, 230) if r >= 0.5 else (60, 200, 250),
                          -1)
            cv2.putText(frame, f"risk {r:.2f}", (w - 64, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (240, 240, 240), 1,
                        cv2.LINE_AA)
        return frame


def render_video(ctx: Context, events: list[list], out_path: str, risk: list[list] | None = None,
                 width: int = OUT_WIDTH, on_progress: Callable[[float], None] | None = None) -> None:
    """Write an annotated H.264 mp4 of `ctx.meta.path` at OUT_FPS and `width` px."""
    meta = ctx.meta
    height = round(meta.height * width / meta.width / 2) * 2
    ann = Annotator(ctx, events, risk)
    cmd = [ffmpeg_exe(), "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgr24",
           "-s", f"{width}x{height}", "-r", str(OUT_FPS), "-i", "-", "-c:v", "libx264", "-preset", "veryfast",
           "-crf", "28", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out_path]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    n_out = int(meta.duration * OUT_FPS)
    k, last = 0, None
    try:
        for s in iter_samples(meta.path, min_interval=1.0 / OUT_FPS, full_every=1e9, work_width=width):
            # constant output rate: repeat the latest frame for each output tick it covers
            while k < n_out and k / OUT_FPS <= s.t + 0.5 / OUT_FPS:
                src = s.work if k / OUT_FPS >= s.t - 0.5 / OUT_FPS or last is None else last
                out = ann.draw(cv2.resize(src, (width, height)), k / OUT_FPS)
                proc.stdin.write(out.tobytes())
                k += 1
            last = s.work
            if on_progress is not None and k % (5 * OUT_FPS) == 0:
                on_progress(min(k / max(n_out, 1), 1.0))
        while last is not None and k < n_out:          # pad a short tail with the last frame
            out = ann.draw(cv2.resize(last, (width, height)), k / OUT_FPS)
            proc.stdin.write(out.tobytes())
            k += 1
    finally:
        proc.stdin.close()
        if proc.wait() != 0:
            raise RuntimeError(f"ffmpeg failed for {out_path}")
