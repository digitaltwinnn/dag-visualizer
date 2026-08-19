"use client";
import { useEffect, useState } from "react";
import { breakpointOf, type Breakpoint } from "@/src/data/breakpoint";

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>("desktop"); // SSR + first paint assume desktop
  useEffect(() => {
    const compute = () => setBp(breakpointOf(window.innerWidth));
    compute();
    // `not all and (min-width: N)` rather than `max-width: N-1` so the listeners flip on exactly
    // the boundaries `breakpointOf` reads — a `max-width` arm one pixel down misses a fractional
    // width that has already crossed it (CSS trap 8).
    const mqTablet = window.matchMedia("not all and (min-width: 1100px)");
    const mqPhone = window.matchMedia("not all and (min-width: 700px)");
    mqTablet.addEventListener("change", compute);
    mqPhone.addEventListener("change", compute);
    return () => { mqTablet.removeEventListener("change", compute); mqPhone.removeEventListener("change", compute); };
  }, []);
  return bp;
}
