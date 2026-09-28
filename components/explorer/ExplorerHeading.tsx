"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SELECTED_ROW } from "@/components/selection";
import { cn } from "@/lib/utils";

// THE EXPLORER'S HEADING ROW (design session 2026-09-26, `docs/superpowers/design/2026-09-26-
// explorer-card/measure-control.html` A and `level-measures.html` A). A hairline over the list,
// carrying the view's one SETTING (Same scale, Live/Pinned) and, right-aligned, THE FIGURE
// COLUMN'S HEADING — which is a control exactly when the level on screen has more than one honest
// figure to show:
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
}

export interface MeasureControl {
  options: readonly MeasureOption[];
  value: string;
  onPick: (id: string) => void;
}

export default function ExplorerHeading({
  setting,
  measure,
  className,
}: {
  /** The view's one setting, left of the heading (History's Same scale, Snapshots' Live). */
  setting?: ReactNode;
  /** The level's measures, or null for a level whose rows carry no figure. */
  measure: MeasureControl | null;
  className?: string;
}) {
  const current = measure?.options.find((o) => o.id === measure.value) ?? measure?.options[0];
  return (
    // `items-end`: a wrapped hint on the left (2026-09-28) leaves the measure control on its LAST
    // line, where the eye finishes the sentence and meets the list's figure column below.
    <div className={cn("flex items-end justify-end gap-2.5 min-h-[22px] border-b border-border pb-[5px] mb-1.5", className)}>
      {setting}
      {measure && current && measure.options.length > 1 ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            // The same padded box as the setting beside it (the LIVE/PINNED pill), so the two ends
            // of the heading row are one control species; the open state takes the wash.
            className={cn(
              "inline-flex items-center gap-1 rounded-sm px-1.5 -mr-1.5 py-[3px] text-micro tracking-caps uppercase text-foreground select-none cursor-pointer",
              "hover:bg-wash-hover data-[state=open]:bg-wash-soft",
              "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]",
            )}
            title="What this list's figure is — pick another measure"
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
                  {o.unit && <span className="text-micro text-muted-foreground">{o.unit}</span>}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : measure && current ? (
        <span className="text-micro tracking-caps uppercase text-muted-foreground select-none">{current.label}</span>
      ) : null}
    </div>
  );
}
