"use client";

import { X } from "lucide-react";

import { cn } from "@/lib/utils";

// THE HEAD'S SCOPE MARK: when a network is committed, the explorer's title line carries its TICKER
// in its hue — "DOR", "DED" — the same mark the dossier's head aside wears (user, 2026-09-26:
// "instead of a colored pill use the ticker"; the design session's 1b had settled on a bare hue
// dot, and the dot read as a pill among the path's pills). The top bar already names the network in
// full and the scene is tinted in it, so a ticker is the whole statement. The × that releases the
// filter appears beside it on hover (always on touch, where there is no hover), and goes through
// whatever release the caller wires — the one executor, never a setter.

export default function ScopeMark({
  hue,
  ticker,
  label,
  onRelease,
  className,
}: {
  hue: string;
  /** The committed network's ticker — the mark itself. */
  ticker: string;
  /** Its full name — the accessible name of the release. */
  label: string;
  onRelease: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onRelease}
      title={`Scoped to ${label} — click to show every network`}
      aria-label={`Scoped to ${label}. Clear the filter`}
      className={cn(
        "group/scope inline-flex items-center gap-1 -mr-1 px-1 py-0.5 rounded-sm cursor-pointer text-micro tracking-caps uppercase",
        "hover:bg-wash-hover focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]",
        className,
      )}
      style={{ color: hue }}
    >
      <span aria-hidden>{ticker}</span>
      <X
        aria-hidden
        className="size-3 opacity-0 transition-opacity duration-150 group-hover/scope:opacity-100 group-focus-visible/scope:opacity-100 [@media(hover:none)]:opacity-100"
      />
    </button>
  );
}
