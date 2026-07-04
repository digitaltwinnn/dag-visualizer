"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// One-shot "new subject" edge pulse — a bright segment sweeps once DOWN a card's signal edge
// (~1.2s) when the card's SUBJECT changes (a new metagraph filtered, a new node picked, a new
// snapshot ordinal). It is the calm, instrument replacement for the old whole-card flash
// (`useFlashOnChange`, deleted): one travelling line on one edge, instead of lighting all four.
//
// GEOMETRY (user-tuned live): the pulse runs on the card's SCENE-FACING (inner) edge — a
// `rail="left"` card pulses on its RIGHT edge, a `rail="right"` card on its LEFT — away from the
// screen edge, where it hid against the rail margin. Rest-state spines stay put; only the pulse
// faces the scene. Colour comes from the card's OWN identity var (no new tokens): the CSS recipe
// (`.edge-pulse`, globals.css) rides `--spine` for left-rail cards, `--filter-accent` for
// right-rail cards (which suppress their spine).
//
// Calm tempo (brief): fires ONCE per subject change, skips the initial mount, and DEBOUNCES — a
// pulse already playing is NOT restarted (a change within PULSE_MS is dropped so the current sweep
// finishes). So the snapshot card following live ticks pulses at most once per ~PULSE_MS. Under
// `prefers-reduced-motion` it never fires. The inner segment is keyed so it REMOUNTS per pulse
// (replaying the CSS animation cleanly), the same keyed-remount idiom as the `roll-in` title — so
// the title roll and the pulse fire together on one "new subject" moment.
const PULSE_MS = 1200;

export function useEdgePulse(subjectKey: unknown): number {
  const [pulseKey, setPulseKey] = useState(0);
  const mounted = useRef(false);
  const lastAt = useRef(0);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now - lastAt.current < PULSE_MS) return; // let the current sweep finish — don't restart
    lastAt.current = now;
    setPulseKey((k) => k + 1);
  }, [subjectKey]);
  return pulseKey;
}

// Presentational half — the pulse edge, driven by a `pulseKey` from `useEdgePulse`. Kept separate
// so a card whose subject spans a BRANCH swap (ContextCard's dossier ⇄ "all") can host the hook at
// its top level (so a change across the swap still counts) and drop this in each branch: a fresh
// mount of the inner `<i>` replays the sweep on the swap, and a `pulseKey` bump replays it in place.
export function PulseEdge({ pulseKey, rail = "left" }: { pulseKey: number; rail?: "left" | "right" }) {
  if (pulseKey === 0) return null; // nothing until the first real subject change (skips mount)
  return (
    <span className={cn("edge-pulse", rail === "right" && "edge-pulse--rail-right")} aria-hidden="true">
      <i key={pulseKey} />
    </span>
  );
}

// Convenience — hook + view in one, for a card that stays mounted across its subject changes
// (the right-rail detail panes, keyed per slot). Where the subject spans a branch swap, call
// `useEdgePulse` at the component top and render `<PulseEdge>` instead.
export default function EdgePulse({
  subjectKey,
  rail = "left",
}: {
  subjectKey: unknown;
  rail?: "left" | "right";
}) {
  const pulseKey = useEdgePulse(subjectKey);
  return <PulseEdge pulseKey={pulseKey} rail={rail} />;
}
