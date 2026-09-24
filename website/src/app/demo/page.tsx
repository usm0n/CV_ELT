import type { Metadata } from "next";

import { LiveDemo } from "@/components/LiveDemo";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Live demo" };

export default function DemoPage() {
  return (
    <>
      <PageHeader eyebrow="Live demo" title="Run the model on your own clip">
        <p>
          Upload a clip and the server runs the submitted code on it: the Part A event pipeline, then the causal Part B risk
          estimator frame by frame, exactly as the organizers&apos; harness drives it. You get the events on a timeline, the
          risk curve and an annotated playback. To fit on a free CPU, the demo uses the small detector (YOLO11n) at 5 fps. The
          submission runs YOLO11m at 10 fps on the GPU, so results here can be slightly weaker.
        </p>
      </PageHeader>
      <LiveDemo />
    </>
  );
}
