"use client";

import { useEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";
import { Draggable } from "gsap/Draggable";
import { InertiaPlugin } from "gsap/InertiaPlugin";
import { Observer } from "gsap/Observer";
import { useStore } from "@/src/store/store";
import { SHELL_ID } from "@/lib/shellOffset";

gsap.registerPlugin(Draggable, InertiaPlugin, Observer);

// The two-section shell (spec 2026-08-01). The wrapper is `position:fixed; inset:0` WITH a
// transform — a transformed box is the containing block for every `position:fixed` descendant
// (canvas, rails, LiveStrip), and since its box equals the viewport, the existing shell CSS
// works untouched while translating the wrapper carries the whole shell as one unit. The
// LiveStrip is the drag handle (Draggable trigger) + wheel surface (Observer); `store.section`
// is the one source of truth — the strip's chevron and the snap-commit both write it, and this
// component owns the tween that realizes it. TopBar stays OUTSIDE (fixed to the real viewport,
// shared by both sections); portalled UI (sheets, tooltips) doesn't ride the transform — RailDock
// gates its sheets on `section`, LiveStrip portals its tip. Measurements taken INSIDE the wrapper
// carry the translate: `lib/shellOffset.ts` is the correction every such consumer applies.
export default function SectionSlider({ children, divider, dataSection }: { children: ReactNode; divider: ReactNode; dataSection: ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const sec2Ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const sec2 = sec2Ref.current;
    const strip = document.getElementById("livestrip");
    const topbar = document.getElementById("topbar");
    if (!wrap || !sec2 || !strip) return;
    // Read live, not cached: an OS-level motion-preference flip mid-session takes effect the way
    // it does for every CSS-driven animation in the app.
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");

    // The open offset: translate until the strip's top edge lands under the command bar
    // (the strip is section 2's header/way back). Rects are corrected by the live translate
    // so the measure is pose-independent; re-run on resize (event-time work, not per-frame).
    const openY = () => {
      const y = Number(gsap.getProperty(wrap, "y")) || 0;
      const topBottom = topbar?.getBoundingClientRect().bottom ?? 0;
      return -Math.max(0, strip.getBoundingClientRect().top - y - topBottom);
    };
    // The strip floats clear of the shell's bottom edge (`bottom-4`, and a phone-dock offset on
    // phone). Section 2 starts at the strip's BOTTOM, not the shell's — otherwise that offset
    // shows as a sliver of live scene between the divider and the table (64px on phone).
    const stripGap = () => {
      const y = Number(gsap.getProperty(wrap, "y")) || 0;
      return Math.max(0, window.innerHeight - (strip.getBoundingClientRect().bottom - y));
    };
    // Section 2 fills exactly the viewport remainder below the docked strip.
    const size = () => {
      const gap = stripGap();
      sec2.style.marginTop = `${-gap}px`;
      sec2.style.height = `${-openY() + gap}px`;
    };

    const goTo = (section: "scene" | "data") =>
      gsap.to(wrap, { y: section === "data" ? openY() : 0, duration: mq.matches ? 0 : 0.55, ease: "power3.out", overwrite: "auto" });

    // Re-measure AND re-dock. `openY` is pose-independent, but the wrapper's committed `y` is not:
    // after a viewport resize — or the command bar growing/shrinking its attached filter strip,
    // which changes `#topbar`'s height under us — a shell left open would sit at the stale offset
    // with a stale section-2 height. Both are event-time, so re-running the tween is cheap.
    const resync = () => {
      size();
      goTo(useStore.getState().section);
    };
    size();
    window.addEventListener("resize", resync);
    // The command bar's filter strip is a LAYOUT participant that grows the bar (--topbar-extra).
    const topRo = topbar ? new ResizeObserver(resync) : null;
    if (topbar && topRo) topRo.observe(topbar);

    // External writers (the strip chevron, wheel below) drive the tween through the store.
    const unsub = useStore.subscribe((s, prev) => {
      if (s.section !== prev.section) goTo(s.section);
    });

    // Commit the section the drag/throw landed nearer to; if it's unchanged, still snap home.
    const commit = (y: number) => {
      const target: "scene" | "data" = Math.abs(y - openY()) < Math.abs(y) ? "data" : "scene";
      const st = useStore.getState();
      if (st.section !== target) st.setSection(target);
      else goTo(target);
    };

    const [drag] = Draggable.create(wrap, {
      type: "y",
      trigger: strip,
      // The WHOLE strip is the handle — bars/buttons inside still click on a sub-threshold press.
      dragClickables: true,
      inertia: !mq.matches,
      onPress(this: Draggable) { this.applyBounds({ minY: openY(), maxY: 0 }); },
      snap: (v: number) => (Math.abs(v - openY()) < Math.abs(v) ? openY() : 0),
      // `isThrowing` is a Draggable PROPERTY, not a method — no inertia throw → settle now.
      onDragEnd(this: Draggable) { if (!this.isThrowing) commit(this.y); },
      onThrowComplete(this: Draggable) { commit(this.y); },
    });

    // Wheel on the strip = the fallback gesture (down descends to the table, up returns).
    const obs = Observer.create({
      target: strip,
      type: "wheel",
      preventDefault: true,
      tolerance: 10,
      onDown: () => useStore.getState().setSection("data"),
      onUp: () => useStore.getState().setSection("scene"),
    });

    return () => {
      window.removeEventListener("resize", resync);
      topRo?.disconnect();
      unsub();
      drag.kill();
      obs.kill();
      gsap.killTweensOf(wrap);
    };
  }, []);

  // Whichever section is off-screen is `inert`: nothing in it takes focus or a pointer event
  // while the other one is presented (both sections are full of real controls — rails and
  // canvas up here, a sortable table down there). The DIVIDER is deliberately outside both
  // boundaries: the strip is section 2's header and the only way back, so it stays live in
  // either pose.
  const section = useStore((s) => s.section);

  return (
    // The inline identity transform is REQUIRED from first paint: it flips the fixed children's
    // containing block to this wrapper before anything renders, so geometry never jumps when
    // GSAP later writes the same property.
    <div ref={wrapRef} id={SHELL_ID} className="fixed inset-0 will-change-transform" style={{ transform: "translateY(0px)" }}>
      {/* A plain div — no transform/filter/will-change — so it does NOT become a containing
         block for the fixed scene shell inside it; it exists only to carry `inert`. */}
      <div inert={section === "data"}>{children}</div>
      {divider}
      <section
        ref={sec2Ref}
        id="datasection"
        aria-label="Raw data"
        inert={section !== "data"}
        className="absolute top-full inset-x-0 overflow-hidden bg-background"
      >
        {dataSection}
      </section>
    </div>
  );
}
