"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useStore } from "@/src/store/store";
import { midHash } from "@/src/util/format";
import { NODE_ID_GLYPHS } from "@/components/explorer/nodeRow";
import { SCENE_GLASS } from "@/components/selection";
import { TickerChip } from "@/components/inspector/parts";

// Lean hover tooltip — a LABEL, not a mini-card: `‹name› ‹ticker›` + "click to inspect". Facts
// live in the card that opens on click. Content comes from the store (engine raycast, set only
// when the target changes); position is written straight to the DOM from the pointer so following
// the cursor never triggers a React render.
//
// ONE FAMILY with the subject callout (user, 2026-08-15 — "align the hover and the click card"):
// both are scene-anchored HUD glass, so this wears the shared SCENE_GLASS container and the same
// row grammar — primary name, then the hued ticker as the identity aside. The hue-tinted BORDER
// is gone with that: identity never tints a frame anywhere else in the HUD, and it was the one
// thing making the tooltip read as a different species from the callout beside it.
export default function Tooltip() {
  const hover = useStore((s) => s.hover);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mm = (e: PointerEvent) => {
      const el = ref.current;
      if (el) {
        el.style.left = e.clientX + "px";
        el.style.top = e.clientY + "px";
      }
    };
    window.addEventListener("pointermove", mm);
    return () => window.removeEventListener("pointermove", mm);
  }, []);

  if (!hover) return null;
  // A node's id is cut the way its callout, its card and its explorer row cut it (2026-10-03) —
  // the hover used its own shortening at a smaller size, so one node read as two strings.
  const name = hover.mono ? midHash(hover.name, NODE_ID_GLYPHS) : hover.name;
  return (
    <div
      id="tooltip"
      ref={ref}
      className={cn(
        "fixed z-30 pointer-events-none flex items-baseline gap-[7px] whitespace-nowrap -translate-x-1/2 -translate-y-[140%]",
        SCENE_GLASS,
      )}
    >
      <span className={cn("text-body font-semibold text-foreground", hover.mono && "font-mono tabular-nums")}>{name}</span>
      {/* The ticker beside a name is the one chip (`TickerChip`) — hover and commit are one species. */}
      {hover.ident && <TickerChip text={hover.ident} hue={hover.color} className="self-center" />}
      <span className="text-muted-foreground text-label ml-[6px] opacity-75">click to inspect</span>
    </div>
  );
}
