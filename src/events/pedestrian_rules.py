"""Pedestrian classes: jaywalking, failure_to_yield."""
from __future__ import annotations

import numpy as np

from src import config
from src.events import Context, register
from src.events.segments import Candidate, mask_to_intervals

CROSSWALK_MARGIN = 25     # ref px; people walk slightly outside the stripes
ISLAND_MARGIN = 30        # ref px; stepping off an island edge is not yet "on the road"
MIN_ON_ROAD = 1.5         # s in the junction to count as jaywalking
MAX_WALK_REL_SPEED = 2.0  # body heights/s; faster "persons" are riders
MIN_WALK_DIST = 60.0      # ref px covered on the road; rules out standing detections / noise
JAYWALK_MERGE = 3.0       # s; a group crossing together is one event
VEHICLE_CW_MARGIN = 8     # ref px
MIN_PASS_SPEED = 20.0     # ref px/s; a vehicle "drives through"
MIN_WALK_SPEED = 15.0     # ref px/s; slower = waiting, not crossing
YIELD_DIST = 150.0        # ref px between vehicle and walker foot points


def _vehicle_boxes(ctx: Context) -> dict[float, np.ndarray]:
    """Vehicle and bicycle boxes (video px) per sample time, built once per context."""
    if ctx.cache.get("vehicle_boxes") is None:
        boxes: dict[float, list[np.ndarray]] = {}
        for v in ctx.tracks:
            if v.is_vehicle or v.cls == "bicycle":
                for t, b in zip(v.t, v.boxes):
                    boxes.setdefault(round(float(t), 3), []).append(b)
        ctx.cache["vehicle_boxes"] = {t: np.asarray(b) for t, b in boxes.items()}
    return ctx.cache["vehicle_boxes"]


def _in_vehicle_mask(ctx: Context, tr) -> np.ndarray:
    """True where the person's foot point lies inside a vehicle box at the same instant.

    Catches riders on two-wheelers and drivers / bus passengers seen through the windows.
    """
    index = _vehicle_boxes(ctx)
    fx = (tr.boxes[:, 0] + tr.boxes[:, 2]) / 2
    fy = tr.boxes[:, 3]
    out = np.zeros(len(tr.t), bool)
    for i, t in enumerate(tr.t):
        b = index.get(round(float(t), 3))
        if b is not None:
            h = b[:, 3] - b[:, 1]
            out[i] = bool(np.any((b[:, 0] <= fx[i]) & (fx[i] <= b[:, 2]) & (b[:, 1] <= fy[i])
                                 & (fy[i] <= b[:, 3] + 0.3 * h)))
    return out


def _person_on_road(ctx: Context, tr) -> np.ndarray:
    scene = ctx.scene
    return (scene.in_junction(tr.foot)
            & ~scene.in_crosswalk(tr.foot, margin=CROSSWALK_MARGIN)
            & ~scene.on_island(tr.foot, margin=ISLAND_MARGIN))


@register("jaywalking", merge_gap=JAYWALK_MERGE, min_len=MIN_ON_ROAD)
def jaywalking(ctx: Context) -> list[Candidate]:
    out = []
    for tr in ctx.tracks:
        if not tr.is_person or len(tr.t) < 5:
            continue
        on_road = _person_on_road(ctx, tr)
        if not on_road.any():
            continue
        on_road &= ~_in_vehicle_mask(ctx, tr)
        for s, e in mask_to_intervals(tr.t, on_road, dt=config.SAMPLE_INTERVAL):
            sel = (tr.t >= s) & (tr.t <= e)
            if (e - s < MIN_ON_ROAD or np.median(tr.rel_speed[sel]) > MAX_WALK_REL_SPEED
                    or np.linalg.norm(tr.foot[sel][-1] - tr.foot[sel][0]) < MIN_WALK_DIST):
                continue
            out.append(Candidate(s, e, (tr.id,)))
    return out


@register("failure_to_yield", merge_gap=0.5, min_len=0.5)
def failure_to_yield(ctx: Context) -> list[Candidate]:
    """A vehicle drives through a crosswalk close to a pedestrian who is walking on that crosswalk.

    People waiting at the curb or an island end are not "on" the crossing: the walker must be
    inside the stripes and moving, and within YIELD_DIST of the vehicle at the same instant.
    """
    scene = ctx.scene
    people = [tr for tr in ctx.tracks if tr.is_person and len(tr.t) >= 3]
    out = []
    for name in scene.crosswalks:
        walkers = {}
        for p in people:
            on = scene.in_crosswalk(p.foot, name) & (p.speed > MIN_WALK_SPEED) & ~_in_vehicle_mask(ctx, p)
            if on.any():
                walkers[p.id] = {round(float(t), 3): f for t, f in zip(p.t[on], p.foot[on])}
        if not walkers:
            continue
        for tr in ctx.tracks:
            if not tr.is_vehicle:
                continue
            inside = scene.in_crosswalk(tr.foot, name, margin=VEHICLE_CW_MARGIN)
            for s, e in mask_to_intervals(tr.t, inside, dt=config.SAMPLE_INTERVAL):
                sel = (tr.t >= s) & (tr.t <= e)
                if np.median(tr.speed[sel]) < MIN_PASS_SPEED:
                    continue
                close = set()
                for t, f in zip(tr.t[sel], tr.foot[sel]):
                    key = round(float(t), 3)
                    for pid, pts in walkers.items():
                        if key in pts and np.linalg.norm(pts[key] - f) < YIELD_DIST:
                            close.add(pid)
                if close:
                    out.append(Candidate(s, e, (tr.id, *sorted(close)), name))
    return out
