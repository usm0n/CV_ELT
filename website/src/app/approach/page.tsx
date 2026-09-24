import type { Metadata } from "next";

import { PipelineDiagram } from "@/components/PipelineDiagram";
import { Card, PageHeader, Section, Swatch } from "@/components/ui";
import { eventColor } from "@/lib/colors";
import { loadMetrics } from "@/lib/data";
import { labelName } from "@/lib/format";
import { REPO_URL } from "@/lib/site";

export const metadata: Metadata = { title: "Approach" };

const ENABLED = [
  {
    label: "stop_line",
    rule: "A stationary episode past the stop line or inside the junction box that lasts through the red until green returns. Tracker ID switches at one spot are stitched together. Vehicles that crawl out after the red onset are clearing the box, not blocking it.",
  },
  {
    label: "jaywalking",
    rule: "A walking person inside the junction-box polygon, off every crossing and island (with margins), who covers at least 60 px over at least 1.5 s. Points inside a vehicle box are dropped (riders, drivers, bus passengers).",
  },
];

const DISABLED = [
  ["red_light", "only candidate in the samples was a tracker ID switch"],
  ["failure_to_yield", "misses cars whose ground point is below the crosswalk; fires on pedestrians waiting at the kerb"],
  ["stopped_vehicle", "fires on normal traffic; the samples contain no true case"],
  ["wrong_way", "fires on normal traffic; the samples contain no true case"],
  ["illegal_u_turn", "fires on normal traffic; the samples contain no true case"],
];

const MODELS = [
  ["YOLO11m (Ultralytics), COCO-pretrained", "Part A detection", "AGPL-3.0 weights; COCO annotations CC BY 4.0"],
  ["YOLO11n (Ultralytics), COCO-pretrained", "Part B detection (light)", "AGPL-3.0"],
  ["ByteTrack (Roboflow trackers)", "multi-object tracking", "Apache-2.0"],
  ["supervision", "detection containers", "MIT"],
  ["PyAV", "4K decode with B-frame skipping", "BSD-3-Clause"],
  ["OpenCV, NumPy, SciPy, PyTorch", "image ops, maths, inference", "Apache-2.0 / BSD"],
];

const STEPS = [
  ["Registration", "src/scene/registration.py", "Median of 12 keyframes → SIFT (4000 features) → RANSAC homography onto the reference view. Falls back to a pure scale when fewer than 25 inliers survive."],
  ["Decoding", "src/video.py", "PyAV with skip_frame = NONREF. At 29.97 fps with an IBBP GOP this yields exactly the ~10 fps of reference frames for a third of the decode cost. Frames are scaled to 1920 px inside the decoder."],
  ["Detection + tracking", "src/perception/", "YOLO11m at imgsz 960, confidence 0.25, batch 16, 6 COCO road-user classes. ByteTrack at 10 fps with a 2 s lost-track buffer."],
  ["Trajectories", "src/tracks.py", "Per track: bottom-centre foot point mapped to reference pixels, smoothed over 5 samples, velocity by finite differences, speed also expressed in body heights per second."],
  ["Signal", "src/scene/signal.py", "Every 0.4 s, crops of the three lamps at full 4K resolution, HSV hue ranges for lit red / amber / green, smoothed with a minimum run length."],
  ["Rules → segments", "src/events/", "Each class is one function from context to candidate intervals. Candidates are merged across gaps < 1 s, blips < 0.5 s are dropped, and segments never overlap within a class."],
  ["Risk (Part B)", "src/risk/estimator.py", "Every 0.2 s: YOLO11n + ByteTrack on 1280 px. For each pair of moving road users, extrapolate the relative motion of the last second and find the closest approach within 5 s. The closer (in body sizes) and the sooner, the higher the score. A monotone recalibration puts everything seen in normal traffic below 0.5."],
];

