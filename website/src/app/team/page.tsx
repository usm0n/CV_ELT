import type { Metadata } from "next";

import { Card, PageHeader } from "@/components/ui";
import { TEAM } from "@/content/team";

export const metadata: Metadata = { title: "Team" };

const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2);

export default function TeamPage() {
  return (
    <>
      <PageHeader eyebrow="Team Solution" title="Who built this">
        <p>Three people, one submission. Roles and who did what are below; the repository history has the details.</p>
      </PageHeader>
      <div className="grid gap-5 md:grid-cols-3">
        {TEAM.map((m) => {
          const links = [
            ["GitHub", m.github],
            ["LinkedIn", m.linkedin],
            ["Portfolio", m.portfolio],
          ].filter(([, url]) => url) as [string, string][];
          return (
            <Card key={m.name} className="flex flex-col">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-base font-semibold text-accent">
                  {initials(m.name)}
                </span>
                <div>
                  <h2 className="font-semibold leading-tight">{m.name}</h2>
                  <p className="text-sm text-muted">{m.role}</p>
                </div>
              </div>
              <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted">Did</h3>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
                {m.contributions.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              {m.projects.length > 0 && (
                <>
                  <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted">Projects we are proud of</h3>
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {m.projects.map((p) => (
                      <li key={p.name}>
                        {p.url ? (
                          <a href={p.url} className="font-medium text-accent hover:underline">
                            {p.name}
                          </a>
                        ) : (
                          <span className="font-medium">{p.name}</span>
                        )}
                        {p.note && <span className="text-muted">: {p.note}</span>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {links.length > 0 && (
                <div className="mt-auto flex flex-wrap gap-2 pt-5">
                  {links.map(([label, url]) => (
                    <a key={label} href={url} className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:border-text">
                      {label} ↗
                    </a>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
