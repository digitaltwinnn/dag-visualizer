"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// The ONE HUD card header — every rail card leads with this shared grammar so the whole HUD
// reads as one control surface:
//   • an uppercase role EYEBROW — one simple "Selected <subject>" label ("SELECTED NETWORK" /
//     "SELECTED NODE" / "SELECTED SNAPSHOT"; the ‹-parent breadcrumb grammar was retired, Task 13
//     follow-up) or a view tag ("HYPERGRAPH · ABOUT"),
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

// The right-rail card frame — the ONE definition of the inspector-rail Card composition. It is the
// className you hand to `<Card asChild className={RIGHT_CARD}>`: the Card baseline already supplies
// `ig-panel`, so this only carries the right-rail OVERRIDES on top of it —
//   • a positioned ancestor for CardHead's absolute × (`relative`), shrink-to-content width, and
//     re-enabled pointer events (`#rightcol` is pointer-events:none so gaps click through to the
//     scene);
//   • its identity spine SUPPRESSED (`--spine:transparent`) — the right rail's identity cue is
//     RailThread's spine in the margin, not a per-card one;
//   • the interior spacing restored to the ORIGINAL right-card look (was lost when 05-…css was
//     retired): a flat `18px` pad (overriding the Card baseline's `py-4 pl-5 pr-4`), `min-h-0`, and
//     `flex-none` so an overflowing rail scrolls instead of a card shrinking below its own content
//     and overlapping the card beneath it.
// Re-homes the old `#rightcol > .panel` + `#metapane, .rc-pane` rules (05-inspector / 12-panel).
// (`block` neutralises the Card baseline's `flex flex-col gap-4` so the card's children flow with
// their own margins — as the original block box did — rather than gaining a flex gap between the
// eyebrow and the body.)
export const RIGHT_CARD = "relative block w-auto pointer-events-auto [--spine:transparent] p-[18px] min-h-0 flex-none";

export default function CardHead({
  eyebrow,
  title,
  titleKey,
  panel = false,
  caption,
  collapsed,
  onToggle,
  onClose,
  closeTitle = "Clear selection",
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
  // One baseline close label — every dismissible card's × reads "Clear selection" (the default);
  // don't reintroduce per-card variants ("Close" / "Deselect").
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
            <Button
              variant="ghost"
              size="icon-xs"
              className="w-5 h-[18px] p-0 rounded-md text-[18px] leading-none cursor-pointer text-muted-foreground hover:bg-transparent hover:text-foreground dark:hover:bg-transparent"
              title={collapsed ? "Expand" : "Collapse"}
              aria-expanded={!collapsed}
              onClick={onToggle}
            >
              {collapsed ? "+" : "–"}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Eyebrow layout — the bare block eyebrow; the body owns the subject header below it.
  return (
    <>
      {onClose && (
        <Button
          variant="ghost"
          size="icon-xs"
          title={closeTitle}
          aria-label={closeTitle}
          onClick={onClose}
          className="absolute top-[10px] right-[10px] size-auto rounded-md py-0.5 px-2 text-[22px] leading-none cursor-pointer text-muted-foreground hover:bg-transparent hover:text-muted-foreground dark:hover:bg-transparent"
        >
          ×
        </Button>
      )}
      {eyebrow && <span className={cn("block mb-2 pr-[22px]", eyebrowClass)}>{eyebrow}</span>}
      {title != null && rolled}
    </>
  );
}
