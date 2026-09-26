"use client";
import { ChevronDown, ChevronUp } from "lucide-react";
import { METRIC_LABELS, stepMetric } from "@/src/data/trendSeries";
import type { TrendMetric } from "@/src/store/store";
import { cn } from "@/lib/utils";

// THE HISTORY VIEW'S MEASURE STEPPER — `∧ SNAPSHOTS ∨`, the Layers card's control (user,
// 2026-09-26: "move the control now at the top of the view and use it to replace the control that
// sits in the explore card; control left, 'same scale' toggle right"). It has moved twice: it first
// rode the front card's header as two bare chevrons, which was wrong twice over — the measure is
// the WHOLE stack's (every card steps together), so hanging it on one card said it belonged to that
// network, and two chevrons with no word beside them step through a list the reader cannot see.
// Then it was the view's TITLE, centred under the command bar (2026-09-19) — where it collided with
// the rear card's header plate and duplicated the six-pill picker in the rail. Now it IS the rail's
// control: the word says which measure the stack is on, the chevrons are the way to the next, and
// the picker's six pills are gone (the Trends DOCUMENT never picked — it lays every measure out as
// a section; a page shows the map, a card steps through it).
//
// Up/down rather than left/right on purpose, even in a horizontal strip: left/right in this view is
// TIME (the timeline below), and a second horizontal stepper would read as a second time control.
// `↑`/`↓` from inside a card step the same axis.
//
// An exhausted direction goes INACTIVE rather than vanishing (the rail plank's rule) — a chevron
// that disappears would walk the word about at each end of the list. The word is content-sized
// (it was a fixed 12ch slot as the view's title): in the card's row the left chevron is anchored
// to the card's edge and only the right one moves with the word, and a fixed slot wide enough for
// CONTINUITY cost the row the room the switch beside it needs. Untracked caps for the same reason —
// the row is measured to the pixel.
//
// A SETTING, not a selection: `onStep` writes `trendMetric` directly (`selectionBoundary` names it
// out of scope). POSITIONLESS — the caller lays it out; it carries no placement of its own.

export default function TrendMeasure({
  metric,
  onStep,
  className,
}: {
  metric: TrendMetric;
  onStep: (dir: -1 | 1) => void;
  className?: string;
}) {
  const prev = stepMetric(metric, -1);
  const next = stepMetric(metric, 1);
  // size-5, not the plank's size-6: the stepper shares one 247px row with the `Same scale` switch
  // (measured 2026-09-26), and the row holds both only at this size. Keyboard and touch keep the
  // whole group as a target.
  const chevron =
    "grid size-5 place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-wash-hover " +
    "disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-muted-foreground " +
    "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]";
  return (
    <div
      role="group"
      aria-label="Measure"
      // The picker group's own shape (`PICKER_GROUP`'s hairline + wash), so it sits in the card
      // as the pills it replaced did.
      className={cn("inline-flex items-center gap-0.5 rounded-lg border border-border bg-wash-faint p-[3px]", className)}
    >
      <button
        type="button"
        disabled={!prev}
        onClick={() => onStep(-1)}
        title={prev ? `Show ${METRIC_LABELS[prev]}` : "This is the first measure"}
        aria-label={prev ? `Show ${METRIC_LABELS[prev]}` : "No previous measure"}
        className={chevron}
      >
        <ChevronUp aria-hidden className="size-3.5" />
      </button>
      {/* `aria-live`: the word is the control's answer to a press, and a press made from the
          keyboard or by swipe happens somewhere else entirely. */}
      <span
        aria-live="polite"
        className="px-0.5 text-center text-micro font-bold uppercase text-foreground select-none whitespace-nowrap"
      >
        {METRIC_LABELS[metric]}
      </span>
      <button
        type="button"
        disabled={!next}
        onClick={() => onStep(1)}
        title={next ? `Show ${METRIC_LABELS[next]}` : "This is the last measure"}
        aria-label={next ? `Show ${METRIC_LABELS[next]}` : "No next measure"}
        className={chevron}
      >
        <ChevronDown aria-hidden className="size-3.5" />
      </button>
    </div>
  );
}
