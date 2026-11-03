"use client";

import { NOTE_KIND_ICONS } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { NotableKind, NoteChangeKind } from "@/src/data/noteTypes";

/** A NOTABLE DAY'S MARK, ONE COIN EVERYWHERE (user, 2026-10-30, design option C of three in the
 *  brainstorming companion): the kind's glyph on a 16px coin, the mark the AI card's row leads
 *  with, the timeline draws on its baseline and a chart plane draws on its own. One shape, one
 *  size, so the band no longer reads large and the plane small, and the glyph says the kind
 *  wherever the mark stands. Its outline is the AI's whole sweep, the card's own edge (`--ai-edge`,
 *  user 2026-11-01: as a full fill it was "a bit too much"), drawn as a border-box layer under an
 *  opaque face, which also keeps overlapping coins apart. No ring or shadow: a plane must not
 *  re-raster (`trendStackBoundary`). The glyph is the foreground ink. Decoration: the caller says
 *  what the day is (the row's sr-only word, the diamond's aria-label).
 *  ONE STEP UP IN A ROW (user, 2026-11-03: "the icon for each notable change in the row is too
 *  small"): a row is read, not glanced at beside a line, and its glyph at 10px did not say its kind.
 *  `row` is a 20px coin with a 12px glyph; the chart's and the band's marks keep the 16px. */
export default function NoteKindCoin({ kind, row = false, className }: { kind: NotableKind | NoteChangeKind; row?: boolean; className?: string }) {
  const Mark = NOTE_KIND_ICONS[kind];
  return (
    <span aria-hidden className={cn("inline-grid rounded-full shrink-0 place-items-center border border-transparent text-foreground [background:linear-gradient(var(--background),var(--background))_padding-box,var(--ai-edge)_border-box]", row ? "size-5" : "size-4", className)}>
      <Mark className={row ? "size-3" : "size-2.5"} strokeWidth={row ? 2.5 : 2.75} />
    </span>
  );
}
