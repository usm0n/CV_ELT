// Shapes of the files written by tools/export_site_data.py and returned by the demo API.

export type Status = "tp" | "fp" | "fn";
export type Segment = [number, number, string, Status?];
export type Curve = [number, number][];
export type SignalRun = [number, number, "red" | "amber" | "green" | "unknown"];

export interface VideoResult {
  duration: number;
  fps: number | null;
  events: Segment[];
  labels: Segment[];
  risk: Curve;
  risk_max: number;
}

export interface Results {
  team: string;
  match_tiou: number;
  videos: Record<string, VideoResult>;
}

export interface Prf {
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface Metrics {
  score_a: number;
  note: string;
  part_a: {
    score_a: number;
    classes: string[];
    per_class: Record<string, Record<"0.3" | "0.5" | "0.7", Prf> & { f1_mean: number }>;
    micro: Record<string, Prf>;
    class_agnostic: Record<string, Prf>;
    per_video: Array<Record<string, string | number>> | null;
  };
}

export type Counts = { t: number[] } & Record<string, number[]>;

export interface EdaVideo {
  width: number;
  height: number;
  fps: number;
  n_frames: number;
  duration: number;
  size_mb: number;
  brightness: Curve;
  counts: Counts;
  unique_objects: Record<string, number>;
  signal: SignalRun[];
  speed_hist: { edges: number[]; counts: number[] };
  trajectories: [string, number, [number, number][]][];
}

export interface Eda {
  count_bin: number;
  videos: Record<string, EdaVideo>;
}

export interface Scene {
  size: [number, number];
  cell: number;
  layout: {
    signal_lamps: Record<string, [number, number]>;
    stop_line_main: [number, number][];
    crosswalks: Record<string, [number, number][]>;
    median: [number, number][];
    islands: [number, number][][];
    junction: [number, number][];
  };
  flow: [number, number, number, number][];
  drivable: [number, number][];
}

export interface DemoResult {
  video: { name: string; width: number; height: number; fps: number; duration: number };
  events: [number, number, string][];
  risk: Curve;
  counts: Counts;
  signal: SignalRun[];
  video_url: string;
  detector: string;
}

export interface DemoJob {
  id: string;
  name: string;
  state: "queued" | "analyzing" | "risk" | "rendering" | "done" | "error";
  progress: number;
  queue_position: number | null;
  elapsed: number;
  error: string | null;
  result: DemoResult | null;
}

export interface EventExample {
  video: string;
  start: number;
  end: number;
  label: string;
  t: number;
  img: string;
}
