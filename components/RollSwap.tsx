"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// THE NO-POP RULE, STRUCTURAL (user, 2026-09-04: "the left rail cards and bottom bar kinda pop
// too when we transition views … I like things to be more smooth" — approved as "full, best,
// version"). A view-scoped HUD surface never pops on navigation: its chrome persists, and its
// CONTENT leaves on a quick out-beat before the next view's arrives on the app's one roll
// grammar — the doc overlay's entrance at HUD scale (a card is a glance, a doc is a read).
//
// This is DocLayer's render/visible machinery generalized: `swapKey` is the subject (the mode),
// `render` builds content FOR A GIVEN KEY — never from live state, or the out-beat would show
// the new view's content in the old view's clothes. On a key change the standing content stays
// mounted while it fades out (SWAP_OUT_MS), then the new key's content mounts hidden and rises
// on --tempo-roll with the doc's restrained-start curve (ease-out front-loads into invisibility
// — the DocLayer lesson). A key change mid-swap restarts the out-beat toward the LATEST key;
// intermediate keys are skipped, which is what a fast view-cycler wants. First mount plays no
// entrance — boot staging is BootFade's job, and two entrances would double-animate every card.
//
// `travel` (default true) adds the 8px rise. ⚠️ The LEFT RAIL passes travel={false} — BootFade's
// own warning governs here too: RailThread measures card rects and a transform moves them with
// no observer event to re-measure on, so the rail's swap is opacity-only and the motion comes
// from the arriving cards' own materialize + title rolls. Reduced motion drops the transition
// (the sequencing gap survives, as it does on the doc — a 200ms hold is timing, not motion).
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
  const [visible, setVisible] = useState(true);
  // The ref keeps `shown` out of the effect's deps: the swap's own setShown must not re-run
  // the effect, whose cleanup would cancel the rise rAFs it just scheduled (the DocLayer
  // renderRef pattern).
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafs = useRef<number[]>([]);
  useEffect(() => {
    if (swapKey === shownRef.current) return;
    const clear = () => {
      if (t.current) {
        clearTimeout(t.current);
        t.current = null;
      }
      for (const r of rafs.current) cancelAnimationFrame(r);
      rafs.current.length = 0;
    };
    setVisible(false);
    t.current = setTimeout(() => {
      t.current = null;
      setShown(swapKey);
      // Double rAF before the rise — a single one fires before the mounted-hidden state has
      // painted, so the flip coalesces and the rise snaps (measured on the doc overlay).
      rafs.current.push(
        requestAnimationFrame(() => {
          rafs.current.push(requestAnimationFrame(() => setVisible(true)));
        }),
      );
    }, SWAP_OUT_MS);
    return clear;
  }, [swapKey]);
  return (
    <div
      className={cn(
        "transition motion-reduce:transition-none",
        visible
          ? "duration-(--tempo-roll) ease-[cubic-bezier(.45,.05,.25,1)]"
          : "duration-[200ms] ease-out",
        !visible && "opacity-0",
        !visible && travel && "translate-y-2",
        className,
      )}
    >
      {render(shown)}
    </div>
  );
}
