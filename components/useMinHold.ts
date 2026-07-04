"use client";
import { useEffect, useRef, useState } from "react";

// useMinHold — a transient/ACQUIRING signal, once shown, stays up for a MINIMUM hold (one calm
// cycle) even if the data resolves sooner, THEN fades out gently instead of unmounting abruptly.
// Slow resolutions behave as today (it shows as long as `active` is true, then the same fade).
// Shared by the boot overlay + the acquiring atoms (concern #8) so there's ONE timing/fade
// mechanism, not per-site timers.
//
//   const { show, fading } = useMinHold(active);
//   if (!show) return null;                        // render while held (and during the fade)
//   <div className={cn(fading && "animate-hold-fade-out motion-reduce:animate-none")} />
//
// Reduced motion: no fade animation (fadeMs collapses to 0 → instant swap after the hold); the
// hold itself stays (it's timing, not motion). All timers are cleaned up on unmount (no leaks).
export function useMinHold(
  active: boolean,
  holdMs = 1200,
  fadeMs = 400,
): { show: boolean; fading: boolean } {
  const [show, setShow] = useState(active);
  const [fading, setFading] = useState(false);
  const shownAt = useRef<number>(active ? Date.now() : 0);
  const showRef = useRef(show);
  showRef.current = show;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const clear = () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    if (active) {
      // Rising edge (or still active): cancel any pending fade, show immediately, stamp the
      // moment we became visible so the hold is measured from first paint.
      clear();
      setFading(false);
      if (!showRef.current) shownAt.current = Date.now();
      setShow(true);
      return;
    }
    if (!showRef.current) return; // nothing on screen → nothing to hold or fade
    const reduce =
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const fade = reduce ? 0 : fadeMs;
    const wait = Math.max(0, holdMs - (Date.now() - shownAt.current));
    clear();
    timers.current.push(
      setTimeout(() => {
        if (fade > 0) setFading(true);
        timers.current.push(
          setTimeout(() => {
            setShow(false);
            setFading(false);
          }, fade),
        );
      }, wait),
    );
    return clear;
  }, [active, holdMs, fadeMs]);

  // Belt-and-braces: clear any outstanding timers when the consumer unmounts.
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  return { show, fading };
}
