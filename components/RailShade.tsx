"use client";

import type { ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@/src/store/store";

// DESKTOP rail collapse-to-thread + scene-drag dim (card-redesign follow-up, 2026-08-08 — the
// scene is the star; adjudicated against literal auto-collapse-on-interact, which hides the
// interaction's own feedback surface and churns constantly under orbit damping):
//   · `RailShadeToggle` — the one persistent control at the rail's top: collapses the rail's
//     CARDS while the THREAD (its dots = the possibility space) remains as the minimized rail.
//   · `RailShade` — the fade wrapper: `visibility:hidden` (not display:none) so layout is
//     preserved and the thread keeps measuring its dots; also DIMS while the user directly
//     manipulates the scene (`store.sceneDragging` — OrbitControls user input only, never
//     Engine tweens). States + reduced-motion live in the `.rail-shade` recipe (globals.css).
export function RailShadeToggle({ side }: { side: "left" | "right" }) {
  const hidden = useStore((s) => (side === "left" ? s.railHiddenLeft : s.railHiddenRight));
  const setRailHidden = useStore((s) => s.setRailHidden);
  const Icon = side === "left" ? (hidden ? PanelLeftOpen : PanelLeftClose) : hidden ? PanelRightOpen : PanelRightClose;
  const label = hidden ? "Show the cards" : "Hide the cards — the thread keeps the map";
  return (
    <div className={cn("pointer-events-auto flex flex-none pb-0.5", side === "right" ? "justify-end pr-0.5" : "justify-start pl-0.5")}>
      <button
        type="button"
        aria-pressed={hidden}
        title={label}
        aria-label={label}
        onClick={() => setRailHidden(side, !hidden)}
        className="inline-flex items-center justify-center size-6 rounded-[var(--radius-xs)] text-muted-foreground hover:text-foreground hover:bg-wash-soft transition-colors cursor-pointer focus-visible:outline-1 focus-visible:outline-ring/60"
      >
        <Icon aria-hidden className="size-3.5" />
      </button>
    </div>
  );
}

export function RailShade({ side, children }: { side: "left" | "right"; children: ReactNode }) {
  const hidden = useStore((s) => (side === "left" ? s.railHiddenLeft : s.railHiddenRight));
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
