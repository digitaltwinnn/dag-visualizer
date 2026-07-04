"use client";

// Shared empty/loading-state ATOMS — built from the app's own marks (node-dot, ring, halo) so a
// loading/absent state reads as part of the instrument, not a bolt-on. Motion keyframes live in
// app/globals.css (the `--animate-st-*` theme vars, beside `breathe`/`ecg-scan`); each is paired
// with `motion-reduce:` at the call site below — Tailwind's own reduced-motion guard, same idiom
// as the `animate-breathe` live-dot elsewhere. Presentational only — no store access.

// ACQUIRING — a short row of node-stars twinkling on in staggered sequence while a value resolves.
export function NodeStars({ count = 5 }: { count?: number }) {
  return (
    <span className="inline-flex gap-[5px] items-center align-middle" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className="w-[5px] h-[5px] rounded-full bg-primary opacity-30 animate-st-twinkle motion-reduce:animate-none motion-reduce:opacity-70"
          style={{ animationDelay: `${i * 0.18}s` }}
        />
      ))}
    </span>
  );
}

// NO SIGNAL — the small breathing red dot next to "no signal" (Vitals + the snapshot card's
// title row) — reuses the shared `breathe` beat, same treatment as the "live now" cyan dot.
export function NoSignalDot() {
  return (
    <span className="w-[7px] h-[7px] rounded-full flex-none bg-[#ff5a5a] shadow-[0_0_0_3px_color-mix(in_oklch,#ff5a5a_22%,transparent)] animate-breathe motion-reduce:animate-none" />
  );
}

// NO SIGNAL — a dim core node emitting ONE soft sonar ring. The caller remounts this (changing key)
// once per retry (the poll cadence), so each retry = one emitted ring — the animation IS the retry.
export function SonarRing() {
  return (
    <span className="relative inline-block w-[14px] h-[14px] align-middle" aria-hidden>
      <span className="absolute inset-1 rounded-full bg-[color-mix(in_oklch,var(--muted-foreground)_60%,transparent)]" />
      <span className="absolute inset-1 rounded-full border border-[color-mix(in_oklch,var(--primary)_55%,transparent)] animate-st-sonar motion-reduce:animate-none" />
    </span>
  );
}

// STANDBY — a single live node glowing with the same expanding halo a real node gets on hover (the
// pick invitation), among a few faint static peers.
export function StandbyHalo() {
  return (
    <span className="relative inline-block w-11 h-[26px] align-middle" aria-hidden>
      <span className="absolute w-[5px] h-[5px] rounded-full bg-muted-foreground opacity-15 left-[26px] top-1" />
      <span className="absolute w-[5px] h-[5px] rounded-full bg-muted-foreground opacity-15 left-[34px] top-[15px]" />
      <span className="absolute w-[5px] h-[5px] rounded-full bg-muted-foreground opacity-15 left-6 top-[18px]" />
      <span className="absolute left-2 top-1/2 -mt-[4.5px] w-[9px] h-[9px] rounded-full border border-primary animate-st-standby-halo motion-reduce:animate-none motion-reduce:opacity-0" />
      <span className="absolute left-2 top-1/2 -mt-[4.5px] w-[9px] h-[9px] rounded-full bg-primary animate-st-standby-node motion-reduce:animate-none" />
    </span>
  );
}
