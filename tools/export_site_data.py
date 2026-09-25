"""Build the website's data files (website/public/data, website/public/media).

    python tools/export_site_data.py                                    # no videos needed
    WIUT_CACHE_DIR=.cache python tools/export_site_data.py --videos samples [--no-render]

Always written (from files in the repo):
    results.json   per video: predicted events, dev labels, match status, risk curve (2 Hz)
    metrics.json   official evaluate.py Part A report of the predictions against labels/dev_labels.json
    errors.json    error analysis: every miss / false alarm by cause, boundary offsets, class confusion
    scene.json     scene layout (src/scene/scene.yaml) and lane directions (src/scene/priors.npz)
    predictions_samples.json, media/reference.jpg (copies, for the Links section)

With --videos (the sample .MP4 files):
    eda.json       resolution, fps, duration, brightness, object counts over time, signal phases,
                   speeds, trajectories
    examples.json  one annotated still per predicted event (media/events/*.jpg)
    media/heatmap_{vehicle,person}.jpg, media/<stem>.mp4 (annotated playback, see src/render.py)
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import evaluate  # noqa: E402  (official metric, reused unchanged)
from src.summary import object_counts, pool_risk, signal_runs  # noqa: E402

DATA = ROOT / "website" / "public" / "data"
MEDIA = ROOT / "website" / "public" / "media"
RISK_STEP = 0.5          # s; risk curve is max-pooled to this resolution for the charts
COUNT_BIN = 5.0          # s; object-count and density bins
MATCH_TIOU = 0.5


def _dump(name: str, obj) -> None:
    path = DATA / name
    path.write_text(json.dumps(obj, separators=(",", ":")))
    print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size / 1024:.0f} KB)")


def match_flags(gt: list[tuple], pred: list[tuple], thr: float) -> tuple[list[bool], list[bool]]:
    """Which predictions / ground-truth segments are matched: the greedy rule of evaluate.match_segments."""
    pairs = sorted(((evaluate.tiou(g, p), i, j) for i, g in enumerate(gt) for j, p in enumerate(pred)),
                   reverse=True)
    g_ok, p_ok = [False] * len(gt), [False] * len(pred)
    for iou, i, j in pairs:
        if iou >= thr and not g_ok[i] and not p_ok[j]:
            g_ok[i] = p_ok[j] = True
    return p_ok, g_ok


def export_results(pred: dict, labels: dict) -> None:
    videos = {}
    for vid, v in sorted(pred["videos"].items()):
        gt = labels.get(vid, {"events": []})
        events = [list(e) for e in v["events"]]
        dev = [list(e) for e in gt["events"]]
        for c in {e[2] for e in events + dev}:
            pi = [k for k, e in enumerate(events) if e[2] == c]
            gi = [k for k, e in enumerate(dev) if e[2] == c]
            p_ok, g_ok = match_flags([tuple(dev[k][:2]) for k in gi], [tuple(events[k][:2]) for k in pi], MATCH_TIOU)
            for k, ok in zip(pi, p_ok):
                events[k] = events[k][:3] + ["tp" if ok else "fp"]
            for k, ok in zip(gi, g_ok):
                dev[k] = dev[k][:3] + ["tp" if ok else "fn"]
        risk = v.get("risk", [])
        videos[vid] = {
            "duration": gt.get("duration") or (risk[-1][0] if risk else 0.0),
            "fps": gt.get("fps"),
            "events": events,
            "labels": dev,
            "risk": pool_risk(risk, RISK_STEP),
            "risk_max": max((r[1] for r in risk), default=0.0),
        }
    _dump("results.json", {"team": pred.get("team"), "match_tiou": MATCH_TIOU, "videos": videos})


def export_metrics(pred: dict, labels: dict) -> None:
    rep = evaluate.evaluate(labels, pred, per_video=True)
    _dump("metrics.json", {"score_a": rep["part_a"]["score_a"], "part_a": rep["part_a"],
                           "note": "Predictions vs our own single-annotator dev labels (labels/dev_labels.json)."})
    print(f"  dev Score A = {rep['part_a']['score_a']:.3f}")


def export_errors(pred: dict, labels: dict) -> None:
    """Why each unmatched segment is unmatched (at MATCH_TIOU), how far off matched boundaries are,
    and a class-confusion table (class-agnostic matching at tIoU >= 0.3, "none" = unmatched)."""
    items, offsets, confusion = [], {}, {}
    enabled = {e[2] for v in pred["videos"].values() for e in v["events"]}
    for vid, v in sorted(pred["videos"].items()):
        events = [tuple(e[:3]) for e in v["events"]]
        dev = [tuple(e[:3]) for e in labels.get(vid, {"events": []})["events"]]
        for c in sorted({e[2] for e in events + dev}):
            ps = [e[:2] for e in events if e[2] == c]
            gs = [e[:2] for e in dev if e[2] == c]
            p_ok, g_ok = match_flags(gs, ps, MATCH_TIOU)
            for p, ok in zip(ps, p_ok):
                if ok:
                    g = max(gs, key=lambda g: evaluate.tiou(p, g))
                    offsets.setdefault(c, []).append([round(p[0] - g[0], 2), round(p[1] - g[1], 2)])
                else:
                    # "boundary": overlaps a label of its class, but below the IoU threshold
                    cause = "boundary" if any(evaluate.tiou(p, g) > 0 for g in gs) else "false_alarm"
                    items.append({"video": vid, "kind": "fp", "label": c, "seg": list(p), "cause": cause})
            for g, ok in zip(gs, g_ok):
                if ok:
                    continue
                if c not in enabled:
                    cause = "class_off"    # a class we deliberately do not predict
                else:
                    cause = "boundary" if any(evaluate.tiou(g, p) > 0 for p in ps) else "missed"
                items.append({"video": vid, "kind": "fn", "label": c, "seg": list(g), "cause": cause})
        # class confusion: pair every label with the best-overlapping prediction of any class
        pairs = sorted(((evaluate.tiou(g[:2], p[:2]), i, j) for i, g in enumerate(dev) for j, p in enumerate(events)),
                       reverse=True)
        g_used, p_used = set(), set()
        for iou, i, j in pairs:
            if iou >= 0.3 and i not in g_used and j not in p_used:
                g_used.add(i)
                p_used.add(j)
                key = f"{dev[i][2]}|{events[j][2]}"
                confusion[key] = confusion.get(key, 0) + 1
        for i, g in enumerate(dev):
            if i not in g_used:
                confusion[f"{g[2]}|none"] = confusion.get(f"{g[2]}|none", 0) + 1
        for j, p in enumerate(events):
            if j not in p_used:
                confusion[f"none|{p[2]}"] = confusion.get(f"none|{p[2]}", 0) + 1
    _dump("errors.json", {"match_tiou": MATCH_TIOU, "items": items, "boundary_offsets": offsets,
                          "confusion": confusion})


def export_scene() -> None:
    import yaml

    scene = yaml.safe_load((ROOT / "src/scene/scene.yaml").read_text())
    z = np.load(ROOT / "src/scene/priors.npz")
    cell, flow, flow_n = int(z["cell"]), z["flow"], z["flow_n"]
    arrows = []
    step = 3                      # every 3rd cell keeps the arrow field readable
    for gy in range(0, flow.shape[0], step):
        for gx in range(0, flow.shape[1], step):
            k = int(np.argmax(flow_n[gy, gx]))
            if flow_n[gy, gx, k] >= 20:
                dx, dy = flow[gy, gx, k]
                arrows.append([(gx + 0.5) * cell, (gy + 0.5) * cell, round(float(dx), 3), round(float(dy), 3)])
    drivable = [[int(gx * cell), int(gy * cell)] for gy, gx in zip(*np.nonzero(z["drivable"]))]
    _dump("scene.json", {"size": [1920, 1080], "cell": cell, "layout": scene, "flow": arrows,
                         "drivable": drivable})
    MEDIA.mkdir(parents=True, exist_ok=True)
    shutil.copy(ROOT / "src/scene/reference.jpg", MEDIA / "reference.jpg")


# --- video-dependent part -------------------------------------------------------
def _brightness(path: str, duration: float, every: float = 15.0) -> list[list[float]]:
    import cv2

    cap = cv2.VideoCapture(path)
    out = []
    for t in np.arange(0.0, duration, every):
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ok, frame = cap.read()
        if ok:
            small = cv2.resize(frame, (320, 180))
            out.append([round(float(t), 1), round(float(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY).mean()), 1)])
    cap.release()
    return out


def _trajectories(tracks, n_vehicle: int = 150, n_person: int = 80) -> list[list]:
    rng = np.random.default_rng(0)
    out = []
    for keep, n in ((lambda tr: tr.is_vehicle, n_vehicle), (lambda tr: tr.is_person, n_person)):
        cand = [tr for tr in tracks if keep(tr) and tr.duration >= 3.0
                and np.linalg.norm(tr.foot[-1] - tr.foot[0]) > 80]
        for i in sorted(rng.choice(len(cand), size=min(n, len(cand)), replace=False)) if cand else []:
            tr = cand[i]
            idx = np.linspace(0, len(tr.t) - 1, min(16, len(tr.t))).astype(int)
            out.append([tr.cls, round(float(tr.t[0]), 1), tr.foot[idx].round().astype(int).tolist()])
    return out


def _heatmap(points: np.ndarray, out: Path, colormap: int) -> None:
    import cv2

    ref = cv2.imread(str(ROOT / "src/scene/reference.jpg"))
    h, w = ref.shape[:2]
    cell = 6
    hist = np.zeros((h // cell + 1, w // cell + 1), np.float32)
    p = points[(points[:, 0] >= 0) & (points[:, 1] >= 0) & (points[:, 0] < w) & (points[:, 1] < h)]
    np.add.at(hist, ((p[:, 1] // cell).astype(int), (p[:, 0] // cell).astype(int)), 1)
    hist = cv2.GaussianBlur(np.log1p(hist), (0, 0), 2.0)
    norm = (255 * hist / max(float(hist.max()), 1e-6)).astype(np.uint8)
    heat = cv2.applyColorMap(cv2.resize(norm, (w, h)), colormap)
    alpha = cv2.resize(norm, (w, h)).astype(np.float32)[..., None] / 255.0 * 0.85
    blend = (ref * (1 - alpha) + heat * alpha).astype(np.uint8)
    cv2.imwrite(str(out), cv2.resize(blend, (1280, 720)), [cv2.IMWRITE_JPEG_QUALITY, 82])
    print(f"wrote {out.relative_to(ROOT)}")


def _event_frames(path: Path, ann, events: list[list], width: int = 960) -> list[dict]:
    """One annotated still per predicted event, at its midpoint (media/events/<stem>_<k>.jpg)."""
    import cv2

    out_dir = MEDIA / "events"
    out_dir.mkdir(parents=True, exist_ok=True)
    cap = cv2.VideoCapture(str(path))
    out = []
    for k, (s, e, label) in enumerate(events):
        t = (s + e) / 2
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ok, frame = cap.read()
        if not ok:
            continue
        frame = cv2.resize(frame, (width, round(frame.shape[0] * width / frame.shape[1])))
        name = f"{path.stem}_{k:02d}.jpg"
        cv2.imwrite(str(out_dir / name), ann.draw(frame, t), [cv2.IMWRITE_JPEG_QUALITY, 80])
        out.append({"video": path.name, "start": s, "end": e, "label": label, "t": round(t, 2),
                    "img": f"/media/events/{name}"})
    cap.release()
    return out


def export_videos(folder: Path, pred: dict, render: bool) -> None:
    import cv2

    from src import config
    from src.pipeline import analyze
    from src.render import Annotator, render_video

    videos, veh_pts, ped_pts, examples = {}, [], [], []
    for path in sorted(p for p in folder.iterdir() if p.suffix.lower() == ".mp4"):
        print(f"{path.name}: analysing (set WIUT_CACHE_DIR to reuse detections)")
        ctx, _ = analyze(str(path), config.ENABLED_CLASSES)
        m = ctx.meta
        speeds = np.concatenate([tr.rel_speed for tr in ctx.tracks if tr.is_vehicle] or [np.zeros(0)])
        hist, edges = np.histogram(np.clip(speeds, 0, 4), bins=40, range=(0, 4))
        unique = {}
        for tr in ctx.tracks:
            if tr.duration >= 1.0:
                unique[tr.cls] = unique.get(tr.cls, 0) + 1
        videos[path.name] = {
            "width": m.width, "height": m.height, "fps": round(m.fps, 3), "n_frames": m.n_frames,
            "duration": round(m.duration, 2), "size_mb": round(path.stat().st_size / 2**20, 1),
            "brightness": _brightness(str(path), m.duration),
            "counts": object_counts(ctx.tracks, m.duration, COUNT_BIN),
            "unique_objects": unique,
            "signal": signal_runs(ctx),
            "speed_hist": {"edges": edges.round(2).tolist(), "counts": hist.tolist()},
            "trajectories": _trajectories(ctx.tracks),
        }
        v = pred["videos"].get(path.name, {})
        examples += _event_frames(path, Annotator(ctx, v.get("events", []), v.get("risk")), v.get("events", []))
        veh_pts += [tr.foot for tr in ctx.tracks if tr.is_vehicle]
        ped_pts += [tr.foot for tr in ctx.tracks if tr.is_person]
        if render:
            out = MEDIA / f"{path.stem}.mp4"
            render_video(ctx, v.get("events", []), str(out), risk=v.get("risk"))
            print(f"wrote {out.relative_to(ROOT)} ({out.stat().st_size / 2**20:.1f} MB)")
    _dump("eda.json", {"videos": videos, "count_bin": COUNT_BIN})
    _dump("examples.json", examples)
    MEDIA.mkdir(parents=True, exist_ok=True)
    if veh_pts:
        _heatmap(np.concatenate(veh_pts), MEDIA / "heatmap_vehicle.jpg", cv2.COLORMAP_INFERNO)
    if ped_pts:
        _heatmap(np.concatenate(ped_pts), MEDIA / "heatmap_person.jpg", cv2.COLORMAP_VIRIDIS)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--videos", type=Path, help="folder with the sample .MP4 files")
    ap.add_argument("--no-render", action="store_true", help="skip the annotated videos")
    args = ap.parse_args()

    DATA.mkdir(parents=True, exist_ok=True)
    pred = json.loads((ROOT / "predictions_samples.json").read_text())
    labels = json.loads((ROOT / "labels/dev_labels.json").read_text())
    export_results(pred, labels)
    export_metrics(pred, labels)
    export_errors(pred, labels)
    export_scene()
    shutil.copy(ROOT / "predictions_samples.json", DATA / "predictions_samples.json")
    if args.videos:
        export_videos(args.videos, pred, render=not args.no_render)


if __name__ == "__main__":
    main()
