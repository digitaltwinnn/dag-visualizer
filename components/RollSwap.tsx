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
// job, and two entrances would double-animate every card.
//
// `travel` (default true) adds the 8px rise. ⚠️ The LEFT RAIL passes travel={false} — BootFade's
// own warning governs here too: RailThread measures card rects and a transform moves them with
// no observer event to re-measure on, so the rail's swap is opacity-only and the motion comes
// from the arriving cards' own materialize + title rolls. Reduced motion drops both animations
// (the 200ms sequencing hold survives, as it does on the doc — a hold is timing, not motion).
export const SWAP_OUT_MS = 200; // ⚠️ paired with the duration-[200ms] utility below — one file, keep together

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
    if (swapKey === shownRef.current) return;
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
          : swaps.current > 0 && "animate-in fade-in duration-(--tempo-roll) ease-[cubic-bezier(.45,.05,.25,1)]",
        !leaving && travel && swaps.current > 0 && "slide-in-from-bottom-2",
        "motion-reduce:animate-none",
        className,
      )}
    >
      {render(shown)}
    </div>
  );
}
