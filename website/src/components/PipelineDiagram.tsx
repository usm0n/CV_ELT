type Kind = "io" | "learned" | "rule" | "geo";

interface Step {
  title: string;
  detail: string;
  kind: Kind;
}

const KIND: Record<Kind, { label: string; cls: string }> = {
  io: { label: "input / output", cls: "border-border bg-surface-2" },
  learned: { label: "learned (pretrained)", cls: "border-[#4dabf7] bg-[#4dabf7]/10" },
  rule: { label: "rule-based", cls: "border-[#ff922b] bg-[#ff922b]/10" },
  geo: { label: "geometry / signal", cls: "border-[#b197fc] bg-[#b197fc]/10" },
};

const PART_A: Step[] = [
  { title: ".mp4 (4K, 10-bit)", detail: "path from the harness", kind: "io" },
  { title: "Register view", detail: "median background → SIFT → homography to reference.jpg", kind: "geo" },
  { title: "Decode reference frames", detail: "PyAV skips B-frames: ~10 fps at 1920 px", kind: "io" },
  { title: "YOLO11m + ByteTrack", detail: "imgsz 960, 6 road-user classes → trajectories", kind: "learned" },
  { title: "Signal reader", detail: "4K crop every 0.4 s, HSV lamp state, smoothed", kind: "geo" },
  { title: "Event rules", detail: "trajectories × scene layout × signal phase", kind: "rule" },
  { title: "Segments", detail: "merge gaps, drop blips, no same-class overlap", kind: "rule" },
];

const PART_B: Step[] = [
  { title: "Frame t (causal)", detail: "harness calls step() for every frame", kind: "io" },
  { title: "YOLO11n + ByteTrack", detail: "every 0.2 s on a 1280 px copy", kind: "learned" },
  { title: "Closest approach", detail: "pairwise relative motion over the last 1 s, 5 s horizon", kind: "rule" },
  { title: "Risk score", detail: "calibrated so normal traffic stays < 0.5; budget guard", kind: "rule" },
];

function Row({ title, steps }: { title: string; steps: Step[] }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
      <ol className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-stretch">
        {steps.map((s, i) => (
          <li key={s.title} className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
            <div className={`rounded-lg border px-3 py-2 md:w-40 ${KIND[s.kind].cls}`}>
              <p className="text-sm font-semibold leading-tight">{s.title}</p>
              <p className="mt-1 text-[11px] leading-snug text-muted">{s.detail}</p>
            </div>
            {i < steps.length - 1 && (
              <span aria-hidden className="self-center text-muted">
                <span className="md:hidden">↓</span>
                <span className="hidden md:inline">→</span>
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function PipelineDiagram() {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
      <div className="flex flex-col gap-8">
        <Row title="Part A: event detection (detect_events)" steps={PART_A} />
        <Row title="Part B: accident anticipation (RiskEstimator.step)" steps={PART_B} />
      </div>
      <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-4 text-xs text-muted">
        {Object.values(KIND).map((k) => (
          <span key={k.label} className="inline-flex items-center gap-1.5">
            <span className={`inline-block h-3 w-4 rounded-sm border ${k.cls}`} /> {k.label}
          </span>
        ))}
      </div>
    </div>
  );
}
