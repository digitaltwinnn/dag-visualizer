"use client";
import { useStore } from "@/src/store/store";
import { BEAT, FLAT } from "@/components/brand";

// The brand mark = a live ECG monitor. While the feed is up, a bright pulse SWEEPS along the trace
// on a steady ~1.5s beat (the filter bullet pulses on the same beat); when the feed is down it
// flattens to a grey flatline (NO SIGNAL). The beat is a continuous heartbeat rhythm, not a per-tick
// flash — it always reads as "alive". Reduced-motion: a static lit trace.
// The waveform itself lives in components/brand.tsx — one `d`, shared with the static BrandMark.

export default function EcgMark() {
  const live = useStore((s) => s.live);
  return (
    <span className={"ecg" + (live ? "" : " ecg--off")} aria-hidden>
      <svg width="34" height="24" viewBox="0 0 34 24" fill="none">
        {/* dim base trace (the full waveform, always visible while live) */}
        <path className="ecg-base" d={live ? BEAT : FLAT} stroke="currentColor" strokeWidth="1.6"
          strokeLinecap="round" strokeLinejoin="round" />
        {/* a bright short segment that travels along the trace — the sweeping beat */}
        {live && (
          <path className="ecg-scan" d={BEAT} stroke="currentColor" strokeWidth="1.9"
            strokeLinecap="round" strokeLinejoin="round" pathLength={100} />
        )}
      </svg>
    </span>
  );
}
