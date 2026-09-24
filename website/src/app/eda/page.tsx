import type { Metadata } from "next";

import { BrightnessPanel, CountsPanel, SignalPanel, SpeedPanel } from "@/components/EdaCharts";
import { SceneMap } from "@/components/SceneMap";
import { Card, PageHeader, Pending, Section } from "@/components/ui";
import { loadEda, loadResults, loadScene, mediaUrl } from "@/lib/data";
import { fmtTime } from "@/lib/format";

export const metadata: Metadata = { title: "EDA" };

const FINDINGS = [
  {
    finding: "The “fixed” camera drifts between clips (small zoom and shift).",
    effect:
      "We draw the scene once on a reference frame and map every video onto it with a SIFT homography, so every rule works in one coordinate frame.",
  },
  {
    finding: "The footage is 4K, 10-bit H.264 with an IBBP GOP, so decoding is the bottleneck.",
    effect:
      "Part A decodes only the reference (P) frames, which gives exactly ~10 fps for a third of the cost. The detector sees 1920 px frames; full 4K is kept only every 0.4 s to read the signal lamps.",
  },
  {
    finding: "The main approach's signal head is visible, a few pixels wide.",
    effect: "The signal is read from HSV colour on the lamps, so the signal-dependent classes (stop_line) are judged for that approach only.",
  },
  {
    finding: "Most pedestrians who leave the stripes take a short cut through the gap next to the triangle island.",
    effect:
      "The jaywalking zone (the junction polygon) stops at the island's upper edge. Walking on open carriageway counts; the routine short cut does not.",
  },
  {
    finding: "YOLO finds “people” inside buses and cars (passengers, drivers).",
    effect: "Person points inside any vehicle box are dropped before the jaywalking rule runs.",
  },
  {
    finding: "Late-green vehicles regularly get stuck in the junction box for a whole red.",
    effect: "The biggest recurring event. stop_line is a held stationary episode past the line that lasts until green returns.",
  },
  {
    finding: "No accidents, near misses, wrong-way driving or red-light runs occur in ~18 min of samples.",
    effect:
      "Those rules stay switched off (a predicted class that never occurs costs F1 = 0), and Part B is calibrated so normal traffic never reaches the alarm line.",
  },
];

export default function EdaPage() {
  const eda = loadEda();
  const results = loadResults();
  const scene = loadScene();
  const heatVehicle = mediaUrl("heatmap_vehicle.jpg");
  const heatPerson = mediaUrl("heatmap_person.jpg");
  const ids = Object.keys(results?.videos ?? {});
  const totalSec = ids.reduce((a, id) => a + (results?.videos[id].duration ?? 0), 0);

  return (
    <>
      <PageHeader eyebrow="Exploratory data analysis" title="Four clips of one junction">
        <p>
          The organizers gave us {ids.length} unlabeled sample videos ({fmtTime(totalSec).replace(/\.\d$/, "")} min in
          total) from one fixed CCTV camera over a signalised junction. Everything below comes from our own pipeline:
          detections, tracks and signal readings.
        </p>
      </PageHeader>

      <Section title="Video properties">
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">video</th>
                <th className="px-3 py-3 font-medium">resolution</th>
                <th className="px-3 py-3 font-medium">fps</th>
                <th className="px-3 py-3 font-medium">duration</th>
                <th className="px-3 py-3 font-medium">frames</th>
                <th className="px-3 py-3 font-medium">size</th>
                <th className="px-3 py-3 font-medium">tracked objects</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {ids.map((id) => {
                const e = eda?.videos[id];
                const r = results!.videos[id];
                const objects = e ? Object.values(e.unique_objects).reduce((a, b) => a + b, 0) : null;
                return (
                  <tr key={id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 font-medium">{id}</td>
                    <td className="px-3 py-2.5">{e ? `${e.width}×${e.height}` : "3840×2160"}</td>
                    <td className="px-3 py-2.5">{e?.fps ?? r.fps}</td>
                    <td className="px-3 py-2.5">{fmtTime(e?.duration ?? r.duration)}</td>
                    <td className="px-3 py-2.5">{e?.n_frames.toLocaleString() ?? "–"}</td>
                    <td className="px-3 py-2.5">{e ? `${e.size_mb} MB` : "–"}</td>
                    <td className="px-3 py-2.5">{objects?.toLocaleString() ?? "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">
          All clips: 10-bit H.264, IBBP GOP (a reference frame every 3rd frame). C3896, C3897 and C3902 are daylight; C3905 is
          dusk.
        </p>
      </Section>

      <Section
        title="Scene layout and lane directions"
        lead="The layout (stop line, crosswalks, islands, median, junction box, signal lamps) is drawn by hand on the reference frame. The drivable area and dominant travel directions are learned from moving-vehicle tracks of the samples (tools/build_scene_priors.py). Toggle the layers."
      >
        {scene ? (
          <SceneMap
            scene={scene}
            trajectories={eda ? Object.fromEntries(Object.entries(eda.videos).map(([k, v]) => [k, v.trajectories])) : undefined}
          />
        ) : (
          <Pending what="Scene map" />
        )}
      </Section>

      <Section title="Traffic over time">
        {eda ? (
          <div className="grid gap-5 lg:grid-cols-2">
            <CountsPanel eda={eda} />
            <BrightnessPanel eda={eda} />
          </div>
        ) : (
          <Pending what="Object counts by class and lighting over time" />
        )}
      </Section>

      <Section title="Motion heatmaps" lead="Where the ground contact points of all tracks fall, accumulated over all samples on the reference view (log scale).">
        {heatVehicle || heatPerson ? (
          <div className="grid gap-5 md:grid-cols-2">
            {[
              [heatVehicle, "Vehicles"],
              [heatPerson, "Pedestrians"],
            ].map(([src, name]) =>
              src ? (
                <figure key={name}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`${name} motion heatmap`} className="w-full rounded-xl border border-border" loading="lazy" />
                  <figcaption className="mt-2 text-xs text-muted">{name}</figcaption>
                </figure>
              ) : null,
            )}
          </div>
        ) : (
          <Pending what="Vehicle and pedestrian heatmaps" />
        )}
      </Section>

      <Section title="Signal cycle and speeds">
        {eda ? (
          <div className="grid gap-5 lg:grid-cols-2">
            <SignalPanel eda={eda} />
            <SpeedPanel eda={eda} />
          </div>
        ) : (
          <Pending what="Signal phase timelines and speed distribution" />
        )}
      </Section>

      <Section title="Findings that shaped the solution">
        <div className="grid gap-3">
          {FINDINGS.map((f, i) => (
            <Card key={i} className="grid gap-2 sm:grid-cols-2 sm:gap-6">
              <p className="text-sm font-medium">{f.finding}</p>
              <p className="text-sm text-muted">→ {f.effect}</p>
            </Card>
          ))}
        </div>
      </Section>
    </>
  );
}
