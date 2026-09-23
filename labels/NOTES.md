# Dev-label notes

`labels/dev_labels.json`: 17 events (stop_line 5, jaywalking 7, failure_to_yield 5).
Single annotator (Claude). Method: 3 s contact sheets of the whole video, then rule-candidate sheets and
short dense clips to check doubtful cases. Boundaries come from track data where a track exists, otherwise
from the clips (roughly ±1 s).
Not seen in any sample: accident, near_miss, red_light, wrong_way, illegal_u_turn, illegal_turn,
solid_line_crossing, congestion, stopped_vehicle, road_obstacle, fire_smoke.
Excluded as low confidence (listed below): C3897 6–14 jaywalking, C3902 184–196 jaywalking, C3896 exit congestion.
Use these labels to choose classes and tune rules. They are biased toward what our tracker sees, so do not
treat them as an unbiased test score.

Conventions decided here:
- "Junction blocking" (a vehicle frozen past the stop line or inside the box for a whole red) → stop_line,
  from the moment it stops until green.
- Jaywalking = a pedestrian clearly on open carriageway away from stripes and islands. Using the short
  unmarked gap next to the triangle island does not count.
- failure_to_yield = a turning vehicle crosses a crosswalk within about one car length of a pedestrian who
  is walking on it. A car passing a pedestrian who waits at the curb does not count.


Coordinates below are proxy-tile px (960x540 tiles = ref px / 2) unless marked "ref".

