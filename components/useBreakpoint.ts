"use client";
import { useEffect, useState } from "react";
import { breakpointOf, type Breakpoint } from "@/src/data/breakpoint";

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>("desktop"); // SSR + first paint assume desktop
  useEffect(() => {
    const compute = () => setBp(breakpointOf(window.innerWidth));
    compute();
    const mqTablet = window.matchMedia("(max-width: 1099px)");
    const mqPhone = window.matchMedia("(max-width: 699px)");
    mqTablet.addEventListener("change", compute);
    mqPhone.addEventListener("change", compute);
    return () => { mqTablet.removeEventListener("change", compute); mqPhone.removeEventListener("change", compute); };
  }, []);
  return bp;
}
