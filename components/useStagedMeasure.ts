"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { METRIC_ORDER, holdOrder } from "@/src/data/trendSeries";
import type { TrendMetric } from "@/src/store/store";

// A MEASURE CHANGE IN THE HISTORY STACK IS TWO MOTIONS, AND THEY TAKE TURNS (user, 2026-09-19: "the
// animation is not smooth, perhaps also split it into two parts; load the new chart (smoothly) and
// then re-order").
//
// The first cut remounted five recharts plots with an enter animation in the same beat that the
// stack re-ranked, so three things happened at once: the heaviest render in the view, an animation
// whose first frames were that render's dropped frames, and five cards flying to new slots while
// their plots were still arriving. It read as a stutter because it was one.
//
// The measure the CARDS show therefore lags the measure the reader picked, through four beats:
//
//   OUT      the old plots fade and slide away. Nothing re-renders — it is a CSS transition on
//            opacity and transform, so the compositor runs it however busy the main thread is.
//   SWAP     the shown measure changes WHILE THE PLOTS ARE INVISIBLE. This is the expensive render,
//            and a hitch nobody can see is not a hitch.
//   IN       `pre` parks the new plots at their entry offset with transitions off; two frames
//            later `idle` lets them ease home. Cards have not moved yet.
//   REORDER  only once the plots have landed does the stack release the order it was HOLDING
//            (`holdOrder`), and the projector eases each card to its new slot.
//
// The control that stepped the measure shows the PICKED measure at once — a control must answer
// the press that drove it — and the cards follow about an eye-blink later.
//
// ⚠️ A step taken MID-SEQUENCE retargets, it never queues: a reader holding ↓ wants the last
// measure they landed on, not a replay of every one they passed. `out` simply restarts its clock
// with the newer target, and a step that arrives after the swap starts a fresh `out` from wherever
// the plots are.
//
// REDUCED MOTION skips the sequence entirely: with transitions off, `out` would be a 140ms blank
// — a blink, which is the opposite of what that setting asks for. The measure and the order change
// together, at once.

/** How long the old plots take to leave. Short: the reader has already decided, and the exit is
 *  only there to cover the swap. */
const OUT_MS = 140;
/** How long the new plots take to arrive — must match the `idle` transition in `ROLL_CLASS`. */
const IN_MS = 320;
/** A beat between the plots landing and the cards moving, so the two read as two. */
const BEAT_MS = 90;

export type RollPhase = "idle" | "out" | "pre";

/** The plot wrapper's classes, keyed off the stack root's `data-roll` / `data-dir` (the root is the
 *  `group/stack`). Arbitrary-PROPERTY transitions on purpose: two `transition-*` utilities in one
 *  string are a twMerge group (the later silently drops the earlier), and the comma'd arbitrary
 *  VALUE form is the DocLayer compile trap — see components/CLAUDE.md. The offsets ride two CSS
 *  variables the root sets from the direction, so "next" rises and "prev" drops with one recipe. */
export const ROLL_CLASS =
  "[transition:opacity_320ms_var(--ease-roll),transform_320ms_var(--ease-roll)] " +
  "group-data-[roll=out]/stack:[transition:opacity_140ms_ease-in,transform_140ms_ease-in] " +
  "group-data-[roll=out]/stack:opacity-0 group-data-[roll=out]/stack:[transform:translateY(var(--roll-out-y))] " +
  "group-data-[roll=pre]/stack:[transition:none] " +
  "group-data-[roll=pre]/stack:opacity-0 group-data-[roll=pre]/stack:[transform:translateY(var(--roll-in-y))] " +
  "motion-reduce:![transition:none]";

const reducedMotion = (): boolean =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function useStagedMeasure(metric: TrendMetric) {
  /** The measure the CARDS show — lags `metric` by the `out` beat. */
  const [shown, setShown] = useState(metric);
  const [phase, setPhase] = useState<RollPhase>("idle");
  const [dir, setDir] = useState<"next" | "prev">("next");
  /** False from the moment a change starts until the new plots have landed: the order is HELD. */
  const [settled, setSettled] = useState(true);

  // OUT → SWAP. Re-running on a newer `metric` IS the retarget: the cleanup clears the old timer.
  useEffect(() => {
    if (metric === shown) {
      // Stepped back onto the measure still on the cards, mid-exit: there is nothing to swap, so
      // the plots simply return.
      setPhase((p) => (p === "out" ? "idle" : p));
      return;
    }
    if (reducedMotion()) {
      setShown(metric);
      setPhase("idle");
      setSettled(true);
      return;
    }
    setDir(METRIC_ORDER.indexOf(metric) >= METRIC_ORDER.indexOf(shown) ? "next" : "prev");
    setSettled(false);
    setPhase("out");
    const t = setTimeout(() => {
      setShown(metric);
      setPhase("pre");
    }, OUT_MS);
    return () => clearTimeout(t);
  }, [metric, shown]);

  // PRE → IDLE. Two frames: one for the browser to COMMIT the parked, transition-less state (flip
  // it in the same frame and there is no "from" for the transition to run from), one to release it.
  useEffect(() => {
    if (phase !== "pre") return;
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setPhase("idle"));
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [phase]);

  // IN → REORDER. Only while the plots are on their way home and nothing newer has arrived.
  useEffect(() => {
    if (phase !== "idle" || settled || metric !== shown) return;
    const t = setTimeout(() => setSettled(true), IN_MS + BEAT_MS);
    return () => clearTimeout(t);
  }, [phase, settled, metric, shown]);

  return { shown, phase, dir, settled };
}

/** The order the stack DISPLAYS: the ranking itself once settled, the held order while a measure
 *  change is in flight. Derived during render from a ref of the last displayed order, never from an
 *  effect — an effect would hand the projector one frame of the NEW order before the hold took. */
export function useHeldOrder(ranked: readonly string[], settled: boolean): readonly string[] {
  const last = useRef<readonly string[]>(ranked);
  const display = useMemo(
    () => (settled ? ranked : holdOrder(last.current, ranked)),
    [ranked, settled],
  );
  last.current = display;
  return display;
}
