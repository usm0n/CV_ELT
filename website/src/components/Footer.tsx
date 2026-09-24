import { PREDICTIONS_URL, REPO_URL, WEIGHTS_URL } from "@/lib/site";

export function Footer() {
  const links = [
    { href: REPO_URL, label: "Repository" },
    { href: WEIGHTS_URL, label: "Weights (YOLO11m / YOLO11n)" },
    { href: PREDICTIONS_URL, label: "predictions_samples.json" },
    { href: `${REPO_URL}/blob/main/labels/dev_labels.json`, label: "Dev labels" },
  ];
  return (
    <footer id="links" className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>WIUT Hackathon 2026 · Computer Vision track · Team Solution</p>
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="hover:text-text hover:underline">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
