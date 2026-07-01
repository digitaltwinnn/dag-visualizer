"use client";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/src/store/store";
import { useSnapshotFeed } from "@/components/useSnapshotFeed";

// The brand mark = an ECG trace carrying liveness. It sweeps one beat on each new snapshot
// tick (meaningful motion), and flattens to a flatline + greys when the feed is down
// (NO SIGNAL) — the flatline is the offline state, no text tag. Reduced-motion: static trace.
const BEAT = "M0 12 H10 L13 12 L15 4 L18 20 L21 9 L24 12 H34"; // spike
const FLAT = "M0 12 H34";

export default function EcgMark() {
  const live = useStore((s) => s.live);
  const { snaps } = useSnapshotFeed(8); // small window; take the max ordinal (order-agnostic)
  const latest = snaps.length ? Math.max(...snaps.map((s) => s.ordinal)) : null;
  const [beat, setBeat] = useState(false);
  const prevOrd = useRef<number | null>(null);

  useEffect(() => {
    if (latest == null) return;
    if (prevOrd.current !== null && latest !== prevOrd.current) {
      setBeat(true);
      const t = setTimeout(() => setBeat(false), 900);
      prevOrd.current = latest;
      return () => clearTimeout(t);
    }
    prevOrd.current = latest;
  }, [latest]);

  return (
    <span className={"ecg" + (live ? "" : " ecg--off") + (beat ? " ecg--beat" : "")} aria-hidden>
      <svg width="34" height="24" viewBox="0 0 34 24" fill="none">
        <path className="ecg-trace" d={live ? BEAT : FLAT} stroke="currentColor" strokeWidth="1.6"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
