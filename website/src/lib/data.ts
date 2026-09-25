// Build-time access to the exported data (server components only).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { Ablation, Eda, Errors, EventExample, Metrics, Results, Scene } from "./types";

const PUBLIC = path.join(process.cwd(), "public");

function readJson<T>(name: string): T | null {
  const file = path.join(PUBLIC, "data", name);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : null;
}

export const loadResults = () => readJson<Results>("results.json");
export const loadMetrics = () => readJson<Metrics>("metrics.json");
export const loadScene = () => readJson<Scene>("scene.json");
export const loadEda = () => readJson<Eda>("eda.json");
export const loadExamples = () => readJson<EventExample[]>("examples.json");
export const loadErrors = () => readJson<Errors>("errors.json");
export const loadAblation = () => readJson<Ablation>("ablation.json");

/** Public URL of a media file if it exists (e.g. annotated videos added by export_site_data.py --videos). */
export function mediaUrl(name: string): string | null {
  return existsSync(path.join(PUBLIC, "media", name)) ? `/media/${name}` : null;
}

export const stem = (video: string) => video.replace(/\.[^.]+$/, "");
