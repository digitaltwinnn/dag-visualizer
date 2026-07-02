"use client";

import { useEffect } from "react";

// Grab-and-drag scrolling on the rails. Tablets already pan natively (CSS `touch-action: pan-y`
// + momentum); this adds the same feel for a MOUSE — press on a rail's non-interactive area and
// drag to scroll the cards up/down. A small movement threshold keeps ordinary clicks working, and
// interactive targets (buttons, links, node rows) never start a drag. Mounted once.
export default function RailScroll() {
  useEffect(() => {
    const cleanups: (() => void)[] = [];
    for (const id of ["leftcol", "rightcol"]) {
      const el = document.getElementById(id);
      if (!el) continue;

      // Toggle `.rail-clip` (the bottom fade mask) only while this rail actually extends down into
      // the chart's band — otherwise a short rail would be masked to nothing. Debounced via rAF.
      let raf = 0;
      const syncClip = () => {
        raf = 0;
        const reserve = parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue("--bottom-reserve"),
        ) || 0;
        const r = el.getBoundingClientRect();
        el.classList.toggle("rail-clip", reserve > 0 && r.bottom > window.innerHeight - reserve + 24);
      };
      const scheduleClip = () => { if (!raf) raf = requestAnimationFrame(syncClip); };
      scheduleClip();
      const ro = new ResizeObserver(scheduleClip);
      ro.observe(el);
      const mo = new MutationObserver(scheduleClip);
      mo.observe(el, { childList: true, subtree: true });
      window.addEventListener("resize", scheduleClip);

      let dragging = false;
      let startY = 0;
      let startTop = 0;
      let moved = false;

      const onMove = (e: PointerEvent) => {
        if (!dragging) return;
        const dy = e.clientY - startY;
        if (Math.abs(dy) > 3) moved = true;
        if (moved) {
          el.scrollTop = startTop - dy;
          e.preventDefault();
        }
      };
      const onUp = () => {
        if (!dragging) return;
        dragging = false;
        el.classList.remove("rail-dragging");
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      const onDown = (e: PointerEvent) => {
        if (e.pointerType !== "mouse") return; // touch = native pan
        if (el.scrollHeight <= el.clientHeight) return; // nothing to scroll
        const t = e.target as HTMLElement | null;
        if (t?.closest("button, a, input, textarea, select, [role=button], .nb-row, .desc-more")) return;
        dragging = true;
        moved = false;
        startY = e.clientY;
        startTop = el.scrollTop;
        el.classList.add("rail-dragging");
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      };

      el.addEventListener("pointerdown", onDown);
      cleanups.push(() => {
        el.removeEventListener("pointerdown", onDown);
        onUp();
        cancelAnimationFrame(raf);
        ro.disconnect();
        mo.disconnect();
        window.removeEventListener("resize", scheduleClip);
      });
    }
    return () => cleanups.forEach((c) => c());
  }, []);

  return null;
}
