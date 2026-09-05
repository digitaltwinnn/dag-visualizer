"use client";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/src/store/store";

// THE HUD'S STAGED ENTRANCE (2026-09-04). Cold start used to be: boot overlay + forming scene,
// with every fixed zone — command bar, rails, footer, vitals band — simply THERE at first paint,
// fully formed over a scene still being born. The HUD now arrives in the data's own order,
// gated on the REAL boot signals (never a fake delay):
//
//   stage 1 · frame — the engine is up (or has failed: chrome is CONTROLS, and a dead scene
//                     still needs the theme toggle and the way out) → the command bar.
//   stage 2 · data  — the first feed landed (snapshot or catalog) → rails, dock, footer; the
//                     cards enter with their own ghosts/state-atoms, so "arrived but still
//                     acquiring" stays honest per panel.
//   stage 3 · live  — the boot latched live → the vitals band, the one zone that only means
//                     anything with a feed.
//
// Stages LATCH (a later feed drop is the per-panel NO SIGNAL story, same as useBootPhase), and
// an 8s timeout force-completes the ladder: chrome gated on data forever would hide the app's
// controls behind a dead feed, which is the opposite of rule 10 — the zones themselves state
// absence honestly. Steps are paced STEP_MS apart so a fast boot still reads as a sequence
// rather than a blob; the pacing only ever delays a reveal, never invents a reading.
export type BootStage = 0 | 1 | 2 | 3;

const STEP_MS = 350;
const CHROME_TIMEOUT_MS = 8000;

export function useBootStage(): BootStage {
  const engineReady = useStore((s) => s.engineReady);
  const engineFailed = useStore((s) => s.engineFailed);
  const hasData = useStore((s) => s.latestSnapshot != null || s.metaList.length > 0);
  const live = useStore((s) => s.live);
  const [timedOut, setTimedOut] = useState(false);
  const [stage, setStage] = useState<BootStage>(0);
  const targetRef = useRef<BootStage>(0);

  useEffect(() => {
    const id = setTimeout(() => setTimedOut(true), CHROME_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, []);

  const target: BootStage = timedOut
    ? 3
    : !(engineReady || engineFailed)
      ? 0
      : !hasData
        ? 1
        : !live
          ? 2
          : 3;

  useEffect(() => {
    if (target > targetRef.current) targetRef.current = target; // latch — stages never regress
    if (stage >= targetRef.current) return;
    // First step immediate (the bar answers the engine the moment it exists); later steps paced.
    const id = setTimeout(
      () => setStage((s) => (s < targetRef.current ? ((s + 1) as BootStage) : s)),
      stage === 0 ? 0 : STEP_MS,
    );
    return () => clearTimeout(id);
  }, [stage, target]);

  return stage;
}
