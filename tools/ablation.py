"""Ablation: Part A on the sample videos under different detector / frame-rate / input-size settings.

    python tools/ablation.py [--videos samples]      # writes website/public/data/ablation.json

Each variant runs in a fresh process (the settings in src/config.py bind at import time) and is
scored with the official evaluate.py against labels/dev_labels.json (the same dev Score A as
everywhere else, so failure_to_yield, which we never predict, counts as 0). Wall time is Part A alone (decode + detect + track + rules) on the machine it runs on.
Finished variants are kept in outputs/ablation/ so an interrupted run resumes.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "outputs" / "ablation"
DATA = ROOT / "website" / "public" / "data"

# name, detector weights, seconds between frames, detector input size
VARIANTS = [
    ("YOLO11m · 10 fps · 960 px (submission)", "yolo11m.pt", 0.1, 960),
    ("YOLO11n · 10 fps · 960 px", "yolo11n.pt", 0.1, 960),
    ("YOLO11m · 5 fps · 960 px", "yolo11m.pt", 0.2, 960),
    ("YOLO11n · 5 fps · 960 px (CPU fallback, live demo)", "yolo11n.pt", 0.2, 960),
    ("YOLO11m · 10 fps · 640 px", "yolo11m.pt", 0.1, 640),
]


def run_variant(weights: str, interval: float, imgsz: int, videos: Path) -> dict:
    """Worker: Part A on every labelled sample with these settings; events and wall time per video."""
    sys.path.insert(0, str(ROOT))
    from src import config

    config.DETECTOR_WEIGHTS = config.WEIGHTS_DIR / weights
    config.SAMPLE_INTERVAL = interval
    config.DETECTOR_IMGSZ = imgsz
    config.CACHE_DIR = None                     # time the full pass, never a cached one
    from src.pipeline import detect_events     # imported after the overrides on purpose

    labels = json.loads((ROOT / "labels" / "dev_labels.json").read_text())
    out = {}
    for vid in sorted(labels):
        t0 = time.perf_counter()
        events = detect_events(str(videos / vid))
        out[vid] = {"events": events, "part_a_sec": round(time.perf_counter() - t0, 1)}
        print(f"  {vid}: {len(events)} events, {out[vid]['part_a_sec']} s", file=sys.stderr, flush=True)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--videos", type=Path, default=ROOT / "samples")
    ap.add_argument("--worker", nargs=3, metavar=("WEIGHTS", "INTERVAL", "IMGSZ"), help=argparse.SUPPRESS)
    args = ap.parse_args()

    if args.worker:
        w, i, s = args.worker
        print(json.dumps(run_variant(w, float(i), int(s), args.videos)))
        return

    sys.path.insert(0, str(ROOT))
    import evaluate
    from src.config import ENABLED_CLASSES

    labels = json.loads((ROOT / "labels" / "dev_labels.json").read_text())
    duration = sum(g["duration"] for g in labels.values())
    OUT.mkdir(parents=True, exist_ok=True)
    rows = []
    for name, weights, interval, imgsz in VARIANTS:
        cache = OUT / f"{Path(weights).stem}_{interval}_{imgsz}.json"
        if not cache.exists():
            print(f"{name}", file=sys.stderr, flush=True)
            res = subprocess.run([sys.executable, __file__, "--videos", str(args.videos),
                                  "--worker", weights, str(interval), str(imgsz)],
                                 check=True, capture_output=True, text=True, cwd=ROOT)
            cache.write_text(res.stdout)
        runs = json.loads(cache.read_text())
        rep = evaluate.evaluate_part_a(labels, {v: {"events": r["events"]} for v, r in runs.items()})
        part_a = sum(r["part_a_sec"] for r in runs.values())
        rows.append({"name": name, "weights": weights, "fps": round(1 / interval), "imgsz": imgsz,
                     "score_a": rep["score_a"],
                     "per_class": {c: v["f1_mean"] for c, v in rep["per_class"].items()},
                     "part_a_sec": part_a, "x_realtime": part_a / duration})
        print(f"{name:52s} Score A {rep['score_a']:.3f}   Part A {part_a / duration:.2f}x", file=sys.stderr)

    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / "ablation.json").write_text(json.dumps({
        "machine": "Apple M-series laptop (MPS)", "classes": sorted(ENABLED_CLASSES),
        "video_sec": duration, "rows": rows}, separators=(",", ":")))
    print(f"wrote {(DATA / 'ablation.json').relative_to(ROOT)}", file=sys.stderr)


if __name__ == "__main__":
    main()
