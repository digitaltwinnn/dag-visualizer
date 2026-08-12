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
//   · DIMS while the CAMERA is moving, either hand — see `useSceneYield`.
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
 * The ONE read behind the HUD's step-back: TRUE while the camera is moving, whichever hand is on
 * it — `sceneDragging` is the user's own (OrbitControls input only, never Engine tweens), and
 * `cameraFlying` is the engine answering a commit (user, 2026-08-12: "when we swipe a card or
 * click another one in the card hierarchy the scene moves the camera accordingly; during this
 * short animation period can we apply a similar effect to the cards/panels"). Deliberately two
 * channels rather than one widened one — the Engine writes them from different places and for
 * different reasons — joined HERE so the desktop rails and the tablet/phone dock sheets can't
 * drift about when the HUD yields. The dock's own bar and edge tabs never dim: they're the
 * handles, and a handle you can't see is worse than a card you can't read for a second.
 */
export function useSceneYield(): boolean {
  const dragging = useStore((s) => s.sceneDragging);
  const flying = useStore((s) => s.cameraFlying);
  return dragging || flying;
}
