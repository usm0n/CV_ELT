"""Central configuration: model paths, sampling, and per-class switches/thresholds."""
from __future__ import annotations

import os
import random
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
WEIGHTS_DIR = ROOT / "weights"
SCENE_FILE = ROOT / "src" / "scene" / "scene.yaml"

SEED = 0

# --- perception ---------------------------------------------------------------
DETECTOR_WEIGHTS = WEIGHTS_DIR / "yolo11m.pt"
DETECTOR_IMGSZ = 960           # wide CCTV frames: small far-away objects need > 640
DETECTOR_CONF = 0.25
DETECTOR_BATCH = 16
# COCO ids kept: person, bicycle, car, motorcycle, bus, truck
COCO_KEEP = {0: "person", 1: "bicycle", 2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}
VEHICLE_CLASSES = {"car", "motorcycle", "bus", "truck"}

# Part A processes at most one frame per SAMPLE_INTERVAL seconds (10 fps; at 29.97 fps
# with an IBBP GOP this is exactly the reference frames, see src/video.py).
SAMPLE_INTERVAL = 0.1

# Without a GPU (CUDA, or Apple MPS) the profile above overruns the 3x time budget, and a video over
# budget scores as empty. On CPU we switch to the live demo's light profile (YOLO11n, 5 fps): fewer
# and later detections, but every video finishes. WIUT_PROFILE=full|light forces one.
def _accelerated() -> bool:
    try:
        import torch
    except ImportError:
        return False
    return torch.cuda.is_available() or torch.backends.mps.is_available()


PROFILE = os.environ.get("WIUT_PROFILE") or ("full" if _accelerated() else "light")
if PROFILE == "light":
    DETECTOR_WEIGHTS = WEIGHTS_DIR / "yolo11n.pt"
    SAMPLE_INTERVAL = 0.2

# Dev-only cache for detections (never used by the official harness unless set).
CACHE_DIR = Path(os.environ["WIUT_CACHE_DIR"]) if os.environ.get("WIUT_CACHE_DIR") else None

# --- event classes ------------------------------------------------------------
# Only classes that validate on our dev labels are enabled: a predicted class that
# never occurs in the test set enters macro-F1 as a 0.
ENABLED_CLASSES: set[str] = {"stop_line", "jaywalking"}


def seed_everything(seed: int = SEED) -> None:
    random.seed(seed)
    np.random.seed(seed)
    try:
        import torch

        torch.manual_seed(seed)
        torch.backends.cudnn.deterministic = True
        torch.backends.cudnn.benchmark = False
    except ImportError:
        pass


def device() -> str:
    import torch

    if torch.cuda.is_available():
        return "cuda:0"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"
