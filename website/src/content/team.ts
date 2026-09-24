// Team section content. Fill in the TODO fields; empty links are simply not shown.
// Roles come from the README; the contribution lists are drafts written from those roles —
// each member should confirm or correct their own.

export interface Member {
  name: string;
  role: string;
  contributions: string[];
  github?: string;
  linkedin?: string;
  portfolio?: string;
  projects: { name: string; url?: string; note: string }[];
}

export const TEAM: Member[] = [
  {
    name: "Usmon Reyimberganov",
    role: "Captain · full-stack",
    contributions: [
      "Perception pipeline: registration, decoding, detection and tracking",
      "Event rules (stop_line, jaywalking) and segment post-processing",
      "Part B risk estimator and time-budget guard",
      "Dev-set labelling, evaluation and the submission package",
    ],
    github: "https://github.com/usm0n",
    linkedin: "", // TODO
    portfolio: "", // TODO
    projects: [], // TODO: { name, url, note }
  },
  {
    name: "Mustafo Botirov",
    role: "Frontend · project website",
    contributions: [
      "This website: design, interactive timelines and charts, the dashboard",
      "Live-demo page and its integration with the inference API",
      "Data export for the website (tools/export_site_data.py)",
    ],
    github: "https://github.com/botirovdevv",
    linkedin: "", // TODO
    portfolio: "", // TODO
    projects: [], // TODO
  },
  {
    name: "Aziz Erkayev",
    role: "Testing · QA",
    contributions: [
      "Clean-machine runs of the submission commands",
      "Runtime checks against the 3× time budget",
      "Website and demo testing on desktop and phone",
    ],
    github: "", // TODO
    linkedin: "", // TODO
    portfolio: "", // TODO
    projects: [], // TODO
  },
];
