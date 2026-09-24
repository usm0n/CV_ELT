# Technical report

**Team Solution · WIUT Hackathon 2026 · Computer Vision track**

## What we built

A one-command offline system (`solution.py` → `src/`) for a fixed 4K camera over a signalised junction.

- **Part A.** It registers each clip to a hand-annotated reference view and decodes only the reference frames (~10 fps). YOLO11m + ByteTrack turn the frames into trajectories, and the traffic signal is read from its lamps. Rules on trajectories, scene layout and signal phase then produce event segments.
- **Part B.** A causal risk score. Every 0.2 s it runs YOLO11n + ByteTrack, extrapolates each pair of moving road users over the next 5 s, and scores how close and how soon they would meet.

Nothing is trained. The detectors are COCO-pretrained, and every threshold was chosen on our own labels of the four sample videos (17 events).

## What worked

- **Choosing classes, not just rules.** Macro-F1 punishes predicting a class that never occurs. So we enabled only the two classes that validate on the dev set: `stop_line` (dev F1 0.92) and `jaywalking` (0.53). The dev Score A with the official `evaluate.py` is 0.48.
- **Registration first.** The camera drifts between clips. One SIFT homography per clip lets a single layout file serve every video, and made the rules much easier to debug.
- **Decoder-level frame skipping.** Skipping B-frames in PyAV gives exactly the reference frames for about a third of the decode cost. That, more than GPU speed, keeps the 4K run inside the 3× time budget.
- **Held-episode `stop_line`.** Treating "stuck in the box through the whole red" as one stationary episode, stitched across tracker ID switches, matches how we labelled junction blocking (tIoU 0.75–1.0 on every true case).
- **Calibrating Part B on normal traffic.** With no accidents to learn from, we made the alarm line mean "a sharper conflict than anything in ~18 minutes of normal traffic here". The samples raise no false alarms (highest score 0.46).

## What did not work

- **Jaywalking boundaries.** We find the right people, but pedestrian tracks break up behind turning buses. So segments end early, and several correct detections fall below tIoU 0.3.
- **failure_to_yield.** We labelled 5 cases, but the rule misses cars whose ground point is below the crosswalk polygon at the frame edge. It also fires on pedestrians waiting at the kerb. It stays off.
- **red_light, wrong_way, stopped_vehicle, illegal_u_turn.** These rules exist but fire on normal traffic, and the samples contain no true case to tune them on.
- **Part B is unvalidated.** Without an accident in the data, we cannot measure AP or time-to-accident. We can only show that it stays quiet.
- **Single-annotator labels.** Our dev set is small and biased toward what our tracker sees.

## What we would do next

1. Stitch pedestrian tracks (like the stationary-vehicle stitching), then re-tune the jaywalking boundaries at tIoU 0.7.
2. Rework `failure_to_yield` around the vehicle's box edge instead of its foot point, and require the walker to be moving on the stripes.
3. Train a clip classifier for `accident` / `near_miss` on public crash datasets (DoTA, CCD), used as a re-scorer for Part B conflicts.
4. Ground-plane calibration from lane markings, for real speeds and a less perspective-dependent time-to-collision.
5. A second annotator for the dev set, and inter-annotator agreement on event boundaries.
