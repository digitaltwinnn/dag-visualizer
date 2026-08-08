"use client";

import type { ReactNode } from "react";
import { useStore } from "@/src/store/store";

// DESKTOP rail collapse-to-thread + scene-drag dim (card-redesign follow-up, 2026-08-08 — the
// scene is the star; adjudicated against literal auto-collapse-on-interact, which hides the
// interaction's own feedback surface and churns constantly under orbit damping). BOTH rails
// collapse together (user: they're symmetric, and the motive is whole-HUD) — the ONE control is
// the command bar's RailsToggle; this wrapper just realizes the state per rail:
//   · `visibility:hidden` (not display:none) so layout is preserved and the thread keeps
//     measuring its dots — they remain as the minimized rail (the possibility map);
//   · DIMS while the user directly manipulates the scene (`store.sceneDragging` —
//     OrbitControls user input only, never Engine tweens).
// States + reduced-motion live in the `.rail-shade` recipe (globals.css).
export function RailShade({ children }: { children: ReactNode }) {
  const hidden = useStore((s) => s.railsHidden);
  const dragging = useStore((s) => s.sceneDragging);
  return (
    <div
      className="rail-shade flex flex-col gap-[var(--rail-gap)] min-h-0"
      data-hidden={hidden ? "" : undefined}
      data-dim={!hidden && dragging ? "" : undefined}
    >
      {children}
    </div>
  );
}
