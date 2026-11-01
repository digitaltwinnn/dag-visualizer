"use client";

import { NOTE_KIND_ICONS } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { NotableKind, NoteChangeKind } from "@/src/data/noteTypes";

/** A NOTABLE DAY'S MARK, ONE COIN EVERYWHERE (user, 2026-10-30, design option C of three in the
 *  brainstorming companion): the kind's glyph on a 16px coin, the mark the AI card's row leads
 *  with, the timeline draws on its baseline and a chart plane draws on its own. One shape, one
 *  size, so the band no longer reads large and the plane small, and the glyph says the kind
 *  wherever the mark stands. The coin wears the AI's whole sweep (`--ai-edge`, user 2026-11-01:
 *  "more AI style"), bright on dark and deep on paper, so the glyph is the ground's own colour on
 *  both. Its edge is a ground-coloured border, which keeps overlapping coins apart (never a ring
 *  or shadow: a plane must not re-raster, `trendStackBoundary`). Decoration: the caller says what
 *  the day is (the row's sr-only word, the diamond's aria-label). */
export default function NoteKindCoin({ kind, className }: { kind: NotableKind | NoteChangeKind; className?: string }) {
  const Mark = NOTE_KIND_ICONS[kind];
  return (
    <span aria-hidden className={cn("inline-grid size-4 rounded-full shrink-0 place-items-center border border-background text-background [background:var(--ai-edge)_padding-box]", className)}>
      <Mark className="size-2.5" strokeWidth={2.75} />
    </span>
  );
}
