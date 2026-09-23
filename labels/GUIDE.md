# Labelling the sample videos (dev set)

Our dev set is the only way to measure the model before the hidden test, so label what an
organizer's annotator would label — no more, no less.

## Setup
1. Open `tools/labeler.html` in Chrome (double-click it).
2. **Video** → pick `outputs/proxies/C3896.mp4` (720p copy of the 4K original, same timing).
   The **Key** field fills in as `C3896.MP4` — keep it: it must match the original file name.
3. Pick a class (keys `1`–`0`, `q`, `w`, `e`, `r`), press `[` at the start frame and `]` at the end frame.
   `←/→` = ±1 s, `Shift+←/→` = ±0.1 s, `Space` = play/pause. Click an event row to jump to it.
4. Labels autosave in the browser. When done with all four videos: **Export labels JSON** and save the
   file as `labels/dev_labels.json`.

## Boundaries (from the task's convention table — they are scored at IoU up to 0.7)
| class | start | end |
|---|---|---|
| red_light | front of the vehicle crosses the stop line while red | vehicle leaves the intersection or frame |
| stop_line | vehicle stops past the stop line on red | signal turns green |
| stopped_vehicle | vehicle stops (≥ 10 s stationary, **not** queued at the signal) | moves again / removed |
| jaywalking | pedestrian steps onto the road outside a crosswalk | leaves the road |
| failure_to_yield | vehicle enters a crosswalk while a pedestrian is on / stepping onto it | vehicle leaves the crosswalk |
| wrong_way | vehicle enters the opposing lane | back in a correct lane / leaves frame |
| illegal_u_turn, illegal_turn | vehicle starts turning | turn completed |
| solid_line_crossing | wheel crosses the solid line | vehicle fully in the new lane |
| congestion | queue stops moving (all lanes of one direction) | queue clears |
| near_miss | onset of hard braking / swerve | road users clear of each other |
| accident | first contact | all involved stop or leave frame |

Two simultaneous events of the **same** class → one segment covering both.

## This scene
- The signal you can read is the 3-lamp head on the median (next to the blue pedestrian sign).
  It controls the **main approach**: traffic coming from the top-left towards the camera, which
  stops at the white stop line before the long zebra crossing.
- Traffic coming from the right (far side, driving away to the top-left) has its own signal,
  which is not visible — don't label red_light for it unless it is obvious (e.g. pedestrians have clearly started crossing).
- A normal queue waiting at red is **not** congestion and **not** stopped_vehicle.
- If unsure whether something counts, label it and type a note (e.g. "unsure") — we can decide later.
