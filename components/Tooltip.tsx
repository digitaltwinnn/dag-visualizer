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
    <div id="tooltip" ref={ref} style={{ borderColor: hover.color }}>
      <span className="tt-ident" style={{ color: hover.color }}>{hover.ident}</span>
      <span className="tt-sep">·</span>
      <span className={cn("tt-name", hover.mono && "font-mono text-[11px]")}>{name}</span>
      <span className="tt-hint">click to inspect</span>
    </div>
  );
}
