"use client";

// Shared empty/loading-state ATOMS — built from the app's own marks (node-dot, ring, halo) so a
// loading/absent state reads as part of the instrument, not a bolt-on. Motion values are locked in
// 15-states.css (all reduced-motion gated there). Presentational only — no store access.

// ACQUIRING — a short row of node-stars twinkling on in staggered sequence while a value resolves.
export function NodeStars({ count = 5 }: { count?: number }) {
  return (
    <span className="st-stars" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <span className="st-star" key={i} style={{ animationDelay: `${i * 0.18}s` }} />
      ))}
    </span>
  );
}

// NO SIGNAL — a dim core node emitting ONE soft sonar ring. The caller remounts this (changing key)
// once per retry (the poll cadence), so each retry = one emitted ring — the animation IS the retry.
export function SonarRing() {
  return (
    <span className="st-sonar-wrap" aria-hidden>
      <span className="st-sonar-core" />
      <span className="st-sonar" />
    </span>
  );
}

// STANDBY — a single live node glowing with the same expanding halo a real node gets on hover (the
// pick invitation), among a few faint static peers.
export function StandbyHalo() {
  return (
    <span className="st-standby" aria-hidden>
      <span className="st-peer st-peer--a" />
      <span className="st-peer st-peer--b" />
      <span className="st-peer st-peer--c" />
      <span className="st-standby-halo" />
      <span className="st-standby-node" />
    </span>
  );
}
