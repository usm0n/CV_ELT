"use client";

import { useState } from "react";

import { classColor } from "@/lib/colors";
import type { EdaVideo, Scene } from "@/lib/types";

type Layer = "layout" | "flow" | "drivable" | "trajectories";

const LAYER_TEXT: Record<Layer, string> = {
  layout: "Scene layout",
  flow: "Lane directions",
  drivable: "Drivable area",
  trajectories: "Trajectories",
};

const poly = (pts: [number, number][]) => pts.map((p) => p.join(",")).join(" ");

/** Reference view with the hand-drawn layout (scene.yaml) and learned priors (priors.npz). */
export function SceneMap({
  scene,
  trajectories,
  initial = ["layout", "flow"],
}: {
  scene: Scene;
  trajectories?: Record<string, EdaVideo["trajectories"]>;
  initial?: Layer[];
}) {
  const [on, setOn] = useState<Set<Layer>>(new Set(initial));
  const videoIds = Object.keys(trajectories ?? {});
  const [video, setVideo] = useState(videoIds[0] ?? "");
  const layers: Layer[] = ["layout", "flow", "drivable", ...(videoIds.length ? (["trajectories"] as Layer[]) : [])];
  const toggle = (l: Layer) =>
    setOn((s) => {
      const n = new Set(s);
      if (n.has(l)) n.delete(l);
      else n.add(l);
      return n;
    });
  const L = scene.layout;
  const [w, h] = scene.size;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {layers.map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={on.has(l)}
            onClick={() => toggle(l)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              on.has(l) ? "border-text bg-text text-bg" : "border-border text-muted hover:text-text"
            }`}
          >
            {LAYER_TEXT[l]}
          </button>
        ))}
        {on.has("trajectories") && videoIds.length > 1 && (
          <select
            value={video}
            onChange={(e) => setVideo(e.target.value)}
            className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
            aria-label="Video for trajectories"
          >
            {videoIds.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        )}
      </div>
      <div className="relative overflow-hidden rounded-xl border border-border bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/media/reference.jpg" alt="Reference view of the junction" className="block w-full opacity-90" />
        <svg viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 h-full w-full">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="#ffd43b" />
            </marker>
          </defs>
          {on.has("drivable") &&
            scene.drivable.map(([x, y], i) => (
              <rect key={i} x={x} y={y} width={scene.cell} height={scene.cell} fill="#4dabf7" opacity={0.28} />
            ))}
          {on.has("layout") && (
            <g strokeWidth={3} fill="none">
              <polygon points={poly(L.junction)} stroke="#ffa94d" fill="#ffa94d" fillOpacity={0.12} strokeDasharray="10 8" />
              {Object.entries(L.crosswalks).map(([k, p]) => (
                <polygon key={k} points={poly(p)} stroke="#ffffff" fill="#ffffff" fillOpacity={0.18} />
              ))}
              {L.islands.map((p, i) => (
                <polygon key={i} points={poly(p)} stroke="#ff8787" fill="#ff8787" fillOpacity={0.25} />
              ))}
              <polygon points={poly(L.median)} stroke="#b197fc" fill="#b197fc" fillOpacity={0.25} />
              <polyline points={poly(L.stop_line_main)} stroke="#fa5252" strokeWidth={7} />
              {Object.entries(L.signal_lamps).map(([k, [x, y]]) => (
                <circle key={k} cx={x} cy={y} r={9} fill="none" stroke="#fff" strokeWidth={2.5} />
              ))}
            </g>
          )}
          {on.has("flow") &&
            scene.flow.map(([x, y, dx, dy], i) => (
              <line
                key={i}
                x1={x - dx * 18}
                y1={y - dy * 18}
                x2={x + dx * 18}
                y2={y + dy * 18}
                stroke="#ffd43b"
                strokeWidth={3}
                markerEnd="url(#arrow)"
                opacity={0.9}
              />
            ))}
          {on.has("trajectories") &&
            trajectories?.[video]?.map(([cls, , pts], i) => (
              <polyline key={i} points={poly(pts)} fill="none" stroke={classColor(cls)} strokeWidth={cls === "person" ? 2.5 : 3.5} opacity={0.75} />
            ))}
        </svg>
      </div>
      {on.has("layout") && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
          <Key color="#fa5252">main stop line</Key>
          <Key color="#ffffff" border>
            crosswalks
          </Key>
          <Key color="#ffa94d">junction box (jaywalking zone)</Key>
          <Key color="#ff8787">pedestrian islands</Key>
          <Key color="#b197fc">median</Key>
          <Key color="#ffd43b">dominant travel direction</Key>
        </div>
      )}
    </div>
  );
}

function Key({ color, border, children }: { color: string; border?: boolean; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-4 rounded-sm ${border ? "border border-muted" : ""}`} style={{ background: color }} />
      {children}
    </span>
  );
}
