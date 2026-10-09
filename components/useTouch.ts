"use client";
import { useEffect, useState } from "react";

/** THE TOUCH TIER'S TWO QUERIES — the strings `globals.css`'s `touch:` variant nests, in the same
 *  order (pinned by `components/touchTierBoundary.test.ts`): a coarse pointer, on the phone or
 *  tablet tier. The desktop tier is a mouse layout whatever the primary pointer says (2026-10-09,
 *  user: a touch laptop's desktop rail grew 44px rows "like mobile controls"); 1100 is
 *  `breakpointOf`'s own boundary, on the very arm `useBreakpoint` uses (CSS trap 8).
 *  Two queries, not one Level-4 `and (not (…))` string (review, 2026-10-09): the hook then names
 *  the tier on the very arm `useBreakpoint` uses, and the stylesheet nests the same two blocks.
 *  (The compiled sheet already carries Tailwind's Level-4 `not (min-width: …)` for every `max-[…]`
 *  arm, so this is one rule written one way, not a compatibility rescue.) */
export const TOUCH_QUERIES = ["(pointer: coarse)", "not all and (min-width: 1100px)"] as const;

// THE POINTER'S OWN WORD — one home (2026-09-04, the phone review's copy item). The teaching
// copy names the gesture ("Click one in a stack"), and on a phone that named a device the reader
// isn't holding. This hook answers the touch tier's query — the same key every `touch:` utility
// in the JSX rides — so copy and touch floors can never disagree about what the pointer is.
//
// ⚠️ SSR-FALSE BY DESIGN, resolved in an effect (the hydration lesson in ExplorerShell's `defaultCollapsed` note): the desktop
// rail SSRs these strings even when CSS-hidden on phone, so a window read at first render is a
// text hydration mismatch. The one-frame "Click" a phone could paint before the effect lands is
// invisible in practice — the phone's ghost cards live in sheets that mount on open, well after
// this resolves.
export function useTouch(): boolean {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    const mqs = TOUCH_QUERIES.map((q) => window.matchMedia(q));
    const apply = () => setTouch(mqs.every((m) => m.matches));
    apply();
    for (const m of mqs) m.addEventListener("change", apply);
    return () => { for (const m of mqs) m.removeEventListener("change", apply); };
  }, []);
  return touch;
}
