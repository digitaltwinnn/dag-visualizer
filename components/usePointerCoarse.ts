"use client";
import { useEffect, useState } from "react";

// THE POINTER'S OWN WORD — one home (2026-09-04, the phone review's copy item). The teaching
// copy names the gesture ("Click one in a stack"), and on a phone that named a device the reader
// isn't holding. This hook answers `(pointer: coarse)` — the same key every `pointer-coarse:`
// utility in the JSX rides — so copy and touch floors can never disagree about what the pointer
// is.
//
// ⚠️ SSR-FALSE BY DESIGN, resolved in an effect (the AboutView hydration lesson): the desktop
// rail SSRs these strings even when CSS-hidden on phone, so a window read at first render is a
// text hydration mismatch. The one-frame "Click" a phone could paint before the effect lands is
// invisible in practice — the phone's ghost cards live in sheets that mount on open, well after
// this resolves.
export function usePointerCoarse(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const apply = () => setCoarse(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return coarse;
}
