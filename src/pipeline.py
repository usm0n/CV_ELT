"""Part A pipeline: register view -> one decode pass (detect, track, read signal) -> rules -> segments."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from src import config
from src.events import Context, load_rules
from src.events.segments import Candidate, finalize
from src.perception.tracker import load_cached, save_cached, scan_video
from src.scene.layout import Scene
from src.scene.registration import estimate_homography, median_background
from src.scene.signal import SignalReader, smooth_states
from src.tracks import build_tracks
from src.video import WORK_WIDTH, VideoMeta, read_meta


@dataclass
class Observation:
    """Everything the rules need from one video; cached as a whole during development."""
    table: np.ndarray          # tracker output, see perception.tracker.COLS
    H: np.ndarray              # reference px -> work-frame px
    signal_t: np.ndarray       # sample times of the signal reader
    signal_state: np.ndarray   # smoothed states (src.scene.signal constants)


def observe(meta: VideoMeta, scene: Scene) -> Observation:
    cached = load_cached(meta)
    if cached is not None:
        return Observation(**cached)

    H = estimate_homography(median_background(meta.path))
    full_scale = meta.width / WORK_WIDTH
    reader = SignalReader(scene.lamps, np.diag([full_scale, full_scale, 1.0]) @ H)
    sig_t, sig_s = [], []

    def read_signal(t: float, frame: np.ndarray) -> None:
        sig_t.append(t)
        sig_s.append(reader.read(frame))

    table = scan_video(meta, on_full_frame=read_signal)
    obs = Observation(table=table, H=H, signal_t=np.asarray(sig_t),
                      signal_state=smooth_states(np.asarray(sig_s, dtype=np.int64)))
    save_cached(meta, **obs.__dict__)
    return obs


def analyze(video_path: str, labels=None) -> tuple[Context, dict[str, list[Candidate]]]:
    """Observation + every rule's raw candidates (before merging). `labels` defaults to all rules."""
    config.seed_everything()
    meta = read_meta(video_path)
    scene = Scene.load()
    obs = observe(meta, scene)
    tracks = build_tracks(obs.table, to_ref=np.linalg.inv(obs.H))
    ctx = Context(meta=meta, tracks=tracks, scene=scene, signal_t=obs.signal_t, signal_state=obs.signal_state)
    rules = load_rules()
    labels = sorted(rules) if labels is None else sorted(labels)
    return ctx, {label: rules[label].fn(ctx) for label in labels}


def detect_events(video_path: str) -> list[list]:
    ctx, candidates = analyze(video_path, config.ENABLED_CLASSES)
    rules = load_rules()
    events: list[list] = []
    for label, cands in candidates.items():
        rule = rules[label]
        for s, e in finalize(cands, ctx.meta.duration, rule.merge_gap, rule.min_len):
            events.append([s, e, label])
    return sorted(events)
