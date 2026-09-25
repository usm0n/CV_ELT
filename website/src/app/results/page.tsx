import type { Metadata } from "next";

import { AblationTable } from "@/components/AblationTable";
import { ErrorAnalysis } from "@/components/ErrorAnalysis";
import { MetricsTable } from "@/components/MetricsTable";
import { Card, PageHeader, Pending, Section, Swatch } from "@/components/ui";
import { VideoResults, type VideoEntry } from "@/components/VideoResults";
import { eventColor } from "@/lib/colors";
import { loadAblation, loadEda, loadErrors, loadExamples, loadMetrics, loadResults, mediaUrl, stem } from "@/lib/data";
import { fmtTime, labelName } from "@/lib/format";

export const metadata: Metadata = { title: "Results" };

const FAILURES = [
  {
    title: "Jaywalking segments that start right but end too early",
    body: "C3896 160–162 s against a labelled 161–169 s (tIoU 0.13), and 237–244 s against 240–253 s (0.24). The rule fires on the right people. Their tracks then break up when the group walks behind turning buses, so the segment closes early and both the prediction and the label count as errors at tIoU ≥ 0.3. Stitching pedestrian tracks the way we already stitch stationary vehicles is the next fix.",
  },
  {
    title: "A car whose nose sits on the stop line",
    body: "C3897 0–20 s, stop_line false positive: car 4 at the front of the queue waits about 44 reference pixels past the line through the whole red. We decided this is too marginal to label. The rule's rather crude geometry disagrees, so we keep it as a known false positive and do not tune the threshold to one sample.",
  },
  {
    title: "failure_to_yield is labelled but switched off",
    body: "There are 5 dev-label events: right-turners crossing the lower-left crosswalk next to walkers. The rule misses them, because the car's ground point falls below the crosswalk polygon at the frame edge. It also fires on cars passing pedestrians who are only waiting at the kerb. It scores F1 = 0 either way, so it stays off: a predicted class that never occurs in the test set would cost more.",
  },
  {
    title: "red_light and ID switches",
    body: "The one red_light candidate in the samples (C3896 at 78.9 s, track 173) is a tracker ID switch: one ID jumps from a queued car to an SUV in the jammed exit. With no true red-light runs to validate on, the rule stays disabled.",
  },
  {
    title: "Part B has never seen an accident",
    body: "The samples contain no collisions. So we could only calibrate the risk curve against normal traffic, making sure it never reaches the alarm line there. How well it ranks real pre-crash frames is untested. The pair logic works in image space and has no ground-plane speeds.",
  },
];

export default function ResultsPage() {
  const results = loadResults();
  const metrics = loadMetrics();
  const eda = loadEda();
  const examples = loadExamples();
  const errors = loadErrors();
  const ablation = loadAblation();
  if (!results || !metrics) return <Pending what="Results" />;

  const videos: VideoEntry[] = Object.entries(results.videos).map(([id, result]) => ({
    id,
    result,
    videoUrl: mediaUrl(`${stem(id)}.mp4`),
    signal: eda?.videos[id]?.signal ?? null,
  }));

  const byClass = new Map<string, typeof examples>();
  for (const ex of examples ?? []) byClass.set(ex.label, [...(byClass.get(ex.label) ?? []), ex]);

  return (
    <>
      <PageHeader eyebrow="Results on the sample videos" title="What the model sees in each sample">
        <p>
          Every sample video, annotated by our own renderer (<code className="font-mono text-sm">src/render.py</code>):
          tracked road users, the scene layout, the signal state, active events and the live risk bar. Click any event on
          the list or the timeline to jump to it. Predictions are exactly <code className="font-mono text-sm">predictions_samples.json</code>, the harness
          output of the tagged commit.
        </p>
      </PageHeader>

      <Section title="Per-video playback, timeline and risk">
        <VideoResults videos={videos} />
      </Section>

      <Section
        title="Score against our dev labels"
        lead={
          <>
            Official <code className="font-mono">evaluate.py</code>, run on our own labels of the four samples (17 events, one
            annotator). These are small, so treat the numbers as a sanity check, not a test score. Classes enter the macro
            average if they are labelled <em>or</em> predicted, which is why unpredicted <code className="font-mono">failure_to_yield</code> shows up at 0.
          </>
        }
      >
        <MetricsTable metrics={metrics} />
      </Section>

      <Section
        id="errors"
        title="Error analysis"
        lead="Where the dev-set errors come from. Most are boundaries, not detections: the model finds the right event and the segment edges are off."
      >
        {errors ? <ErrorAnalysis errors={errors} /> : <Pending what="Error analysis" />}
      </Section>

      {ablation && (
        <Section
          id="ablations"
          title="Ablations: detector, frame rate, input size"
          lead={
            <>
              The same rules on detections from different settings. The first row is the submission. The fourth is the
              profile the code switches to by itself on a machine without a GPU, and the one the live demo runs, so a
              missing GPU costs accuracy instead of scoring every video as empty. The smaller detector loses about 0.02:
              stop lines drop from 0.92 to 0.83 while jaywalking rises a little. Halving the frame rate or the input
              size changed nothing on our 21 dev events. That is too few to prove the settings equivalent, and the time
              budget has room, so the submission keeps 10 fps and 960 px.
            </>
          }
        >
          <AblationTable ablation={ablation} />
        </Section>
      )}

      <Section title="Examples of each class we detect" lead="One annotated still per predicted event, taken at the midpoint of the segment.">
        {byClass.size === 0 ? (
          <Pending what="Event stills" />
        ) : (
          [...byClass.entries()].map(([label, list]) => (
            <div key={label} className="mb-6">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Swatch color={eventColor(label)} /> {labelName(label)} <span className="font-normal text-muted">({list!.length})</span>
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list!.map((ex) => (
                  <figure key={ex.img} className="overflow-hidden rounded-lg border border-border bg-surface">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ex.img} alt={`${labelName(ex.label)} in ${ex.video} at ${fmtTime(ex.t)}`} loading="lazy" className="aspect-video w-full object-cover" />
                    <figcaption className="px-3 py-2 text-xs text-muted">
                      {stem(ex.video)} · {fmtTime(ex.start)}–{fmtTime(ex.end)}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          ))
        )}
      </Section>

      <Section title="Honest failure cases" lead="Each comes from our review notes (labels/NOTES.md) and appears in the table above.">
        <div className="grid gap-4 md:grid-cols-2">
          {FAILURES.map((f) => (
            <Card key={f.title}>
              <h3 className="text-sm font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
            </Card>
          ))}
        </div>
      </Section>
    </>
  );
}
