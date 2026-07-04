"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// The ONE HUD card header — every rail card leads with this shared grammar so the whole HUD
// reads as one control surface:
//   • an uppercase role EYEBROW (plain "SELECTED METAGRAPH", a breadcrumb "NODE ‹ DOR", or a
//     view tag "HYPERGRAPH · ABOUT"),
//   • an optional TITLE that rolls in on a subject change (pass `titleKey` to key the remount —
//     the same upward `roll-in` the Odometer uses; omit it and the title is static), and
//   • an optional right ACTION — the +/− collapse toggle (rail tool cards) or the × close
//     (inspector/context cards), each keeping its own title/aria semantics.
//
// Two layouts, selected by `panel`:
//   • panel   — the full flex-row head with a bottom rule + padding; the title carries the cyan
//               identity bullet (Learn / GeoExplore / About / Ledger).
//   • eyebrow — a bare block eyebrow; the card BODY renders its own rich subject header (the
//               inspector/context cards), so no title is drawn here. The × (when given) is placed
//               absolutely on the card — its nearest positioned ancestor is the `.ig-panel` card.
const EYEBROW = "text-[8.5px] font-bold tracking-[0.1em] uppercase leading-none";

// The right-rail card frame: the glass surface, a positioned ancestor for CardHead's absolute ×,
// re-enabled pointer events (`#rightcol` is pointer-events:none so gaps click through to the
// scene), and its identity spine SUPPRESSED — the right rail's identity cue is RailThread's spine
// in the margin, not a per-card one. Re-homes the old `#rightcol > .panel` rule (12-panel-system).
export const RIGHT_CARD = "ig-panel relative w-auto pointer-events-auto [--spine:transparent]";

export default function CardHead({
  eyebrow,
  title,
  titleKey,
  panel = false,
  caption,
  collapsed,
  onToggle,
  onClose,
  closeTitle = "Close",
  eyebrowMuted = false,
}: {
  eyebrow?: ReactNode;
  title?: ReactNode;
  titleKey?: string | number;
  panel?: boolean;
  caption?: ReactNode;
  collapsed?: boolean;
  onToggle?: () => void;
  onClose?: () => void;
  closeTitle?: string;
  // NO SIGNAL: the feed behind this card is unreachable — dim the eyebrow to muted (was
  // `.no-signal .panel-eyebrow`/`.insp-eyebrow`, restored here since the frame owns the eyebrow
  // and the card body's own `.no-signal` wrapper no longer sits as its ancestor).
  eyebrowMuted?: boolean;
}) {
  const rolled =
    titleKey != null ? (
      <span key={titleKey} className="roll-in">
        {title}
      </span>
    ) : (
      title
    );
  const eyebrowClass = cn(EYEBROW, eyebrowMuted ? "text-muted-foreground" : "text-accent");

  if (panel) {
    return (
      <div className="flex items-start justify-between gap-2 py-[var(--panel-pad-y)] px-[var(--panel-pad-x)] border-b border-border">
        <div className="flex flex-col gap-[3px] min-w-0">
          {eyebrow && <span className={cn("block", eyebrowClass)}>{eyebrow}</span>}
          <h2 className="m-0 text-[15px] font-semibold leading-[1.2] inline-flex items-center gap-2 min-w-0 before:content-[''] before:flex-none before:w-[9px] before:h-[9px] before:rounded-full before:bg-[var(--filter-accent,var(--accent))]">
            {rolled}
          </h2>
        </div>
        <div className="flex items-center gap-1.5 flex-none pt-px">
          {caption != null && (
            <span className="text-[10.5px] text-muted-foreground text-right tabular-nums">{caption}</span>
          )}
          {onToggle && (
            <button
              className="bg-transparent border-none text-muted-foreground text-[18px] leading-none cursor-pointer w-5 h-[18px] p-0 hover:text-foreground"
              title={collapsed ? "Expand" : "Collapse"}
              aria-expanded={!collapsed}
              onClick={onToggle}
            >
              {collapsed ? "+" : "–"}
            </button>
          )}
        </div>
      </div>
    );
  }

  // Eyebrow layout — the bare block eyebrow; the body owns the subject header below it.
  return (
    <>
      {onClose && (
        <button
          title={closeTitle}
          onClick={onClose}
          className="absolute top-[10px] right-[10px] bg-transparent border-none text-muted-foreground text-[22px] leading-none cursor-pointer py-0.5 px-2"
        >
          ×
        </button>
      )}
      {eyebrow && <span className={cn("block mb-2 pr-[22px]", eyebrowClass)}>{eyebrow}</span>}
      {title != null && rolled}
    </>
  );
}
