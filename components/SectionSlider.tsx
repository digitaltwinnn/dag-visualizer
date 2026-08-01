"use client";

import { useEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";
import { Draggable } from "gsap/Draggable";
import { InertiaPlugin } from "gsap/InertiaPlugin";
import { Observer } from "gsap/Observer";
import { useStore } from "@/src/store/store";

gsap.registerPlugin(Draggable, InertiaPlugin, Observer);

// The two-section shell (spec 2026-08-01). The wrapper is `position:fixed; inset:0` WITH a
// transform — a transformed box is the containing block for every `position:fixed` descendant
// (canvas, rails, LiveStrip), and since its box equals the viewport, the existing shell CSS
// works untouched while translating the wrapper carries the whole shell as one unit. The
// LiveStrip is the drag handle (Draggable trigger) + wheel surface (Observer); `store.section`
// is the one source of truth — the strip's chevron and the snap-commit both write it, and this
// component owns the tween that realizes it. TopBar stays OUTSIDE (fixed to the real viewport,
// shared by both sections); portalled UI (sheets, tooltips) doesn't ride the transform — RailDock
// gates its sheets on `section`, LiveStrip portals its tip.
export default function SectionSlider({ children, dataSection }: { children: ReactNode; dataSection: ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const sec2Ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const sec2 = sec2Ref.current;
    const strip = document.getElementById("livestrip");
    if (!wrap || !sec2 || !strip) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // The open offset: translate until the strip's top edge lands under the command bar
    // (the strip is section 2's header/way back). Rects are corrected by the live translate
    // so the measure is pose-independent; re-run on resize (event-time work, not per-frame).
    const openY = () => {
      const y = Number(gsap.getProperty(wrap, "y")) || 0;
      const topBottom = document.getElementById("topbar")?.getBoundingClientRect().bottom ?? 0;
      return -Math.max(0, strip.getBoundingClientRect().top - y - topBottom);
    };
    // Section 2 fills exactly the viewport remainder below the docked strip.
    const size = () => { sec2.style.height = `${-openY()}px`; };
    size();
    window.addEventListener("resize", size);

    const goTo = (section: "scene" | "data") =>
      gsap.to(wrap, { y: section === "data" ? openY() : 0, duration: reduced ? 0 : 0.55, ease: "power3.out", overwrite: "auto" });

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
      inertia: !reduced,
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
      window.removeEventListener("resize", size);
      unsub();
      drag.kill();
      obs.kill();
    };
  }, []);

  return (
    // The inline identity transform is REQUIRED from first paint: it flips the fixed children's
    // containing block to this wrapper before anything renders, so geometry never jumps when
    // GSAP later writes the same property.
    <div ref={wrapRef} className="fixed inset-0 will-change-transform" style={{ transform: "translateY(0px)" }}>
      {children}
      <section ref={sec2Ref} id="datasection" aria-label="Raw data" className="absolute top-full inset-x-0 overflow-hidden bg-background">
        {dataSection}
      </section>
    </div>
  );
}
