"use client";
import { useBootPhase } from "@/components/useBootPhase";

// Cold-start overlay, painted by React independent of the Three scene: a centred forming Global L0
// core (soft radial glow + an expanding ping) + a "reaching the network…" label, in neutral cyan.
// On LIVE it cross-fades out as the real 3D core fades in; on timeout it switches to the grey NO
// SIGNAL treatment. Removed from the DOM once fully faded (LIVE) so it never intercepts anything.
export default function BootOverlay() {
  const phase = useBootPhase();
  if (phase === "live") return null; // handoff complete — gone for good
  const noSignal = phase === "no-signal";
  const noEngine = phase === "no-engine";
  // no-engine: the 3D scene can't run (WebGL unavailable). Say so plainly and stop the ping — this
  // is a settled dead-end, not a "still trying" state. Reuse the grey nosignal skin.
  const label = noEngine
    ? "3D unavailable — WebGL not supported"
    : noSignal
      ? "No signal — retrying…"
      : "reaching the network…";
  return (
    <div className={"boot-overlay" + (noSignal || noEngine ? " boot-overlay--nosignal" : "")} aria-hidden>
      <div className="boot-core">
        {!noEngine && <span className="boot-core-ping" />}
        <span className="boot-core-glow" />
      </div>
      <p className="boot-label">{label}</p>
    </div>
  );
}
