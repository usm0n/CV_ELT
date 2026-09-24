import Link from "next/link";

import { Card, Stat } from "@/components/ui";
import { loadMetrics, loadResults } from "@/lib/data";
import { REPO_URL } from "@/lib/site";

const SECTIONS = [
  { href: "/approach/", title: "Approach", text: "The pipeline diagram, what is learned and what is rule-based, and why." },
  { href: "/eda/", title: "EDA", text: "The scene, lane directions, traffic over time, heatmaps, and the findings that shaped the rules." },
  { href: "/results/", title: "Results", text: "Every sample video annotated, with clickable timelines, risk curves and failure cases." },
  { href: "/dashboard/", title: "Dashboard", text: "An operator's view: events per class, per video and per minute." },
  { href: "/demo/", title: "Live demo", text: "Upload a clip and get the events, the risk curve and an annotated playback back." },
  { href: "/report/", title: "Report", text: "One page: what worked, what did not, what we would do next." },
];

export default function Home() {
  const metrics = loadMetrics();
  const results = loadResults();
  const f1 = (c: string) => metrics?.part_a.per_class[c]?.f1_mean ?? 0;
  const nEvents = Object.values(results?.videos ?? {}).reduce((a, v) => a + v.events.length, 0);

  return (
    <>
      <section className="grid items-center gap-10 pb-12 pt-2 lg:grid-cols-2">
        <div>
          <p className="mb-3 text-sm font-medium text-accent">WIUT Hackathon 2026 · Computer Vision track</p>
          <h1 className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
            Reading a busy junction from one fixed camera.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
            Our system watches 4K CCTV of a signalised junction. It reports each traffic violation as a time segment, and it
            scores, frame by frame and using only the past, how likely an accident is to start in the next five seconds.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/demo/" className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">
              Try the live demo
            </Link>
            <Link href="/results/" className="rounded-lg border border-border px-5 py-2.5 text-sm font-semibold hover:border-text">
              See the results
            </Link>
            <a href={REPO_URL} className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted hover:text-text">
              GitHub ↗
            </a>
          </div>
        </div>
        <figure className="overflow-hidden rounded-2xl border border-border bg-black shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/media/reference.jpg" alt="The junction seen by the camera" className="w-full" />
          <figcaption className="bg-surface px-4 py-2 text-xs text-muted">
            Reference view: every clip is registered onto this frame before any rule runs.
          </figcaption>
        </figure>
      </section>

      <section className="grid grid-cols-2 gap-3 pb-14 lg:grid-cols-4">
        <Stat label="Dev Score A" value={metrics ? metrics.score_a.toFixed(2) : "–"} hint="official evaluate.py, own labels" />
        <Stat label="stop_line F1" value={f1("stop_line").toFixed(2)} hint="mean over tIoU 0.3 / 0.5 / 0.7" />
        <Stat label="jaywalking F1" value={f1("jaywalking").toFixed(2)} hint="mean over tIoU 0.3 / 0.5 / 0.7" />
        <Stat label="Events found" value={nEvents} hint={`in ${Object.keys(results?.videos ?? {}).length} sample videos`} />
      </section>

      <section className="pb-6">
        <h2 className="mb-5 text-xl font-semibold tracking-tight">Explore</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((s) => (
            <Link key={s.href} href={s.href} className="group">
              <Card className="h-full transition-colors group-hover:border-text">
                <h3 className="font-semibold">
                  {s.title} <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.text}</p>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
