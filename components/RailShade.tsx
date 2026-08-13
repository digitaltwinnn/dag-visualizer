"use client";

import type { ReactNode } from "react";
import { useStore } from "@/src/store/store";

// DESKTOP rail collapse-to-thread + scene-yield dim (card-redesign follow-up, 2026-08-08 — the
// scene is the star; adjudicated against literal auto-collapse-on-interact, which hides the
// interaction's own feedback surface and churns constantly under orbit damping). BOTH rails
// collapse together (user: they're symmetric, and the motive is whole-HUD) — the ONE control is
// the command bar's PresentationToggle (SCENE state); this wrapper just realizes it per rail:
//   · `visibility:hidden` (not display:none) so layout is preserved and the thread keeps
//     measuring its dots — they remain as the minimized rail (the possibility map);
//   · DIMS while the user's own hand is on the camera — see `useSceneYield`. NOT for a commit
//     flight: this is the desktop rail, and `flight` is opted into by the sheet tiers alone.
// States + reduced-motion live in the `.rail-shade` recipe (globals.css).
export function RailShade({ children }: { children: ReactNode }) {
  const hidden = useStore((s) => s.railsHidden);
  const yielding = useSceneYield();
  return (
    <div
      className="rail-shade flex flex-col gap-[var(--rail-gap)] min-h-0"
      data-hidden={hidden ? "" : undefined}
      data-dim={!hidden && yielding ? "" : undefined}
    >
      {children}
    </div>
  );
}

/**
 * The ONE read behind the HUD's step-back. Two channels, because the Engine writes them from
 * different places and for different reasons:
 *
 *   · `sceneDragging` — the USER's own hand on the camera (OrbitControls input only, never Engine
 *     tweens). Every tier yields to it: direct manipulation is the scene being addressed.
 *   · `cameraFlying` — the ENGINE answering a commit (user, 2026-08-12: "when we swipe a card or
 *     click another one in the card hierarchy the scene moves the camera accordingly; during this
 *     short animation period can we apply a similar effect to the cards/panels"). OPT-IN via
 *     `flight`, and only the PHONE dock opts in.
 *
 * ⚠️ THE COMMIT-FLIGHT DIM IS FOR PHONE ONLY (user, 2026-08-13). Every wider tier already has a
 * step-aside the user is expected to reach for, so dimming its cards for 1.4s after every commit
 * spends motion on a problem that tier doesn't have: desktop has the command bar's SCENE toggle
 * (and its rails sit BESIDE the scene, not over it), and the tablet edge-tab sheet is dismissed by
 * the same tab that opened it, with the scene keeping full width behind it. Phone has neither — a
 * 60vh sheet over a persistent dock bar, where the flight is the only moment the view underneath
 * is worth seeing. The gate is STRUCTURAL rather than a media query: `RailShade` is rendered by
 * the desktop branch of ExploreRail/Inspector, `RailDock` by the tablet and phone ones, and within
 * RailDock the phone branch is the one passing `trigger="bottom-bar-half"` — so the surface that
 * opts in IS the tier (convention 7's allow-list), with no breakpoint to keep in sync.
 */
export function useSceneYield(opts?: { flight?: boolean }): boolean {
  const dragging = useStore((s) => s.sceneDragging);
  const flying = useStore((s) => s.cameraFlying);
  return dragging || (!!opts?.flight && flying);
}
