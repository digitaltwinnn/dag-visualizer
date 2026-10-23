"use client";

import { ChevronDown, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SELECTED_ROW } from "@/components/selection";
import { cn } from "@/lib/utils";

// THE EXPLORER'S HEADING ROW AND THE MEASURE CONTROL (design session 2026-09-26, `docs/superpowers/
// design/2026-09-26-explorer-card/measure-control.html` A and `level-measures.html` A; split
// 2026-10-02, `docs/superpowers/design/2026-10-02-heading-pin-foot` A2). A hairline over the list
// carrying the hint and the view's one SETTING (Same scale); THE FIGURE COLUMN'S HEADING now sits
// in the card head's aside slot — it is a control exactly when the level on screen has more than
// one honest figure to show:
//
//   · several measures → the caps word with a caret; click opens a radio list of THIS LEVEL's
//     measures with their units (the reader sees the whole list before choosing — the stepper it
//     replaced walked a list nobody could see);
//   · one measure     → the same word, muted, no caret: a label, not a control;
//   · no figure       → nothing; the hairline alone.
//
// REGULAR WEIGHT in every state (user: "normal"): the control differs from the label by full ink
// and the caret, never by weight — the card keeps one rule for bold (the title). The heading is
// computed from the rows beneath it, so it can never name a figure they don't carry: that was the
// whole failure of one stepper over a tree of levels.

export interface MeasureOption {
  id: string;
  label: string;
  /** The figure's unit, shown muted beside the label in the list ("DAG", "count", "KB"). */
  unit?: string;
  /** The measure's mark, drawn on its tile (`tiles` presentation only). */
  icon?: LucideIcon;
}

export interface MeasureControl {
  options: readonly MeasureOption[];
  value: string;
  onPick: (id: string) => void;
  /** TILES, not a menu (user, 2026-10-23, History): every measure named at once in a grid under
   *  the head, the one on screen washed — the card SAYS it has six readings instead of hiding
   *  them behind a caret, and the control leaves the title row's aside, where it stacked 6px
   *  under the − toggle. A level with two or three honest figures keeps the menu. */
  tiles?: true;
}

/** THE MEASURE TILES — design A of the explorer-measure mock (user, 2026-10-23: the dropdown
 *  "sits so close to the − button" and "doesn't clearly say … there is a lot of different data
 *  here to visualize"). A 3-column grid of glyph + word, one tile per measure, the current one
 *  in the app's committed-selection language (the view switch's on-state, so the two read as one
 *  species of radio). It is the list's column heading made visible, so it sits in the BODY under
 *  the head rule, first — the figure beneath every row is the tile that is lit. */
export function MeasureTiles({ measure }: { measure: MeasureControl }) {
  return (
    <ToggleGroup
      type="single"
      value={measure.value}
      aria-label="Measure"
      onValueChange={(v) => { if (v) measure.onPick(v); }}
      className="grid w-auto grid-cols-3 gap-1 mb-2"
    >
      {measure.options.map((o) => {
        const Icon = o.icon;
        return (
          <ToggleGroupItem
            key={o.id}
            value={o.id}
            aria-label={o.unit && o.unit.toLowerCase() !== o.label.toLowerCase() ? `${o.label}, ${o.unit}` : o.label}
            className={cn(
              "group flex min-w-0 items-center justify-start gap-1.5 h-7 px-1.5 rounded-btn! text-label",
              "text-muted-foreground bg-transparent border-0",
              "hover:text-foreground hover:bg-wash-soft",
              "data-[state=on]:text-foreground data-[state=on]:bg-[var(--sel-bg)]",
              "data-[state=on]:shadow-[inset_0_0_0_1px_var(--sel-border)]",
              "touch:min-h-10",
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

/** THE MEASURE CONTROL — the figure column's heading, rendered in the card HEAD's aside slot
 *  (A2, user 2026-10-02): right of the title, where a card-level state sits, so the hint beneath
 *  runs the full width. Several measures → the caps word with a caret opening a radio list of THIS
 *  LEVEL's measures with their units; one measure → the same word, muted, no caret; no figure →
 *  nothing. */
export function MeasureMenu({ measure }: { measure: MeasureControl | null }) {
  const current = measure?.options.find((o) => o.id === measure.value) ?? measure?.options[0];
  if (!measure || !current) return null;
  if (measure.options.length <= 1) {
    return <span className="text-label tracking-caps uppercase text-muted-foreground select-none">{current.label}</span>;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        // A padded box like the setting pill's, so the two are one control species; the open
        // state takes the wash.
        className={cn(
          "inline-flex items-center gap-1 rounded-sm px-1.5 -mr-1.5 py-[3px] min-h-6 touch:min-h-10 text-label tracking-caps uppercase text-foreground select-none cursor-pointer",
          "hover:bg-wash-hover data-[state=open]:bg-wash-soft",
          "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]",
        )}
        aria-label={`Measure: ${current.label}. Pick another`}
      >
        {current.label}
        <ChevronDown aria-hidden className="size-3 text-muted-foreground" />
      </DropdownMenuTrigger>
      {/* The Settings menu's own popover recipe (`topbar/SettingsMenu.tsx`): rows at
          `text-label`, muted until hovered, and the CURRENT one in the app's one committed-
          selection language (`SELECTED_ROW`) rather than shadcn's radio bullet — the bullet
          and its 32px gutter were the stock look the user caught (2026-09-26). */}
      <DropdownMenuContent align="end" sideOffset={6} className="min-w-[10.5rem] p-1.5">
        <DropdownMenuRadioGroup value={measure.value} onValueChange={measure.onPick}>
          {measure.options.map((o) => (
            <DropdownMenuRadioItem
              key={o.id}
              value={o.id}
              className={cn(
                "flex items-center justify-between gap-4 rounded-md px-2.5 py-1.5 pl-2.5 text-label cursor-pointer",
                "text-muted-foreground focus:text-foreground focus:bg-wash-soft [&>span:first-child]:hidden",
                o.id === measure.value && SELECTED_ROW,
              )}
            >
              <span>{o.label}</span>
              {/* A unit that only repeats the label is left out ("Nodes", never "Nodes nodes"). */}
              {o.unit && o.unit.toLowerCase() !== o.label.toLowerCase() && <span className="text-label text-muted-foreground">{o.unit}</span>}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
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
