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
// Technologies to the front", "Building History", "Filter set to USDC.dag". Two store channels and
// nothing else: `sceneMoving` (the Engine's per-frame answer, from the structures that drive
// motion) says WHETHER, `motionCause` (stamped by the gesture's owner) says WHY, and
// `domain/motionHint.ts` turns the cause into words.
//
// THE LOOK (user, 2026-09-26, several rounds): first a grey status line, then the scene-glass card
// the callout wears — "a bit too dominant for a screen hint". What it is now: the sentence a step
// above body size in the DIM foreground — clear, not loud (user: "font should be clear but more
// subtle") — on a QUIET PLATE (user: "a subtle background so that it still stands out from the
// scene it overlays"): a borderless pill in the ground's own colour at low opacity with a light
// blur, which separates the line from a lit hub or a paper globe without reading as a card.
// Deliberately NOT `SCENE_GLASS` — that container is for subject labels (the callout, the
// tooltip) and was tried here and rejected as dominant; this is a status line, and its plate is
// the least that keeps it legible. No beating dot (user: "I wanted the globe gone") — the
// sentence alone. Its entrance is a fade; it sits high, just under the command bar, and never
// moves once placed.
//
// It fades in after a beat (150ms) so a same-pose NUDGE — 0.55s, and deliberately not a "change
// you can see" — never flashes a sentence, and out the frame the motion ends. The LAST sentence is
// kept through the fade-out, so the words never change under the reader while they vanish.
// Placed HIGH (user, 2026-09-29: moved from the bottom to the top): anchored at the rails' own top
// line — `--rail-top` plus `--topbar-extra`, the sum every rail uses — so it clears the command
// bar on every tier and an opened filter strip pushes it down with the rest of the layout rather
// than covering it. During a VIEW TRANSITION the nodes gather into the staging band on that same
// line, so there it stands just below the band's measured bottom (`gatherBottom`, Engine-written,
// canvas-local — hence the same `--topbar-extra` added back); the band is width-solved, so its
// depth runs from ~4 rows on a desktop to ~18 on a phone and no fixed offset clears both.
// Pointer-inert, and only in a view with a canvas.

/** How long a sentence holds at full before its long ease begins. */
// 700 first; the user read it as fading too soon (2026-09-26, second round on the timing).
const HOLD_MS = 1400;
/** The long ease's length once the hold is over — sized to what is left of the motion: a pose
 *  flight runs 1.4s, a view transition ~3.9s, so the line reaches nothing about when the scene
 *  does. The motion's own end still cuts it short with the ordinary quick fade. */
const EASE_MS = { flight: 900, transition: 3200 } as const;

/** Clearance between the staging band's last row and the hint's plate. */
const GATHER_GAP_PX = 16;

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
  const gatherBottom = useStore((s) => s.gatherBottom);
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
  // THE HOLD, THEN THE LONG EASE (user, round five: "shows clear for a set time and then, as the
  // movement continues, eases along gradually till movement is done"). The line sits at full for
  // `HOLD_MS`, then a slow LINEAR fade begins, sized to the motion's kind (`EASE_MS`) so it runs
  // out about when the scene settles; if the motion ends first, the ordinary 200ms fade takes
  // over from wherever the ease has got to (a CSS transition continues from the live value). A
  // NEW sentence (leaving → entering, a second gesture) re-arms the hold.
  const [easing, setEasing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (moving && text) {
      setShown(text);
      setEasing(false);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setEasing(true), HOLD_MS);
    }
    return () => {
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    };
  }, [moving, text]);
  if (!VIEW_POLICIES[mode].canvas) return null;
  const on = moving && text != null;
  const state = !on ? "0" : easing ? "ease" : "1";
  return (
    <div
      role="status"
      aria-live="polite"
      // The sentence is HELD through the visual fade, so a faded hint is hidden from assistive tech
      // too — or it kept saying "Entering History" long after the view settled (the tester pass).
      aria-hidden={state === "0"}
      data-on={state}
      style={{
        top:
          phase && gatherBottom != null
            ? `calc(${gatherBottom + GATHER_GAP_PX}px + var(--topbar-extra, 0px))`
            : "calc(var(--rail-top) + var(--topbar-extra, 0px))",
        ["--hint-ease" as string]: `${phase ? EASE_MS.transition : EASE_MS.flight}ms`,
      }}
      className={cn(
        "absolute left-1/2 z-[5] -translate-x-1/2 pointer-events-none select-none whitespace-nowrap",
        // 13.5px: between `text-body` and `text-title` on the scale — the title size read a
        // touch loud once the ink dimmed (user, round four). No shadow at all: the dim ink over
        // the scene is the whole treatment.
        "inline-flex items-center text-[13.5px] leading-none font-normal text-foreground-dim",
        // The plate: the ground's colour at 62%, blurred — `--background` is `light-dark()`, so the
        // one rule serves both grounds. No border, no shadow. (Removed for a round on a misread
        // "remove the pill" — the user meant the beating DOT, not the plate; 2026-09-26.)
        "rounded-full px-3.5 py-2 bg-[color-mix(in_oklch,var(--background)_62%,transparent)] backdrop-blur-[6px]",
        // The entrance: fade + a short rise, delayed a beat on the way IN only. One arbitrary
        // `[transition:…]` rather than two utilities — `transition-*` is a twMerge group.
        // Three states on one property: OFF (quick fade), ON (quick fade in, a beat late), and
        // EASE (the long linear fade, its length from `--hint-ease`). One `transition-*`
        // utility per state — twMerge groups them, so a second on the same element would win.
        "opacity-0 transition-opacity duration-200 ease-out",
        "data-[on='1']:opacity-100 data-[on='1']:delay-150",
        // ⚠️ THE EASE TARGETS 0.02, NOT 0, so the motion's END can cut it (user, 2026-09-26: with
        // the longer hold "the easing goes way beyond the animation"). A CSS transition only
        // starts on a CHANGE of computed target: with the ease already heading for 0, flipping to
        // the OFF state — also 0 — started nothing, and the slow linear fade simply ran on past the
        // settled scene (measured: 0.46 → 0 over 1.5s after the switch had landed). Two hundredths
        // is invisible; the change of target is what makes the 200ms cut take over.
        "data-[on='ease']:opacity-[0.02] data-[on='ease']:ease-linear data-[on='ease']:[transition-duration:var(--hint-ease)]",
        "motion-reduce:!transition-none",
      )}
    >
      {/* No beating dot (user, 2026-09-26: "I wanted the globe gone") — the sentence alone. */}
      <span>{on ? shown : shown ?? ""}</span>
    </div>
  );
}
