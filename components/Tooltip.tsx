"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/src/store/store";
import { ROLE_SHORT } from "@/components/inspector/parts";

// Hover tooltip. Content comes from the store (engine raycast, set only when the
// hovered target changes); position is updated directly on the DOM node from the
// pointer so following the cursor never triggers a React render.
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
  return (
    <div id="tooltip" ref={ref}>
      <div className="tt-main">
        <div className="tt-title">
          {hover.color && <span className="tt-dot" style={{ background: hover.color }} />}
          <span>{hover.title}</span>
        </div>
        {hover.id && <div className="tt-id insp-hash">{hover.id}</div>}
        {hover.sub && <div className="tt-sub">{hover.sub}</div>}
      </div>
      {hover.roles && hover.roles.length > 0 && (
        <div className="tt-roles">
          {hover.roles.map((r) => (
            <span className="role-tag" key={r}>
              {ROLE_SHORT[r] || r}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
