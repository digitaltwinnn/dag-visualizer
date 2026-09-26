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
    <div className={cn("flex items-center justify-end gap-2.5 min-h-[22px] border-b border-border pb-[5px] mb-1.5", className)}>
      {setting}
      {measure && current && measure.options.length > 1 ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "inline-flex items-center gap-1 rounded-sm px-1 -mx-1 text-micro tracking-caps uppercase text-foreground select-none cursor-pointer",
              "hover:bg-wash-hover data-[state=open]:bg-wash-hover",
              "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]",
            )}
            title="What this list's figure is — pick another measure"
            aria-label={`Measure: ${current.label}. Pick another`}
          >
            {current.label}
            <ChevronDown aria-hidden className="size-3 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={4} className="min-w-[10rem]">
            <DropdownMenuRadioGroup value={measure.value} onValueChange={measure.onPick}>
              {measure.options.map((o) => (
                <DropdownMenuRadioItem key={o.id} value={o.id} className="flex items-center justify-between gap-4 text-label">
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
