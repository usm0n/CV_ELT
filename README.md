# Team Solution — WIUT Hackathon 2026, Computer Vision track

We detect traffic events at a signalised junction from a fixed 4K road camera (Part A) and
give a causal accident-risk score for each frame (Part B). The organizers' harness calls
`solution.py`, and everything behind it lives in `src/`.

**Website:** <https://wiut-cv-solution.vercel.app> · **Live demo:** <https://wiut-cv-solution.vercel.app/demo/>
(API: <https://wiut-demo.umarfamily.uz/health>)

```bash
pip install -r requirements.txt
python run_submission.py --videos /data/test --out predictions.json --team Solution
python evaluate.py --pred predictions.json --gt ground_truth.json
```

Weights (`weights/yolo11m.pt` 39 MB, `weights/yolo11n.pt` 5 MB) are in the repo, so no
download is needed and the run works offline.

**Tested on a clean machine.** In a fresh `python:3.10-slim` container (x86_64, 8 cores, no GPU,
no libGL) the two commands above run unchanged with pip 23, and the harness runs with the
network disabled (`docker run --network none`); the output validates with 0 errors.
`requirements.txt` also resolves on Python 3.10–3.13. Three details make that work:

- **torch from the CUDA 12.6 index** (`--extra-index-url` in `requirements.txt`). PyPI's default
  Linux wheels of torch 2.14 are CUDA 13 builds, which need NVIDIA driver 580 or newer; the
  cu126 wheels run on any driver from 525 up, T4 included.
- **Headless OpenCV only.** We install `ultralytics-opencv-headless` (the same release as
  `ultralytics`) and ship ByteTrack in `src/vendor/` rather than depending on `trackers`, because
  both of those PyPI packages pull in the GUI build of OpenCV. It overwrites the headless one, and
  `import cv2` then fails on a server without libxcb/libGL.
- **Python 3.10 pins.** numpy, scipy and PyAV dropped 3.10 in the releases we use on 3.11+, so
  3.10 gets their last compatible versions through environment markers.

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
python tools/ablation.py                                            # detector / fps / input-size ablation
```

The website's Results page shows the output of the last two tools: an error analysis of the dev
set (every miss and false alarm by cause, class confusion, boundary offsets) and the ablation.

## Reproducibility

- **Seeds.** `src/config.py` sets `SEED = 0`, and `seed_everything()` seeds `random`, NumPy and
  torch and turns on deterministic cuDNN (`cudnn.deterministic = True`, `benchmark = False`).
  `detect_events` calls it before each video.
- **Nothing is trained.** Detection uses the pretrained YOLO11 weights as shipped. Everything
  after detection is rules plus hand-set thresholds in `src/config.py` and `src/risk/estimator.py`.
  The one fitted artefact, `src/scene/priors.npz` (drivable area and dominant travel
  directions), is built deterministically from the sample videos' tracks by
  `tools/build_scene_priors.py`.
- **`predictions_samples.json`** is the harness output on the four sample videos, from the
  tagged commit:
  `python run_submission.py --videos samples --out predictions_samples.json --team Solution`.
- **Hardware profile.** `src/config.py` picks the perception settings from the hardware, not
  from timing: with CUDA or Apple MPS it runs YOLO11m at 10 fps (everything on this page);
  on CPU only it runs YOLO11n at 5 fps (the live demo's settings), because the full profile would
  overrun the time budget on CPU and a video over budget scores as empty. `WIUT_PROFILE=full|light`
  forces one. The choice is the same on every run on a given machine.
- **The only timing-dependent behaviour** is Part B's budget guard. If the projected wall time
  would exceed 85% of the 3× budget, `RiskEstimator` stops running its detector and holds its last
  score, and says so on stderr (`risk: time budget guard engaged at t=…`). It may act only after the
  first 10 s of a video: earlier projections mostly scale up start-up cost, and in v2 that made it
  skip early frames at random, so risk curves differed between runs. Part B is otherwise
  exactly deterministic (two runs: max difference 0.0 on MPS and on CPU). The guard did not engage
  while producing `predictions_samples.json`, so any machine that stays inside the budget
  reproduces the file, events and risk curves both. Part A's events never depend on timing.

## Models, data and licences

| component | used for | licence |
|---|---|---|
| YOLO11m / YOLO11n weights (Ultralytics), COCO-pretrained | vehicle and person detection | AGPL-3.0 (weights); COCO annotations CC BY 4.0 |
| `ultralytics-opencv-headless` (Ultralytics' headless build of `ultralytics`) | inference wrapper | AGPL-3.0 |
| ByteTrack from `trackers` 2.6.0 (Roboflow), vendored in `src/vendor/trackers` (import paths changed only) | multi-object tracking | Apache-2.0 (`src/vendor/trackers/LICENSE`) |
| `supervision` | detection containers | MIT |
| PyAV (`av`) | 4K decode with B-frame skipping | BSD-3-Clause |
| OpenCV, NumPy, SciPy, PyTorch | image ops, maths, inference | Apache-2.0 / BSD |
| FastAPI, uvicorn; Next.js, Recharts (demo server and website only) | live demo, team website | MIT / BSD-3-Clause |

We train on no external datasets. Our own labels of the sample videos (`labels/`) serve only
as a dev set for choosing rules and thresholds.

## Runtime

Full harness run on the four samples, on an Apple M-series laptop (MPS, no CUDA). All four
videos finished inside the 3× budget, and the output validates with 0 errors:

Decoding is the part of the budget that a GPU does not shrink. On an 8-thread x86 server (a 2012
Intel i7-3770), the harness's own pass over every 4K frame (OpenCV) takes 0.70× the video length and
our reference-frame pass (PyAV) 0.47×, so decoding uses 1.17× of the 3× budget. Detection on a T4
adds far less, so we expect about 1.5–2× there, and Part B's budget guard stays idle.

CPU fallback, clean `python:3.10-slim` container on an 8-core x86_64 server with no GPU (the
light profile, see Reproducibility): a 31 s clip of C3905 took 80 s against a 93 s budget.

Measured on v2. The v3 run that produced `predictions_samples.json` took 772 / 725 / 742 / 289 s in
total, all inside the budget, and the guard never engaged:

| video | length | Part A | Part B (harness decode + risk) | total / budget |
|---|---|---|---|---|
| C3896 | 340 s | 529 s | 337 s | 866 / 1021 s |
| C3897 | 318 s | 454 s | 309 s | 763 / 954 s |
| C3902 | 318 s | 454 s | 267 s | 720 / 954 s |
| C3905 | 128 s | 176 s | 114 s | 290 / 383 s |

Dev-label score with the official `evaluate.py`: **Score A = 0.48** (stop_line 0.92, jaywalking
0.53, failure_to_yield 0 because it is not predicted). There are no accidents in the samples, so
Part B is unscored there. On the samples the risk curve stays below the alarm threshold (0.5).

## Website and live demo

The team website lives in `website/` (Next.js, static export). The live-demo API is in `demo/`
(FastAPI, Docker, CPU).

```bash
# 1. data for the site (runs without the videos: predictions, dev-label metrics, scene layout)
python tools/export_site_data.py
# 2. with the sample videos: EDA, heatmaps, event stills and annotated playback (needs ffmpeg)
WIUT_CACHE_DIR=.cache python tools/export_site_data.py --videos samples
# 3. the site
cd website && npm install && npm run dev        # http://localhost:3000
npm run build                                   # static site in website/out/
```

Pages that need the videos (EDA charts, heatmaps, annotated playback, event stills) show a
placeholder until step 2 has been run and its output in `website/public/` is committed.

**Demo API.** Run it locally from the repository root with
`pip install -r requirements.txt -r demo/requirements.txt && uvicorn demo.app:app --port 7860`.
Point the site at it with `NEXT_PUBLIC_DEMO_API=http://localhost:7860` in `website/.env.local`.

- Endpoints: `POST /jobs` takes an upload up to 95 MB; bigger files (raw 4K clips from the camera
  are ~18 MB/s) go through `POST /uploads`, `PUT /uploads/{id}?offset=` in 32 MB chunks (a retried
  chunk is detected by its offset) and `POST /uploads/{id}/finish`, since the Cloudflare tunnel
  caps one request at 100 MB. `POST /jobs/sample` runs a bundled 45 s clip of C3902 and reuses the
  finished result. `GET /jobs/{id}` reports progress and the result, and `GET /media/{id}.mp4`
  serves the annotated video. Clips are limited to 2 minutes.
- On CPU the demo defaults to YOLO11n at 5 fps (`DEMO_DETECTOR`, `DEMO_SAMPLE_INTERVAL`). On our
  deployment (2 ARM cores) a clip takes about 4–5× its length to process.

**Deploy.**
- Demo: `DEMO_HOST=<ssh host> DEMO_NETWORK=<docker network> [DEMO_SAMPLE_FILE=sample.mp4] bash demo/deploy_vm.sh` builds the image
  on any Docker host and runs it on `127.0.0.1:7860`, capped at 2 CPUs / 6 GB. We serve it through a
  Cloudflare tunnel; any HTTPS reverse proxy works. (`demo/deploy_space.sh` targets a Hugging Face
  Docker Space instead, which now needs a PRO account.)
- Website: `cd website && npx vercel --prod`, with `NEXT_PUBLIC_DEMO_API` set to the demo's HTTPS URL.

## Team

| member | role | previous project |
|---|---|---|
| Usmon Reyimberganov ([@usm0n](https://github.com/usm0n)) | captain, full-stack: pipeline, rules, evaluation | [smile-movies.uz](https://smile-movies.uz) |
| Mustafo Botirov ([@botirovdevv](https://github.com/botirovdevv)) | frontend: project website | [prep-zone.uz](https://www.prep-zone.uz) |
| Aziz Erkayev | testing / QA | [baraka-top.uz](https://baraka-top.uz) |
