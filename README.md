# Team Solution — WIUT Hackathon 2026, Computer Vision track

We detect traffic events at a signalised junction from a fixed 4K road camera (Part A) and
give a causal accident-risk score for each frame (Part B). The organizers' harness calls
`solution.py`, and everything behind it lives in `src/`.

```bash
pip install -r requirements.txt
python run_submission.py --videos /data/test --out predictions.json --team Solution
python evaluate.py --pred predictions.json --gt ground_truth.json
```

Weights (`weights/yolo11m.pt` 39 MB, `weights/yolo11n.pt` 5 MB) are in the repo, so no
download is needed and the run works offline.

## How it works

```
video ─► register view (SIFT homography to reference.jpg)
      ─► one decode pass, reference frames only (~10 fps, 1920 px)
            ├─ YOLO11m (imgsz 960) ─► ByteTrack ─► trajectories in reference pixels
            └─ every 0.4 s at 4K: read the signal head (red / amber / green)
      ─► rules on trajectories + scene layout + signal phase ─► segments
```

- **Registration** (`src/scene/registration.py`): the camera drifts a little between clips
  (zoom and shift). We draw the scene once on `src/scene/reference.jpg` (stop line, crossings,
  islands, median, junction box, signal lamps: `src/scene/scene.yaml`) and map each video onto
  it with a homography. Every rule works in the same coordinates.
- **Decoding** (`src/video.py`): the videos are 4K 10-bit H.264, so decoding is the bottleneck.
  PyAV skips B-frames, which it can do without decoding them. That gives exactly the ~10 fps of
  reference frames for about a third of the cost.
- **Signal** (`src/scene/signal.py`): HSV reading of the three lamps, smoothed. The visible head
  controls the main approach, so signal classes are judged for that approach only.
- **Rules** (`src/events/`): each class is one function from context to candidate intervals.
  Candidates are merged, blips are dropped, and segments never overlap within a class.

### Enabled classes

A class we predict that never occurs in the test set counts as an F1 of 0. So we only switch on
classes that validate on our dev labels (`src/config.py: ENABLED_CLASSES`).

| class | rule, in short | dev F1 (mean over tIoU .3/.5/.7) |
|---|---|---|
| `stop_line` | a stationary episode (tracker ID switches at one spot are stitched together) past the stop line or inside the junction box, which lasts through the red until green returns. Vehicles that crawl out after the red onset are clearing the box, not blocking it | **0.92** |
| `jaywalking` | a walking person inside the junction-box polygon, off every crossing and island (with margins), who covers at least 60 px over at least 1.5 s. Points inside a vehicle box are dropped (riders, drivers, bus passengers) | **0.53** |

Rules that exist but stay off (they fire on normal traffic in the samples, which contain none of
these events): `red_light`, `failure_to_yield`, `stopped_vehicle`, `wrong_way`, `illegal_u_turn`.

### Part B: risk

`src/risk/estimator.py` is strictly causal. Every 0.2 s it runs YOLO11n on a 1280 px copy of
the frame and ByteTrack, then extrapolates each pair of moving road users' relative motion over
the last second. Risk grows as the predicted closest approach gets smaller (in body sizes) and
sooner (within 5 s). The samples contain no accidents, so we calibrated the threshold on normal
traffic: an alarm means "a sharper conflict than anything in normal traffic at this junction".
The estimator also watches the shared time budget. It knows how long Part A took and projects
the harness's remaining decode time, and it stops processing frames rather than risk the video
being scored as empty.

## Dev set and tools

We labelled the four sample videos ourselves: `labels/dev_labels.json`, with the conventions and
case-by-case reasoning in `labels/NOTES.md` and the labelling guide in `labels/GUIDE.md`
(labelling UI: `tools/labeler.html`). The labels are small and single-annotator, so read the
scores as a sanity check rather than a test result.

```bash
WIUT_CACHE_DIR=.cache python tools/scan_samples.py samples        # detect+track once, cache
WIUT_CACHE_DIR=.cache python tools/dev_eval.py stop_line jaywalking  # per-class F1 vs dev labels
WIUT_CACHE_DIR=.cache python tools/review_candidates.py samples/C3896.MP4 jaywalking  # contact sheets
python tools/risk_scan.py samples                                   # Part B false-alarm check
```

## Runtime

Full harness run on the four samples, on an Apple M-series laptop (MPS, no CUDA). All four
videos finished inside the 3× budget, and the output validates with 0 errors:

| video | length | Part A | Part B (harness decode + risk) | total / budget |
|---|---|---|---|---|
| C3896 | 340 s | 529 s | 337 s | 866 / 1021 s |
| C3897 | 318 s | 454 s | 309 s | 763 / 954 s |
| C3902 | 318 s | 454 s | 267 s | 720 / 954 s |
| C3905 | 128 s | 176 s | 114 s | 290 / 383 s |

Dev-label score with the official `evaluate.py`: **Score A = 0.48** (stop_line 0.92, jaywalking
0.53, failure_to_yield 0 because it is not predicted). There are no accidents in the samples, so
Part B is unscored there. On the samples the risk curve stays below the alarm threshold (0.5).

## Team

| member | role |
|---|---|
| Usmon Reyimberganov ([@usm0n](https://github.com/usm0n)) | captain, full-stack: pipeline, rules, evaluation |
| Mustafo Botirov ([@botirovdevv](https://github.com/botirovdevv)) | frontend: project website |
| Aziz Erkayev | testing / QA |
