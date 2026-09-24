import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-10 max-w-3xl">
      {eyebrow && <p className="mb-2 text-sm font-medium text-accent">{eyebrow}</p>}
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
      {children && <div className="mt-4 text-base leading-relaxed text-muted">{children}</div>}
    </header>
  );
}

export function Section({ id, title, lead, children }: { id?: string; title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="mb-14 scroll-mt-20">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {lead && <div className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">{lead}</div>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-border bg-surface p-4 sm:p-5 ${className}`}>{children}</div>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <Card>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

/** Shown where a figure needs the sample videos, which only the export script can read. */
export function Pending({ what, children }: { what: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface-2/50 p-5 text-sm text-muted">
      <p className="font-medium text-text">{what} will appear here once the sample videos are processed.</p>
      <p className="mt-2">
        Run{" "}
        <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-text">
          python tools/export_site_data.py --videos samples
        </code>{" "}
        from the repository root, then rebuild the site.
      </p>
      {children}
    </div>
  );
}

export function Badge({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs font-medium"
      style={color ? { borderColor: color, color } : undefined}
    >
      {children}
    </span>
  );
}

export function Swatch({ color }: { color: string }) {
  return <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />;
}
