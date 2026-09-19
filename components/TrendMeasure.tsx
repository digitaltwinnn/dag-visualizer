"use client";
import { ChevronDown, ChevronUp } from "lucide-react";
import { METRIC_LABELS, stepMetric } from "@/src/data/trendSeries";
import type { TrendMetric } from "@/src/store/store";

// THE HISTORY VIEW'S MEASURE, AS ITS TITLE (user, 2026-09-19: "put the control underneath the bar,
// and give it a label/title (snapshots, continuity, fees etc)"). It first rode the front card's
// header as two bare chevrons, which was wrong twice: the measure is the WHOLE stack's — every card
// steps together — so hanging the control on one card said it belonged to that network; and two
// chevrons with no word beside them step through a list the reader cannot see.
//
// So it sits where a view's title sits: centred under the command bar, directly below the view
// switch that named the view. The word IS the title — SNAPSHOTS, FEES, CONTINUITY — and the
// chevrons either side of it are the up/down axis the arrow keys and the touch swipe already drive.
// Up/down rather than left/right on purpose, even in a horizontal strip: left/right in this view is
// TIME (the timeline below), and a second horizontal stepper would read as a second time control.
//
// An exhausted direction goes INACTIVE rather than vanishing (the rail plank's rule) — a chevron
// that disappears re-centres the title at each end of the list. The title's slot is a fixed width
// for the same reason: six words of different lengths would otherwise walk the chevrons about.
//
// A SETTING, not a selection: `onStep` writes `trendMetric` directly, exactly as the rail's picker
// does (`selectionBoundary` names it out of scope). The rail's picker stays — it is the map of all
// six measures; this is the title that says which one you are on, with a way to the next.

export default function TrendMeasure({
  metric,
  onStep,
}: {
  metric: TrendMetric;
  onStep: (dir: -1 | 1) => void;
}) {
  const prev = stepMetric(metric, -1);
  const next = stepMetric(metric, 1);
  const chevron =
    "grid size-6 place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-wash-hover " +
    "disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-muted-foreground " +
    "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]";
  return (
    <div
      role="group"
      aria-label="Measure"
      // Under the bar: `--rail-top` is where the rails begin, and `--topbar-extra` is how far the
      // bar has grown downward (its filter / pulse strip) — the same two tokens the rails ride, so
      // the title moves with them. Centred on the VIEWPORT, like the view switch above it.
      style={{ top: "calc(var(--rail-top) + var(--topbar-extra))" }}
      className="absolute left-1/2 -translate-x-1/2 pointer-events-auto inline-flex items-center gap-1 rounded-lg border border-border bg-wash-faint p-[3px]"
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
        className="min-w-[12ch] px-1 text-center text-micro font-bold tracking-caps uppercase text-foreground select-none"
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
