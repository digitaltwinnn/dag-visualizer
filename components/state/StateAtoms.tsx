"use client";

import { Pin } from "lucide-react";
import { cn } from "@/lib/utils";

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
    <span className="w-[7px] h-[7px] rounded-full flex-none bg-destructive shadow-[0_0_0_3px_color-mix(in_oklch,var(--destructive)_22%,transparent)] animate-breathe motion-reduce:animate-none" />
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


// PINNED — the Snapshots view's word for a committed tick held against the live stream, as ONE
// mark everywhere it is said (user, 2026-10-09: "sometimes it's present differently … keep it
// consistent and use the icon, and ensure it's not too tiny"). The explorer's selected tick row,
// the Global snapshot card's control, the scene callout, the raw log's selected row and the raw
// pane's head all wear this glyph beside the word, the way the live state wears `LiveDot`. 14px
// (was 12 on the one row that had it); the ink is the caller's — muted at rest, full on a wash.
export function PinMark({ className }: { className?: string }) {
  return <Pin aria-hidden className={cn("size-3.5 flex-none", className)} />;
}
