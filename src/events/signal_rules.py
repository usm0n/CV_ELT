"""Signal-dependent classes: red_light, stop_line (main approach only).

The visible signal head is in phase with the main approach (checked on the samples:
57 of 59 stop-line crossings happen on green). The far approach runs on a different
phase whose signal is not visible, so it is not judged.
"""
from __future__ import annotations

import numpy as np

from src.events import Context, register
from src.events.segments import Candidate
from src.events.vehicle_rules import _stationary_spots
from src.scene.signal import RED

PHASE_MARGIN = 1.0       # s; ignore crossings this close to a phase change (early starts, amber tails)
MIN_CROSS_SPEED = 30.0   # ref px/s; the vehicle must actually drive across the line
MAX_EVENT = 12.0         # s; cap on "until it leaves the intersection / frame"
PAST_LINE_MIN = 15.0     # ref px past the stop line (front clearly over the line)
PAST_LINE_MAX = 420.0    # ref px; junction blocking deep inside the box counts too
SPAN_MARGIN = 150.0      # ref px beyond the stop line's ends (turning paths into the box)
HOLD_TOL = 3.0           # s; still standing this close to the green onset (track loss at the end)
MIN_HOLD = 10.0          # s standing during the red
CREEP_DIST = 100.0       # ref px between stops of one creeping vehicle
FRAGMENT_GAP = 5.0       # s between those stops


def _in_red(ctx: Context, t: float) -> bool:
    return any(s + PHASE_MARGIN <= t <= e - PHASE_MARGIN for s, e in ctx.phases(RED))


@register("red_light", merge_gap=0.0, min_len=0.5)
def red_light(ctx: Context) -> list[Candidate]:
    """Front of a vehicle crosses the main stop line during red -> until it leaves (frame end)."""
    out = []
    scene = ctx.scene
    for tr in ctx.tracks:
        if not tr.is_vehicle or len(tr.t) < 5:
            continue
        side = scene.side_of_stop_line(tr.foot)
        span = scene.within_stop_line_span(tr.foot)
        for i in np.flatnonzero((side[:-1] < 0) & (side[1:] >= 0) & span[1:]):
            t_cross = float(tr.t[i + 1])
            if tr.speed[i + 1] >= MIN_CROSS_SPEED and _in_red(ctx, t_cross):
                out.append(Candidate(t_cross, min(float(tr.t[-1]), t_cross + MAX_EVENT), (tr.id,)))
    return out


@register("stop_line", merge_gap=1.0, min_len=1.0)
def stop_line(ctx: Context) -> list[Candidate]:
    """Vehicle standing past the stop line (or inside the junction) through a red; ends at green.

    Stationary episodes come from `_stationary_spots`, which stitches tracker ID switches at one
    spot. Only vehicles that are still there when green returns count: cars that crawl out of
    the box after the red onset are clearing the junction, not blocking it.
    """
    out = []
    scene = ctx.scene
    reds = ctx.phases(RED)
    spots = []
    for s, e, pos, ids in _stationary_spots(ctx):
        p = pos[None]
        side = float(scene.side_of_stop_line(p)[0])
        if PAST_LINE_MIN <= side <= PAST_LINE_MAX and scene.within_stop_line_span(p, SPAN_MARGIN)[0]:
            spots.append((s, e, pos, ids))
    for s, e, pos, ids in spots:
        # the same vehicle often creeps forward a little: chain earlier episodes close in time and space
        chained = True
        while chained:
            chained = False
            for s2, e2, pos2, _ in spots:
                if s2 < s and s - FRAGMENT_GAP <= e2 <= e and np.linalg.norm(pos2 - pos) < CREEP_DIST:
                    s, pos, chained = s2, pos2, True
        for rs, re in reds:
            start = max(s, rs)
            if e >= re - HOLD_TOL and re - start >= MIN_HOLD:
                out.append(Candidate(start, re, ids))
    return out
