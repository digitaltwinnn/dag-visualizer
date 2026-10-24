"use client";

import type { ReactNode } from "react";

import { measureIcon } from "@/components/icons";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

// THE EXPLORER'S HEADING ROW AND THE MEASURE CONTROL (design session 2026-09-26, `docs/superpowers/
// design/2026-09-26-explorer-card/measure-control.html` A and `level-measures.html` A; split
// 2026-10-02, `docs/superpowers/design/2026-10-02-heading-pin-foot` A2; TILES since 2026-10-23,
// design B of the brainstorm's `explorer-sections.html`). THE FIGURE COLUMN'S HEADING is a
// control exactly when the level on screen has more than one honest figure to show:
//
//   · several measures → TILES: every measure named at once, glyph and word, in a grid on a plate
//     band under the head — the card SAYS it has four or six readings instead of hiding them
//     behind a caret (user, 2026-10-23: the dropdown "doesn't actually clearly say to the user
//     there is a lot of different data here to visualize", and it "sits so close to the −
//     button" in the title row's aside). The lit tile is the figure beneath every row;
//   · one measure     → the caps word, muted, in the head's aside: a label, not a control;
//   · no figure       → nothing.
//
// The heading is computed from the rows beneath it, so it can never name a figure they don't
// carry: that was the whole failure of one stepper over a tree of levels. The dropdown it
// replaced (2026-09-26 → 2026-10-23) walked the same list behind a caret.

export interface MeasureOption {
  id: string;
  label: string;
  /** The figure's unit, read to assistive tech with the tile's name ("DAG", "count", "KB"). */
  unit?: string;
}

export interface MeasureControl {
  options: readonly MeasureOption[];
  value: string;
  onPick: (id: string) => void;
  /** Measures the level on screen cannot show — drawn INACTIVE, never dropped (user, 2026-10-23:
   *  "instead of removing the control band when there is nothing to show, can we just make them
   *  inactive? I don't like it just disappears" — the plank's rule, an exhausted control dims).
   *  The band always shows the explorer's whole set; a node level shows every tile inactive. */
  inactive?: ReadonlySet<string>;
}

/** A single measure: the caps word, muted, in the head's aside — a label, not a control. */
export function MeasureLabel({ label }: { label: string }) {
  return <span className="text-label tracking-caps uppercase text-muted-foreground select-none">{label}</span>;
}

/** THE MEASURE TILES — a grid of glyph + word, one tile per measure, the current one in the
 *  app's committed-selection language (the view switch's on-state, so the two read as one species
 *  of radio). They ride the explorer's CONTROL BAND (`Explorer.tsx` draws it — the plate under
 *  the head that also holds the path), so this is the grid alone. Four measures sit two by two
 *  (a 65px tile cannot hold "Metagraphs" beside its mark); two, three and six take three columns. */
export function MeasureTiles({ measure }: { measure: MeasureControl }) {
  const n = measure.options.length;
  return (
    <ToggleGroup
      type="single"
      value={measure.value}
      aria-label="Measure"
      onValueChange={(v) => { if (v) measure.onPick(v); }}
      className={cn("grid w-auto gap-1 rounded-none", n === 4 ? "grid-cols-2" : "grid-cols-3")}
    >
      {measure.options.map((o) => {
        const Icon = measureIcon(o.id);
        return (
          <ToggleGroupItem
            key={o.id}
            value={o.id}
            aria-label={o.unit && o.unit.toLowerCase() !== o.label.toLowerCase() ? `${o.label}, ${o.unit}` : o.label}
            disabled={measure.inactive?.has(o.id)}
            className={cn(
              // `gap-1 px-1`: three columns of a 320px card give a tile ~61px of text beside its glyph at
              // 1.5/1.5, and "Metagraphs" (wide letters) clipped where "Continuity" fit — 6px back
              // seats every label the four measure modules declare (measured 2026-10-23).
              "group flex min-w-0 items-center justify-start gap-1 h-7 px-1 rounded-btn! text-label",
              // EVERY TILE IS A BOUNDED BUTTON (user, 2026-10-23: unlit, "they are just texts on the
              // same plane"): a hairline ring on each, the lit one's in the selection pair — the
              // band's plate is one surface, so a text-only tile had nothing to say it was pressable.
              // `!` on both rings (CSS trap 4): the toggle-group primitive's `data-[spacing=0]:shadow-none`
              // is class+attribute and outranked the plain ring; both important, the on-state's
              // variant wins by its own specificity.
              "text-muted-foreground bg-transparent border-0 shadow-[inset_0_0_0_1px_var(--border)]!",
              "hover:text-foreground hover:bg-wash-soft",
              "data-[state=on]:text-foreground data-[state=on]:bg-[var(--sel-bg)]",
              "data-[state=on]:shadow-[inset_0_0_0_1px_var(--sel-border)]!",
              "touch:min-h-10",
              // Inactive keeps its ring: a dimmed button, not dimmed text.
              "disabled:opacity-45 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-muted-foreground",
            )}
          >
            {Icon && <Icon aria-hidden className="size-3.5 flex-none group-data-[state=on]:text-primary" />}
            <span className="truncate">{o.label}</span>
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}

/** THE HEADING ROW over the list: the hint at full width — three of four views wrapped it to three
 *  lines beside the control (design review 2026-10-02) — and, right of it, the view's one SETTING
 *  (History's Same scale) when the level has one. The hairline alone otherwise. */
export default function ExplorerHeading({
  hint,
  setting,
  className,
}: {
  hint?: ReactNode | null;
  /** The view's one setting (History's Same scale). */
  setting?: ReactNode;
  className?: string;
}) {
  // NOTHING TO SAY, NO ROW (user, 2026-10-08): the list explorers moved their sentence into the
  // path plate as its placeholder, and an empty 22px row between two hairlines was what remained.
  if (hint == null && setting == null) return null;
  return (
    <div className={cn("flex items-end justify-between gap-2.5 min-h-[22px] border-b border-border pb-[5px] mb-1.5", className)}>
      {/* `flex-1`: the hint OWNS the row's width, so a hint that carries a right-hand indicator
          (History's span chip) can push it to the card's edge — content-sized, its own flex row
          had no room to spread. */}
      {hint != null && <p className="m-0 min-w-0 flex-1 text-label text-muted-foreground">{hint}</p>}
      {setting != null && <span className="ml-auto flex-none">{setting}</span>}
    </div>
  );
}
