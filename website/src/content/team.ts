// Team section content. Empty links are simply not shown; a project's note is optional.

const PROFILE_BASE = "https://team-solution-iota.vercel.app/en/team";

export interface Member {
  name: string;
  slug: string; // profile page: PROFILE_BASE/<slug>
  role: string;
  contributions: string[];
  github?: string;
  linkedin?: string;
  portfolio?: string;
  projects: { name: string; url?: string; note?: string }[];
}

export const profileUrl = (m: Member) => `${PROFILE_BASE}/${m.slug}`;

export const TEAM: Member[] = [
  {
    name: "Usmon Reyimberganov",
    slug: "usmon-reyimberganov",
    role: "Captain · full-stack",
    contributions: [
      "Perception pipeline: registration, decoding, detection and tracking",
      "Event rules (stop_line, jaywalking) and segment post-processing",
      "Part B risk estimator and time-budget guard",
      "Dev-set labelling, evaluation and the submission package",
    ],
    github: "https://github.com/usm0n",
    linkedin: "",
    portfolio: "",
    projects: [{ name: "smile-movies.uz", url: "https://smile-movies.uz" }],
  },
  {
    name: "Mustafo Botirov",
    slug: "mustafo-botirov",
    role: "Frontend · project website",
    contributions: [
      "This website: design, interactive timelines and charts, the dashboard",
      "Live-demo page and its integration with the inference API",
      "Data export for the website (tools/export_site_data.py)",
    ],
    github: "https://github.com/botirovdevv",
    linkedin: "",
    portfolio: "",
    projects: [{ name: "prep-zone.uz", url: "https://www.prep-zone.uz" }],
  },
  {
    name: "Aziz Erkayev",
    slug: "azizbek-erkayev",
    role: "Testing · QA",
    contributions: [
      "Clean-machine runs of the submission commands",
      "Runtime checks against the 3× time budget",
      "Website and demo testing on desktop and phone",
    ],
    github: "",
    linkedin: "",
    portfolio: "",
    projects: [{ name: "baraka-top.uz", url: "https://baraka-top.uz" }],
  },
];
