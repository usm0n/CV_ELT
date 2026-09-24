"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { NAV } from "@/lib/site";

import { ThemeToggle } from "./ThemeToggle";

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight" onClick={() => setOpen(false)}>
          <span aria-hidden className="flex flex-col gap-[3px] rounded-md bg-text px-[5px] py-[4px]">
            <span className="h-[5px] w-[5px] rounded-full bg-[#e03131]" />
            <span className="h-[5px] w-[5px] rounded-full bg-[#f59f00]" />
            <span className="h-[5px] w-[5px] rounded-full bg-[#37b24d]" />
          </span>
          Junction Watch
        </Link>
        <nav className="ml-auto hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                active(n.href) ? "bg-surface-2 font-medium text-text" : "text-muted hover:text-text"
              } ${n.href === "/demo/" ? "text-accent" : ""}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1 lg:ml-2">
          <ThemeToggle />
          <button
            type="button"
            className="rounded-md p-2 text-muted hover:text-text lg:hidden"
            aria-label="Menu"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
              {open ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-border bg-bg px-4 py-2 lg:hidden" aria-label="Main">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              className={`block rounded-md px-3 py-2.5 text-sm ${active(n.href) ? "bg-surface-2 font-medium" : "text-muted"}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
