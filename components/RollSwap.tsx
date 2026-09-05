"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// THE NO-POP RULE, STRUCTURAL (user, 2026-09-04: "the left rail cards and bottom bar kinda pop
// too when we transition views … I like things to be more smooth" — approved as "full, best,
// version"). A view-scoped HUD surface never pops on navigation: its chrome persists, and its
// CONTENT leaves on a quick out-beat before the next view's arrives on the app's one roll
// grammar — the doc overlay's entrance at HUD scale (a card is a glance, a doc is a read).
//
// BUILT ON THE HOUSE ANIMATION VOCABULARY (user, same day: "take all capabilities of tailwind
// (and possibly shadcn) into account"): tw-animate-css — already imported by globals.css and
// spoken by every shadcn primitive (popover, select, sheet) — so the swap is a keyed remount
// playing `animate-in`, and the out-beat plays `animate-out` held by fill-mode-forwards until
// the timeout unmounts it. That deletes the first cut's transition machinery outright (the
// visible flag and the double-rAF paint dance existed only because a TRANSITION needs a painted
// from-state; an animation carries its own). Tailwind v4's `duration-*`/`ease-*` set the
// `--tw-duration`/`--tw-ease` vars tw-animate reads, so the tempo tokens and the doc's
// restrained-start curve apply to animations unchanged (ease-out front-loads into invisibility
// — the DocLayer lesson).
//
// `render` builds content FOR A GIVEN KEY — never from live state, or the out-beat would show
// the new view's content in the old view's clothes. A key change mid-swap restarts the out-beat
// toward the LATEST key; intermediate keys are skipped, which is what a fast view-cycler wants.
// The FIRST mount plays no entrance (the swap-count gate below) — boot staging is BootFade's
// job, and two entrances would double-animate every card. Reduced motion drops both animations
// (the 200ms sequencing hold survives, as it does on the doc — a hold is timing, not motion).
//
// ⚠️ THIS IS THE WHOLE-SET SWAP, for a surface whose content is fully view-scoped (the vitals
// cells). A surface with a PERSISTENT resident reads the rule per card instead (user,
// 2026-09-04: the rail's stack-level swap made "things that always exist disappear and
// re-appear") — the explore rail keeps its About instance and keys only its body and its tool
// card; see ExploreRail. `travel` (default true) adds the 8px rise.
export const SWAP_OUT_MS = 200; // ⚠️ paired with the duration-[200ms] utility below — one file, keep together

// THE ARRIVAL EASE — the same rule for content that LANDS inside a persistent frame (an async
// read resolving into rows, a live list gaining an entry, a reveal replacing an acquiring
// state): put it on the element that MOUNTS when the content arrives — a keyed row, a landed
// branch — and the entrance plays once, never on updates (user, 2026-09-04: "other elements
// inside others that can benefit from easing … the list of anchored snapshots growing/
// shrinking, the data in the metagraph snapshot card when revealed").
export const CONTENT_EASE =
  "animate-in fade-in duration-(--tempo-roll) ease-(--ease-roll) motion-reduce:animate-none";

// THE LIVE-BAR EASE — a width stated by live data never snaps between readings (the odometer's
// principle applied to geometry). For style-width elements that PERSIST across polls; an
// element that remounts per reading has nothing to transition and doesn't take this.
export const BAR_EASE = "transition-[width] duration-500 ease-out motion-reduce:transition-none";

export default function RollSwap<K extends string>({
  swapKey,
  render,
  className,
  travel = true,
}: {
  swapKey: K;
  render: (key: K) => ReactNode;
  className?: string;
  travel?: boolean;
}) {
  const [shown, setShown] = useState<K>(swapKey);
  const [leaving, setLeaving] = useState(false);
  // The ref keeps `shown` out of the effect's deps: the swap's own setShown must not re-run
  // the effect (the DocLayer renderRef pattern). `swaps` gates the entrance to real swaps.
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const swaps = useRef(0);
  useEffect(() => {
    if (swapKey === shownRef.current) {
      // A key that returns to the standing content mid-out-beat (fast double-switch) must
      // also CANCEL the out — the cleanup cleared the timer, but `leaving` stayed true and
      // fill-mode-forwards held the content invisible for good (review find, 2026-09-05).
      setLeaving(false);
      return;
    }
    setLeaving(true);
    const t = setTimeout(() => {
      swaps.current += 1;
      setShown(swapKey);
      setLeaving(false);
    }, SWAP_OUT_MS);
    return () => clearTimeout(t);
  }, [swapKey]);
  return (
    // Keyed on `shown`: each swap mounts a fresh element, which is what makes `animate-in`
    // replay — the same contract PulseEdge's keyed remount rides.
    <div
      key={shown}
      className={cn(
        leaving
          ? "animate-out fade-out duration-[200ms] ease-out fill-mode-forwards"
          : swaps.current > 0 && "animate-in fade-in duration-(--tempo-roll) ease-(--ease-roll)",
        !leaving && travel && swaps.current > 0 && "slide-in-from-bottom-2",
        "motion-reduce:animate-none",
        className,
      )}
    >
      {render(shown)}
    </div>
  );
}
