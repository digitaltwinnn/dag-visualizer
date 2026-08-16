"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { formatVital, formatVitalInt } from "@/src/util/odometer";

// A headline numeric that roll-animates when its value changes: the old text slides up and
// out while the new slides in from below. Reduced-motion (or first paint) swaps instantly.
// `int` picks the whole-count format (no "9.0") for vitals that are always integer counts.
//
// CALM TEMPO (user, 2026-08-16 — "moving a bit too fast, as opposed to /design"): the roll
// itself is the same 0.4s everywhere; what read fast in the app was CADENCE — live vitals can
// land values back-to-back, and consecutive rolls read as a strobe. So the odometer takes the
// design system's own transient-signal rule (~1.2s, debounced): at most one roll per
// MIN_ROLL_MS, with intermediate values COALESCED into the next roll — the shown number lags
// by at most the hold, which for an extrapolated rate is nothing, and the roll stays the
// punctuation it is on /design (whose 1.5s demo cadence is unaffected).
export default function Odometer({
  value,
  className,
  int = false,
}: {
  value: number | null | undefined;
  className?: string;
  int?: boolean;
}) {
  const next = int ? formatVitalInt(value) : formatVital(value);
  const [shown, setShown] = useState(next);
  const [prev, setPrev] = useState<string | null>(null);
  const first = useRef(true);
  const shownRef = useRef(shown);
  const lastRoll = useRef(0);
  const pendingNext = useRef<string | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    shownRef.current = shown;
  });
  useEffect(
    () => () => {
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
    },
    [],
  );

  const MIN_ROLL_MS = 1200; // the transient-signal tempo (see the calm-tempo note above)

  useEffect(() => {
    if (first.current) {
      first.current = false;
      setShown(next);
      return;
    }
    if (next === shownRef.current) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(next);
      return;
    }
    const roll = (to: string) => {
      lastRoll.current = performance.now();
      setPrev(shownRef.current);
      setShown(to);
      const t = setTimeout(() => setPrev(null), 420); // matches the roll keyframe
      return t;
    };
    const now = performance.now();
    if (now - lastRoll.current >= MIN_ROLL_MS) {
      const t = roll(next);
      return () => clearTimeout(t);
    }
    // Inside the hold: coalesce — remember the newest value and roll once, when the hold ends.
    pendingNext.current = next;
    if (!pendingTimer.current) {
      pendingTimer.current = setTimeout(() => {
        pendingTimer.current = null;
        if (pendingNext.current != null && pendingNext.current !== shownRef.current) roll(pendingNext.current);
        pendingNext.current = null;
      }, lastRoll.current + MIN_ROLL_MS - now);
    }
  }, [next]);

  return (
    <span className={cn("odometer", className)} aria-label={next} aria-live="polite" role="status">
      {prev !== null && <span className="odometer-out" aria-hidden>{prev}</span>}
      <span className={prev !== null ? "odometer-in" : undefined}>{shown}</span>
    </span>
  );
}
