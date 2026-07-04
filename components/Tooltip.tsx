"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useStore } from "@/src/store/store";
import { shortHash } from "@/src/data/network";

// Lean hover tooltip — a LABEL, not a mini-card: `‹ticker› · ‹name›` + "click to inspect". The
// identity ticker + a hairline border carry the subject's hue (core cyan for a DAG validator /
// global snapshot); the body stays neutral. Facts live in the card that opens on click. Content
// comes from the store (engine raycast, set only when the target changes); position is written
// straight to the DOM from the pointer so following the cursor never triggers a React render.
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
  const name = hover.mono ? shortHash(hover.name) : hover.name;
  return (
    <div
      id="tooltip"
      ref={ref}
      className="fixed z-30 pointer-events-none flex items-baseline gap-[7px] px-[10px] py-[6px] rounded-lg border border-border bg-[rgba(8,12,26,0.92)] text-xs whitespace-nowrap -translate-x-1/2 -translate-y-[140%] backdrop-blur-[8px]"
      style={{ borderColor: hover.color }}
    >
      <span className="font-bold text-[11px] tracking-[0.02em]" style={{ color: hover.color }}>{hover.ident}</span>
      <span className="text-muted-foreground">·</span>
      <span className={cn("text-foreground", hover.mono && "font-mono text-[11px]")}>{name}</span>
      <span className="text-muted-foreground text-[10.5px] ml-[6px] opacity-75">click to inspect</span>
    </div>
  );
}
