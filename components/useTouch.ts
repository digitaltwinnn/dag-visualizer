"use client";
import { useEffect, useState } from "react";

/** THE TOUCH TIER'S QUERY — the one string `globals.css`'s `touch:` variant also names (pinned by
 *  `components/touchTierBoundary.test.ts`): a coarse pointer on the phone or tablet tier. The
 *  desktop tier is a mouse layout whatever the primary pointer says (2026-10-09, user: a touch
 *  laptop's desktop rail grew 44px rows "like mobile controls"); 1100 is `breakpointOf`'s own
 *  boundary, named on the same arm the sheets use (CSS trap 8). */
export const TOUCH_QUERY = "(pointer: coarse) and (not (min-width: 1100px))";

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
    const mq = window.matchMedia(TOUCH_QUERY);
    const apply = () => setTouch(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return touch;
}