export default function ApproachPage() {
  const metrics = loadMetrics();
  const f1 = (c: string) => metrics?.part_a.per_class[c]?.f1_mean;

  return (
    <>
      <PageHeader eyebrow="Problem and approach" title="Detector + tracker, then rules on trajectories">
        <p>
          The task: given a clip from a fixed junction camera, return every traffic event as{" "}
          <code className="font-mono text-sm">[start, end, class]</code> (14 official classes, scored by temporal-IoU F1). Also
          return a causal per-frame probability that an accident starts within the next 5 s. We chose a{" "}
          <strong className="text-text">pretrained detector and tracker plus hand-written rules</strong>, not a trained video
          model. There are no labels to train on, the samples contain only a few event types, and rules on trajectories can be
          checked frame by frame.
        </p>
      </PageHeader>

      <Section title="Pipeline">
        <PipelineDiagram />
      </Section>

      <Section title="What is learned and what is rule-based">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <h3 className="text-sm font-semibold text-[#4dabf7]">Learned (used as shipped)</h3>
            <p className="mt-2 text-sm text-muted">
              Only the detectors: YOLO11m / YOLO11n with COCO weights. We fine-tune nothing and train on no external dataset.
            </p>
          </Card>
          <Card>
            <h3 className="text-sm font-semibold text-[#b197fc]">Fitted from the samples</h3>
            <p className="mt-2 text-sm text-muted">
              <code className="font-mono text-xs">priors.npz</code>: the drivable area and dominant travel directions. It is built
              deterministically from the sample tracks by <code className="font-mono text-xs">tools/build_scene_priors.py</code>.
            </p>
          </Card>
          <Card>
            <h3 className="text-sm font-semibold text-[#ff922b]">Rule-based</h3>
            <p className="mt-2 text-sm text-muted">
              Everything after detection: registration, the signal reader, every event rule, segment post-processing and the
              risk score. Thresholds live in <code className="font-mono text-xs">src/config.py</code> and{" "}
              <code className="font-mono text-xs">src/risk/estimator.py</code>.
            </p>
          </Card>
        </div>
      </Section>

      <Section
        title="Enabled classes"
        lead="A class we predict that never occurs in the test set enters macro-F1 as a 0, so we only switch on classes that validate on our dev labels."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {ENABLED.map((e) => (
            <Card key={e.label}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 font-semibold">
                  <Swatch color={eventColor(e.label)} /> {labelName(e.label)}
                </h3>
                {f1(e.label) !== undefined && (
                  <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium tabular-nums">
                    dev F1 {f1(e.label)!.toFixed(2)}
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{e.rule}</p>
            </Card>
          ))}
        </div>
        <h3 className="mb-2 mt-6 text-sm font-semibold">Implemented but switched off</h3>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {DISABLED.map(([c, why]) => (
            <li key={c} className="rounded-lg border border-border px-3 py-2">
              <span className="font-medium">{labelName(c)}</span>
              <span className="text-muted">: {why}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Step by step" lead="Enough detail to rebuild the pipeline. The file paths link into the repository.">
        <ol className="space-y-3">
          {STEPS.map(([name, file, text], i) => (
            <li key={name} className="flex gap-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold">{i + 1}</span>
              <div>
                <p className="text-sm font-semibold">
                  {name}{" "}
                  <a href={`${REPO_URL}/tree/main/${file}`} className="ml-1 font-mono text-xs font-normal text-accent hover:underline">
                    {file}
                  </a>
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Models, libraries and licences">
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">component</th>
                <th className="px-4 py-3 font-medium">used for</th>
                <th className="px-4 py-3 font-medium">licence</th>
              </tr>
            </thead>
            <tbody>
              {MODELS.map(([c, u, l]) => (
                <tr key={c} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 font-medium">{c}</td>
                  <td className="px-4 py-2.5 text-muted">{u}</td>
                  <td className="px-4 py-2.5 text-muted">{l}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">
          Reproducibility: <code className="font-mono">SEED = 0</code> for random / NumPy / torch, deterministic cuDNN. The
          weights ship in the repository, so the run works offline.
        </p>
      </Section>
    </>
  );
}
