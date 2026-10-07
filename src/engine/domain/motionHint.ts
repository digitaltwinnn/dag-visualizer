// `MotionCause` is the store's type — it lives beside the channel it is written to, and a type
// import from here back into the store would close a cycle (`src/data/noImportCycles.test.ts`).
import type { Mode, MotionCause, TrendMetric } from "@/src/store/store";
import type { FocusLevel } from "./focusLadder";
import type { ZoomId } from "@/src/data/trendWindow";

// THE MOTION HINT'S COPY — what the scene is doing while it moves, in one sentence (user,
// 2026-09-26: "during the time the trend cards re-order, give a subtle hint somewhere on screen to
// indicate that this is happening … a structural item when the scene does any animation: applying
// a filter, clicking a row on the explorer, dragging the scene, clicking a selectable item in the
// 3D scene, navigating between scenes (teardown → build), selecting a range in the trends view").
//
// Two channels feed it, and neither is this module's: WHY the scene moves is `store.motionCause`,
// stamped once per gesture by the writers that already own the gesture — the click executor for
// every selection (rule 2's one write path), the store's own setters for the settings that move
// the scene (view, window, range, measure, page), the Engine for a drag — and WHETHER it is moving
// is `store.sceneMoving`, derived by the Engine each frame from the structures that already drive
// motion: the view transition's phase, the camera director's flight, the controls' drag, the trend
// stack's ease. This module only turns a cause into words. Names are resolved by the caller
// through `HintNames` so the vocabulary stays where it lives (`components/views.ts` for the views,
// the catalog for the networks) and this file imports nothing but types.
//
// A cause is DATA about the gesture, never copy: a writer says "focus, this network", and the
// words are decided here, once, so a re-wording touches one file and one test.

export type { MotionCause };

/** The names a sentence needs, resolved by the caller. */
export interface HintNames {
  view(mode: Mode): string;
  network(id: string): string;
  country(cc: string): string;
  window(id: ZoomId): string;
  measure(id: TrendMetric): string;
  /** The subject a ladder rung frames, named — the committed network, the boxed node, the
   *  drilled country — as the caller reads it off the selection; a bare level name at worst. */
  rung(level: FocusLevel): string;
}

/** A date for a range, in the reader's own day like every stamp the trends surfaces show
 *  (2026-10-07 — it was UTC). */
function day(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * The sentence for `cause` in `mode`, or null where the motion needs no words (a drag is the
 * reader's own hand). Present continuous, one clause, no full stop — it is a status line, not prose.
 *
 * A VIEW switch is two sentences, one per transition phase (user, 2026-09-26): "Leaving A" while
 * the OUT phase tears the from-view down, "Entering B" while the IN phase builds the destination.
 * `phase` is the Engine's `motionPhase`; with none running (the boot seeds the destination over
 * the store's default and flies straight in) only "Entering B" is ever said — "leaving
 * Hypergraph" on a cold start into History would be false.
 */
export function motionHint(cause: MotionCause, mode: Mode, names: HintNames, phase: "out" | "in" | null = null): string | null {
  switch (cause.kind) {
    case "view":
      return phase === "out" ? `Leaving ${names.view(cause.from)}` : `Entering ${names.view(cause.to)}`;
    case "filter":
      // The top bar's own word (user, 2026-09-26: "'narrowing' is 'filtering'?" — it is), in
      // idiomatic form: "filtering to X" is UI shorthand, not English, so the line names the
      // control and its new state.
      return cause.id === "all" ? "Filter cleared" : `Filter set to ${names.network(cause.id)}`;
    case "focus":
      // The re-deal: the focused card takes first place and the cards ahead of it slide back.
      return cause.id === null ? "Returning the stack to its order" : `Bringing ${names.network(cause.id)} to the front`;
    case "node":
      // A node pick's title is its network and its sub its place: "a Dor Technologies node in
      // Frankfurt, Germany". A node has no name of its own worth saying; where it belongs does.
      // A RELEASE says nothing here: the executor restamps it as the rung the camera lands on
      // (`landingCause`), so a deselect reads "Framing Dor Technologies" — the select's own words
      // — never "stepping back" (user, 2026-09-26).
      return cause.title === null ? null : `Framing a ${cause.title} node${cause.sub ? ` in ${cause.sub}` : ""}`;
    case "snapshot":
      return cause.ordinal === null ? "Back to the live snapshot" : `Framing snapshot ${cause.ordinal.toLocaleString()}`;
    case "metaSnap":
      return cause.metaId === null
        ? "Back to the global snapshot"
        : `Framing ${names.network(cause.metaId)}'s snapshot${cause.ordinal != null ? ` ${cause.ordinal.toLocaleString()}` : ""}`;
    case "country":
      return cause.cc === null ? "Back to the whole globe" : `Drilling into ${names.country(cause.cc)}`;
    case "cohort":
      return cause.on ? "Framing the selected nodes" : null;
    case "composition":
      return cause.on ? "Framing the selection" : null;
    case "range":
      return cause.span === null
        ? "Showing the whole window"
        : `Zooming the history to ${day(cause.span.fromMs)} – ${day(cause.span.toMs)}`;
    case "window":
      return cause.id === "all" ? "Showing the whole measured history" : `Showing the last ${names.window(cause.id)}`;
    case "measure":
      // A measure step re-ranks the stack busiest-first by the new measure.
      return mode === "trend" ? `Reordering by ${names.measure(cause.id).toLowerCase()}, busiest network first` : null;
    case "page":
      return "Paging the stack";
    case "rung":
      return `Framing ${names.rung(cause.level)}`;
    case "orbit":
      return null;
  }
}
