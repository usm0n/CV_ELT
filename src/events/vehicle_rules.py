"""Single-vehicle manoeuvre classes: stopped_vehicle, wrong_way, illegal_u_turn."""
from __future__ import annotations

import numpy as np

from src import config
from src.events import Context, register
from src.events.segments import Candidate, mask_to_intervals
from src.scene.signal import GREEN, RED

DT = config.SAMPLE_INTERVAL

# stopped_vehicle
STATIONARY_SPEED = 8.0      # ref px/s
MIN_STOPPED = 10.0          # s, from the class definition
SAME_SPOT = 25.0            # ref px; stationary fragments (tracker ID switches) at one spot are merged
FRAGMENT_GAP = 5.0          # s
QUEUE_RELEASE = 15.0        # s after green in which a stopped approach vehicle is still "queued"

# wrong_way
AGAINST_COS = -0.5          # velocity vs. every dominant flow direction of the cell
MIN_WRONG_SPEED = 40.0      # ref px/s
MIN_WRONG_TIME = 1.5        # s

# illegal_u_turn
U_TURN_ANGLE = np.radians(150)
U_TURN_MAX_TIME = 20.0      # s to complete the turn
MIN_TURN_SPEED = 25.0       # ref px/s
TURN_TOL = np.radians(15)   # heading change that marks the start of the turn
TURN_RATE_DONE = np.radians(10)  # rad/s; below this the turn is complete


def _stationary_spots(ctx: Context) -> list[tuple[float, float, np.ndarray, tuple[int, ...]]]:
    """(start, end, position, track ids) of stationary vehicle episodes; fragments at one spot merged."""
    episodes = []
    for tr in ctx.tracks:
        if not tr.is_vehicle:
            continue
        on_road = ctx.scene.priors.on_road(tr.foot)
        for s, e in mask_to_intervals(tr.t, (tr.speed < STATIONARY_SPEED) & on_road, dt=DT):
            sel = (tr.t >= s) & (tr.t <= e)
            episodes.append([s, e, np.median(tr.foot[sel], axis=0), (tr.id,)])
    episodes.sort(key=lambda x: x[0])
    merged: list[list] = []
    for s, e, pos, ids in episodes:
        for m in merged:
            if np.linalg.norm(m[2] - pos) < SAME_SPOT and s - m[1] <= FRAGMENT_GAP:
                m[1] = max(m[1], e)
                m[3] = m[3] + ids
                break
        else:
            merged.append([s, e, pos, ids])
    return [tuple(m) for m in merged]


def _queued_at_signal(ctx: Context, s: float, e: float, pos: np.ndarray) -> bool:
    """Stopped upstream of the stop line in the approach lanes, and released within one cycle."""
    scene = ctx.scene
    p = pos[None]
    if not (scene.side_of_stop_line(p)[0] < 0 and scene.within_stop_line_span(p)[0]):
        return False
    started_on_red = any(rs - 2.0 <= s <= re for rs, re in ctx.phases(RED))
    released_on_green = any(gs <= e <= gs + QUEUE_RELEASE for gs, _ in ctx.phases(GREEN))
    return started_on_red or released_on_green


@register("stopped_vehicle", merge_gap=1.0, min_len=MIN_STOPPED)
def stopped_vehicle(ctx: Context) -> list[Candidate]:
    return [Candidate(s, e, ids) for s, e, pos, ids in _stationary_spots(ctx)
            if e - s >= MIN_STOPPED and not _queued_at_signal(ctx, s, e, pos)]


@register("wrong_way", merge_gap=1.0, min_len=MIN_WRONG_TIME)
def wrong_way(ctx: Context) -> list[Candidate]:
    out = []
    for tr in ctx.tracks:
        if not tr.is_vehicle or len(tr.t) < 10:
            continue
        agree = ctx.scene.priors.flow_agreement(tr.foot, tr.vel)
        against = (agree < AGAINST_COS) & (tr.speed > MIN_WRONG_SPEED)   # NaN compares False
        for s, e in mask_to_intervals(tr.t, against, dt=DT):
            if e - s >= MIN_WRONG_TIME:
                out.append(Candidate(s, e, (tr.id,)))
    return out


@register("illegal_u_turn", merge_gap=1.0, min_len=2.0)
def illegal_u_turn(ctx: Context) -> list[Candidate]:
    """Heading reverses (>= 150 deg) within U_TURN_MAX_TIME while moving."""
    out = []
    for tr in ctx.tracks:
        if not tr.is_vehicle or len(tr.t) < 20:
            continue
        moving = tr.speed > MIN_TURN_SPEED
        if moving.sum() < 10:
            continue
        t, v = tr.t[moving], tr.vel[moving]
        heading = np.unwrap(np.arctan2(v[:, 1], v[:, 0]))
        rate = np.abs(np.gradient(heading, t))
        j = 0
        for i in range(len(t)):
            while t[i] - t[j] > U_TURN_MAX_TIME:
                j += 1
            if abs(heading[i] - heading[j]) < U_TURN_ANGLE:
                continue
            # onset: first sample deviating > TURN_TOL from the initial heading
            onset = j + int(np.argmax(np.abs(heading[j:i + 1] - heading[j]) > TURN_TOL))
            # completion: heading stops changing after reaching the reversal
            k = i
            while k + 1 < len(t) and rate[k] > TURN_RATE_DONE:
                k += 1
            out.append(Candidate(float(t[onset]), float(t[k]), (tr.id,)))
            break   # one U-turn per track
    return out