## C3897 (seen 96–318 s; 0–95 s still to review)
- 96–130 green: heavy pedestrian use of lower_left crosswalk; right-turners pass at a distance. No clear failure_to_yield.
- 177–183 green: SUV / sedan / grey sedan turn right across the top of lower_left while ped 216 is
  on the far half of the same crosswalk. Borderline failure_to_yield — NOT labelled (vehicle passes
  well clear of the walker's path).
- 192 green: motorcycle 465 rides over lower_left crosswalk (not an official class).
- ~209–248: black sedan stationary inside the junction at tile (430,350) = ref (860,700),
  ~240 ref px past the main stop line, during the whole red; moves at green (~246–249).
  It is waiting to turn right while pedestrians cross lower_left. Candidate: stop_line (stops past the
  line on red, ends at green) — the convention table fits this exactly. Label as stop_line.
- 288–315 red: peds 647/648 cross main_near diagonally, then walk over the triangle island and down
  lower_left; 707/712/687 cross main_near on the stripes. Island-to-crosswalk shortcut at 300 s
  (647/648 at tile (250–335, 330–360)) is on the island, not road. Not labelled.

## C3902 (seen 0–141 s)
- 24–36 red: group (13,56,57,68,88,91 + scooter 86) walks from main_near's left end to the top of
  lower_left along the corner — mostly sidewalk / crosswalk edge. Not labelled.
- **80–95 red: jaywalking.** Peds 281, 286, 288 (and 287 early) come up the right side of lower_left,
  leave it and walk diagonally across the open junction (tile x 330→630, y 455→310) to main_near.
  Clearly outside any stripes. Label jaywalking [80, 95] (refine with tracks 281/286/288).
- **~99–118: stop_line.** Delivery scooter 344 stands at tile (240,275) = ref (480,550): ~45 ref px past
  the main stop line, before main_near, for the whole red; leaves at green (~120). Rule candidates
  stop_line 99.3–117.4 agree. Label stop_line [99, green onset].
- 120–141 green: lower_left busy with peds; cars turning right pass at the top edge. No clear FTY.
- 144–150 green: scooter 447 (delivery) rides on main_near / junction among cars — not a class.
- 165–195 red (pedestrian phase): mass crossing of main_near and of the open junction toward lower_left
  (peds 441, 523, 545, 579 at 186–195 walk from main_near down across the road to the island / lower_left
  top). 441 at 186 s is on open road between main_near and the island (tile 320,930-540=390).
  Borderline — same shortcut pattern as 80–95 but shorter. Label jaywalking [184, 196] low confidence.
- **264–282 red→green: jaywalking.** Peds 783, 724, 719 leave main_near and walk diagonally down to the
  triangle island / lower_left through open road (783 at tile (405,420) at 276 s, clearly off stripes).
  Label jaywalking [265, 282].
- 216–237 green: ped 711 stands on the triangle island tip then crosses back toward main_near at 234–240
  (on road, between island and main_near, while buses turn) — label jaywalking [231, 243] medium.
- No stopped_vehicle / red_light / wrong_way / accident seen in C3902. Congestion: main queue at red only.

## C3905 (dusk; seen 0–45 s)
- 0 s: delivery motorcyclist on main_near crosswalk; signal unknown at t=0 → skip.
- **12–22 red: jaywalking.** Ped 46 leaves main_near (tile 460,280 @12 s), walks down across open road
  (355,350 @18 s) to the triangle island (365,395 @21 s), waits on island 24–30 s, then continues
  down to lower_left bottom (440,510 @33 s). Label jaywalking [12.5, 22].
- 36–40 green: white Cobalt turns right toward lower_left while peds 43/34/30/40 are on the lower half of
  lower_left (tile 340,510). Candidate failure_to_yield ~[37, 40] — verify with dense sheet.
- **Verified failure_to_yield (review sheets #35–37):** right-turners cross lower_left while the group
  walks on the stripes (ped green runs in phase with vehicle green → permissive-turn conflict every cycle).
  - car 128: 38.8–40.8, passes right beside peds 30/34/43 on the lower half (clear).
  - car 12: 41.8–43.8, crosses the top of lower_left while 112/40 are mid-crosswalk.
  - car 142: 44.3–46.5, same path, 112/40/163 mid-crosswalk.
  The main_near / main_far rule hits at 30–39 s are cars passing ped 65/118 standing at the curb — false.
- 48–72 green: steady ped flow on lower_left; turning vehicles mostly pass behind the groups. No extra FTY
  labelled from 3 s sampling (dense review of the rule's lower_left candidates pending).
- **~76–(green) : stop_line (junction blocking).** Semi-truck enters on late green/amber (~72–75), is stuck
  mid-junction (tile ~760,400 = ref ~1520,800) from ~78 s through the red (still there at 93 s) because the
  exit is blocked. Rule candidates stop_line 75.7–114.6 / 77.6–114.6 are this truck. Stops past the line
  on red → ends when green returns. Label stop_line [start of stop, green onset] (refine from track).
- 96–114 red: truck still blocking; main-approach cars (white van, SUV, sedans at tile x 400–650, y 265–340)
  are stuck ON main_near / in the box behind it for the whole red while peds 329/339/341/353 weave between
  them. Same stop_line episode (merged): stop_line ≈ [78, ~116].
- ~102–112 red: vehicles from the right turn into the lower-left road across lower_left while peds
  329/341 walk down lower_left; white Nexia passes ~1 m from ped 329 at 111 s. Candidate FTY [110, 112.5].
- 117–126 green: normal.
- Review #63–#83 (99–125 s): main_far hits are far-approach cars passing peds 314/330/360 *standing* at the
  median end / curb → false. #76 false. The Nexia on lower_left (109.8–111.8) is not caught by the rule
  (foot point near the frame bottom). Keep as FTY medium [109.8, 111.8].
- Rule lesson: require the walker to be ON the stripes and moving (not waiting at the curb/island end),
  and require vehicle–walker distance small (< ~150 ref px) while both are on the same crosswalk.

## C3896 (daylight; re-seen 0–45 s)
- 0–27 red: far-approach traffic turns right over lower_left with nobody on it → fine. Delivery scooter
  crosses the island / lower_left at 24–27 s → not a class.
- 30–45 green: main release; peds 99/106 walk lower_left at 39–45 with right-turners passing behind them
  → no clear FTY. Scooter 93 rides onto lower_left at 45 s → not a class.
- **red_light candidate #0 (track 173, 78.9 s) is FALSE**: ID switch — 173 is a queued white car upstream
  at 78.4 s and a white SUV in the jammed exit at 82.6 s. No red-light run here.
- **~70–(green) : stop_line (box blocking) — HIGH.** Main-approach cars that entered on late green are frozen
  on/past main_near for the whole red (two black sedans at ref ~(870,570),(990,645); unchanged 77.8→102.2 s)
  while peds 177/180/97 cross main_near between them (84–93 s). Exit toward bottom-right jammed (black SUV,
  white SUV, silver sedan frozen 75–102 s). Label stop_line [~70, green onset].
  Possible congestion on the exit (frozen ≥ 30 s) — low confidence, noted only.
- 96–105: jam clears at green (102.2). 99 s white Lacetti turns over empty lower_left → fine.
- 111–117 green: right-turners pass the top of lower_left while peds 242/243/251–255 walk its lower half,
  well apart → no FTY.
- 120–141 green: junction saturated — dump truck, bus and car platoon crawl through the box toward the
  bottom-right exit (dump truck advances ~100 px in 9 s). Slow but moving → congestion LOW (not labelled).
- 144–165 red: exit jam clears; mass ped crossing of main_near 153–165 on the stripes → fine.
- **~166–173 red: jaywalking (medium).** Peds 286/276 (+302) step off main_near's left half and walk straight
  down over open road to the triangle island / top of lower_left (tile (250–275, 300–340) @168 s →
  (1180–1200−960, 330–380) @171 s). Same shortcut pattern as C3902. Label [166, 173].
- **~179–182 green: failure_to_yield candidate.** White sedan turning right over lower_left bottom
  (tile 370,500 @180 s) as peds 392/399 are on the stripes right beside it (380,420–450). Verify.
- 183–189 green: normal release.
  → clip 177–184: white sedan crosses the lower end of lower_left at 179.3–180.8 s while ped 399 is stepping
    off the island onto the same stripes ~1 car-length away. failure_to_yield MEDIUM [179.3, 180.8].
    The rule misses it (car foot below crosswalk polygon / frame edge).
- 192–237: normal green release then pedestrian red phase (mass crossing of main_near on the stripes). No events.
- **~244–254 red: jaywalking (medium-high).** Peds 577/582/572/597 step off main_near's middle and walk
  diagonally down over open road to the triangle island (tile ~(280–310, 280–400) @249 s), then onto lower_left.
- ~256–260 green: bus turns right over lower_left while the big group is on it → FTY candidate, clip check.
- 264–285: normal green.
  → clip 254–262: bus goes straight past the island's right side, never on lower_left → NOT FTY.
- **~294–328 red: stop_line (junction blocking), medium-high.** Black + white sedans stationary inside the
  junction at ref ~(1020,660)/(1220,740) for the whole red (identical at 300/306/312/318/324 s), move at green
  (~328–330). Same pattern as C3897 209–248. Label stop_line [297, 327.6] (clip: platoon creeps until ~297, then frozen).
- 288–333: ped 652 stands on lower_left for ~45 s (loitering on crosswalk) — not a class.

## C3897 0–45 s
- 5–15 red: big group (14,17,29,45,31,21,18) crosses main_near then walks down to the triangle island / lower_left
  through the ~40 ref-px road gap between main_near and the island (the routine "island shortcut").
  Ped 14 at 6–9 s cuts straight down mid-road. LOW-MEDIUM jaywalking [6, 14].
- 36–42 green: returning group walks island → top-left corner through the unmarked gap. Routine route → not labelled.
- Policy decision for island-shortcut cases: include in dev_labels only when the person is clearly on open
  carriageway (not just the gap next to the island); low-confidence ones stay in notes only.
- 48–78: normal; ped 141 stands on lower_left 57–84 s (loitering) — not a class.
- **80–90 red: jaywalking (high).** Peds 138/194/163/145/74 leave main_near mid-span and walk diagonally
  down over open carriageway to the triangle island (tile (360–440, 270–370) @84 s). Label [80, 89].

## Added 2026-09-23 (rule review)
- **C3897 145–169.8 red: stop_line (junction blocking), medium-high.** White sedan (track 340) stands inside the
  junction at ref ~(1064,838) from ~145 s until green (169.8), same pattern as 209–245. Found by the new
  held-episode stop_line rule; frames at 145.5 / 157.7 / 169.8 show it unmoved.
- C3897 0.2–20.1: car 4, front of the right-hand queue, ~44 ref px past the stop line for the whole red. Nose on
  the stop line / zebra edge — too marginal to label. Kept as a known rule false positive.
- **Consistency pass on jaywalking.** The diagonal walk from main_near's right half down across open road to the
  triangle island tip was labelled in some cycles and left out in others. Frames re-checked (C3897 290–298: peds
  647/648 leave the stripes and walk over asphalt to the island tip; C3902 174–186: group incl. 441/522/523 on
  open road between main_near and the island). Now labelled everywhere it occurs:
  added C3897 [5, 18], C3897 [290.5, 299], C3902 [173, 188].
- Rule false positives traced to detections of people *inside* vehicles (bus passenger C3902 67–75, driver
  C3896 98–105) → the rule now drops person points inside any vehicle box.
