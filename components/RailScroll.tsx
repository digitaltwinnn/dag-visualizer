"use client";

import { useEffect } from "react";
import { shellOffsetY } from "@/lib/shellOffset";

// Grab-and-drag scrolling on the rails. Tablets already pan natively (CSS `touch-action: pan-y`
// + momentum); this adds the same feel for a MOUSE — press on a rail's non-interactive area and
// drag to scroll the cards up/down. A small movement threshold keeps ordinary clicks working, and
// interactive targets (buttons, links, node rows) never start a drag.
//
// `#leftcol`/`#rightcol` only exist in the DESKTOP breakpoint (`ExploreRail`/`Inspector` render
// `RailDock` instead below ~1100px) — so crossing the tablet/desktop boundary during a session
// unmounts and later REMOUNTS them as brand-new DOM nodes. This component itself is mounted once,
// unconditionally, for the app's whole lifetime (`page.tsx`), so a one-shot `getElementById` +
// observer setup would keep watching the ORIGINAL (now-detached) node forever after a breakpoint
// round-trip — `.rail-clip` then never re-toggles on the live rail, so a rail that grows past the
// bottom strip's band is never faded/masked and paints fully opaque over `LiveStrip` (bug: the
// strip "disappears" behind an unclipped rail). Fixed by watching `document.body` for `#leftcol`/
// `#rightcol` being added/removed and (re)attaching the per-rail setup each time the live element
// changes identity, instead of resolving it once.
export default function RailScroll() {
  useEffect(() => {
    // id -> the element it's currently attached to + its cleanup. Tracked by ELEMENT IDENTITY
    // (not just id presence) so a same-id swap — old node removed and a new one added, which
    // React can do without ever leaving the id "absent" in between — is detected and reattached.
    const active = new Map<string, { el: HTMLElement; cleanup: () => void }>();

    const attach = (id: string, el: HTMLElement) => {
      // Toggle `.rail-clip` (the bottom fade mask + its scroll RUNWAY padding) only while this
      // rail's CONTENT actually extends down into the chart's band — otherwise a short rail
      // would be masked to nothing. The class itself adds `--bottom-reserve` of padding (the
      // runway that lets the last card scroll clear of the fade), so the measure must EXCLUDE
      // that padding or applying the class would re-trigger itself and never release. Content
      // height (scrollHeight minus the applied runway) vs the space above the band is
      // scroll-position-independent, so the toggle can't flip while the user scrolls. rAF-debounced.
      let raf = 0;
      const syncClip = () => {
        raf = 0;
        const reserve = parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue("--bottom-reserve"),
        ) || 0;
        const r = el.getBoundingClientRect();
        const runway = el.classList.contains("rail-clip") ? reserve + 12 : 0; // globals.css .rail-clip
        const contentH = el.scrollHeight - runway;
        // Space above the band, NO tolerance: any entry into the chart band fades (a +24px
        // slack let the rail overlap the chart unfaded — user bug; the content-height measure
        // is DOM-change-driven, so borderline flicker isn't a concern the way it was for the
        // old rect-based measure). The rect is corrected by the two-section shell's live
        // translate: the rail and the strip ride it together, so the comparison is against the
        // SHELL's height, not the viewport — uncorrected, a measure taken while section 2 is
        // presented reads a huge `avail`, drops `.rail-clip`, and re-opens the unmasked-rail
        // overlap bug on the way back.
        const avail = window.innerHeight - reserve - (r.top - shellOffsetY());
        el.classList.toggle("rail-clip", reserve > 0 && contentH > avail);
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
        if (t?.closest("button, a, input, textarea, select, [role=button], .nb-row")) return;
        dragging = true;
        moved = false;
        startY = e.clientY;
        startTop = el.scrollTop;
        el.classList.add("rail-dragging");
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      };

      el.addEventListener("pointerdown", onDown);
      active.set(id, {
        el,
        cleanup: () => {
          el.removeEventListener("pointerdown", onDown);
          onUp();
          cancelAnimationFrame(raf);
          ro.disconnect();
          mo.disconnect();
          window.removeEventListener("resize", scheduleClip);
        },
      });
    };

    // (Re)sync which rails are currently attached against which elements actually exist in the
    // DOM right now — runs at mount and every time the DOM under <body> changes shape (breakpoint
    // swaps the whole rail subtree in/out). Cheap: a no-op unless an id's element actually changed.
    const sync = () => {
      for (const id of ["leftcol", "rightcol"]) {
        const el = document.getElementById(id);
        const current = active.get(id);
        if (current && current.el !== el) {
          // Either gone, or replaced by a different node (a same-id remount) — tear down the old
          // attachment either way; a fresh `el` (if any) gets attached below.
          current.cleanup();
          active.delete(id);
        }
        if (el && !active.has(id)) attach(id, el);
      }
    };

    sync();
    const bodyMo = new MutationObserver(sync);
    bodyMo.observe(document.body, { childList: true, subtree: true });

    return () => {
      bodyMo.disconnect();
      active.forEach(({ cleanup }) => cleanup());
      active.clear();
    };
  }, []);

  return null;
}
