export const REPO_URL = "https://github.com/usm0n/CV_ELT";
export const WEIGHTS_URL = `${REPO_URL}/tree/main/weights`;
export const PREDICTIONS_URL = "/data/predictions_samples.json";
export const DEMO_API = (process.env.NEXT_PUBLIC_DEMO_API ?? "").replace(/\/$/, "");

export const NAV = [
  { href: "/", label: "Overview" },
  { href: "/approach/", label: "Approach" },
  { href: "/eda/", label: "EDA" },
  { href: "/results/", label: "Results" },
  { href: "/dashboard/", label: "Dashboard" },
  { href: "/demo/", label: "Live demo" },
  { href: "/report/", label: "Report" },
  { href: "/team/", label: "Team" },
] as const;
