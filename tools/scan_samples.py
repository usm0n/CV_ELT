"""Run the observation stage (registration, detection, tracking, signal) on sample videos.

Development helper: fills the WIUT_CACHE_DIR cache so rules can be iterated without
re-running the detector.   WIUT_CACHE_DIR=.cache python tools/scan_samples.py samples
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import config  # noqa: E402
from src.pipeline import observe  # noqa: E402
from src.scene.layout import Scene  # noqa: E402
from src.video import read_meta  # noqa: E402


def main() -> None:
    folder = Path(sys.argv[1] if len(sys.argv) > 1 else "samples")
    scene = Scene.load()
    for path in sorted(p for p in folder.iterdir() if p.suffix.lower() == ".mp4"):
        meta = read_meta(str(path))
        t0 = time.perf_counter()
        obs = observe(meta, scene)
        dt = time.perf_counter() - t0
        print(f"{path.name}: {meta.duration:.1f}s video, {dt:.1f}s wall ({dt / meta.duration:.2f}x), "
              f"{len(obs.table)} observations, {len(obs.signal_t)} signal readings", flush=True)


if __name__ == "__main__":
    config.seed_everything()
    main()
