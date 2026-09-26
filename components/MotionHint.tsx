"use client";

import { useEffect, useRef, useState } from "react";

import { VIEWS } from "@/components/views";
import { METRIC_LABELS } from "@/src/data/trendSeries";
import { ZOOMS } from "@/src/data/trendWindow";
import { displayNetwork } from "@/src/data/unlisted";
import { motionHint, type HintNames } from "@/src/engine/domain/motionHint";
import { VIEW_POLICIES } from "@/src/engine/domain/viewPolicy";
import { useStore } from "@/src/store/store";
import { cn } from "@/lib/utils";

// THE MOTION HINT (user, 2026-09-26): one quiet sentence, in the scene a little under its centre —
// where the work is being done — for exactly as long as the scene is moving. "Bringing Dor
// Technologies to the front", "Building History", "Narrowing to USDC.dag". Two store channels and
// nothing else: `sceneMoving` (the Engine's per-frame answer, from the structures that drive
// motion) says WHETHER, `motionCause` (stamped by the gesture's owner) says WHY, and
// `domain/motionHint.ts` turns the cause into words.
//
// THE LOOK (user, 2026-09-26, two rounds): first a grey status line, then the scene-glass card
// the callout wears — "a bit too dominant for a screen hint". What it is now: NO plate at all, the
// sentence one step up the type scale (`text-title`, 15px) in the DIM foreground — clear, not
// loud (user, round three: "font should be clear but more subtle") — with one tight shadow in the
// ground's own colour, just enough to lift it off a lit hub or a paper globe, and a small beating
// accent dot that says "in motion" the way the LIVE control's dot says "following".
// Larger and quieter at once, because it is only ever on screen for the length of a flight. A
// pure FADE — it first rose a few pixels into place, which read as the line jumping (user).
//
// It fades in after a beat (150ms) so a same-pose NUDGE — 0.55s, and deliberately not a "change
// you can see" — never flashes a sentence, and out the frame the motion ends. The LAST sentence is
// kept through the fade-out, so the words never change under the reader while they vanish.
// Placed LOW (user: "more to the bottom of the screen"): anchored a fixed distance above the
// bottom band's reserved space (`--bottom-reserve`, published by BottomStream), so it sits just
// over the band on every tier rather than at a share of the height that lands differently on a
// phone. Pointer-inert, and only in a view with a canvas.

/** How long a sentence holds before it starts to fade, whatever the scene is still doing. */
const HOLD_MS = 1100;

/** A stable country name from the browser's own vocabulary; the code where it has none. */
function countryName(cc: string): string {
  try {
    return new Intl.DisplayNames(undefined, { type: "region" }).of(cc) ?? cc;
  } catch {
    return cc;
  }
}

export default function MotionHint() {
  const mode = useStore((s) => s.mode);
  const moving = useStore((s) => s.sceneMoving);
  const cause = useStore((s) => s.motionCause);
  const phase = useStore((s) => s.motionPhase);
  // The rung names read the selection the rail card stands for — resolved here, at render, so the
  // domain module stays a function of its arguments.
  const filter = useStore((s) => s.filter);
  const inspect = useStore((s) => s.inspect);
  const country = useStore((s) => s.country);
  const names: HintNames = {
    view: (m) => VIEWS.find((v) => v.id === m)?.name ?? m,
    network: (id) => displayNetwork(id)?.name ?? id,
    country: countryName,
    window: (id) => ZOOMS.find((z) => z.id === id)?.label ?? id,
    measure: (id) => METRIC_LABELS[id],
    rung: (level) => {
      switch (level) {
        case "network": return filter !== "all" ? (displayNetwork(filter)?.name ?? filter) : "every network";
        case "node": return inspect?.title ?? "the node";
        case "country": return country ? countryName(country) : "the country";
        case "cohort": return "the selected nodes";
        case "composition": return "the selection";
        case "all": return "the whole network";
      }
    },
  };
  const text = cause ? motionHint(cause, mode, names, phase) : null;
  // The sentence shown — held through the fade-out (see the header).
  const [shown, setShown] = useState<string | null>(null);
  // THE HOLD IS CAPPED (user: "displayed a bit too long sometimes — start it to fade earlier"):
  // a flight's last half-second is the ease-out nobody reads as movement, so the line begins its
  // fade `HOLD_MS` after it appeared, motion or not. A NEW sentence (leaving → entering, a second
  // gesture) re-arms the hold, so a view switch still says both halves.
  const [expired, setExpired] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (moving && text) {
      setShown(text);
      setExpired(false);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setExpired(true), HOLD_MS);
    }
    return () => {
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    };
  }, [moving, text]);
  if (!VIEW_POLICIES[mode].canvas) return null;
  const on = moving && text != null && !expired;
  return (
    <div
      role="status"
      aria-live="polite"
      data-on={on ? "1" : "0"}
      style={{ bottom: "calc(var(--bottom-reserve, 0px) + 52px)" }}
      className={cn(
        "absolute left-1/2 z-[5] -translate-x-1/2 pointer-events-none select-none whitespace-nowrap",
        // 13.5px: between `text-body` and `text-title` on the scale — the title size read a
        // touch loud once the ink dimmed (user, round four). No shadow at all: the dim ink over
        // the scene is the whole treatment.
        "inline-flex items-center gap-2.5 text-[13.5px] leading-none font-normal text-foreground-dim",
        // The entrance: fade + a short rise, delayed a beat on the way IN only. One arbitrary
        // `[transition:…]` rather than two utilities — `transition-*` is a twMerge group.
        "opacity-0 transition-opacity duration-200 ease-out",
        "data-[on='1']:opacity-100 data-[on='1']:delay-150",
        "motion-reduce:!transition-none",
      )}
    >
      {/* The beating dot: "in motion", in the structural accent — the LIVE control's own idiom. */}
      <span
        aria-hidden
        className="flex-none size-1.5 rounded-full bg-primary shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_28%,transparent)] animate-dot-beat motion-reduce:animate-none"
      />
      <span>{on ? shown : shown ?? ""}</span>
    </div>
  );
}
