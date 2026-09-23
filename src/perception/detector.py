"""Road-user detector: COCO-pretrained YOLO11 restricted to road-user classes."""
from __future__ import annotations

from pathlib import Path

import numpy as np

from src import config


class Detector:
    def __init__(self, weights: Path = config.DETECTOR_WEIGHTS, imgsz: int = config.DETECTOR_IMGSZ,
                 conf: float = config.DETECTOR_CONF, device: str | None = None):
        from ultralytics import YOLO

        self.model = YOLO(str(weights))
        self.imgsz = imgsz
        self.conf = conf
        self.device = device or config.device()
        self.precision = "fp16" if self.device.startswith("cuda") else "fp32"
        self.keep = list(config.COCO_KEEP)

    def __call__(self, frames: list[np.ndarray]) -> list[np.ndarray]:
        """Detect on a batch of BGR frames.

        Returns one (N, 6) float32 array per frame: x1, y1, x2, y2, conf, coco_class.
        """
        if not frames:
            return []
        results = self.model.predict(frames, imgsz=self.imgsz, conf=self.conf, classes=self.keep,
                                     device=self.device, quantize=self.precision, verbose=False)
        out = []
        for r in results:
            b = r.boxes
            out.append(np.concatenate([b.xyxy.cpu().numpy(), b.conf.cpu().numpy()[:, None],
                                       b.cls.cpu().numpy()[:, None]], axis=1).astype(np.float32))
        return out
