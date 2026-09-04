"use client";

import { useEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";
import { X } from "lucide-react";
import { useStore } from "@/src/store/store";
import { Button } from "@/components/ui/button";

// The two-section shell (spec 2026-08-01; **re-designed 2026-08-01** — the raw table SURFACES out
// of the scene instead of the shell sliding off the top).
//
// The old mechanism translated the whole fixed shell up by a viewport height, so the raw table read
// as a second PAGE that replaced the scene — navigation, with a drag/wheel gesture the 3D camera
// controls quietly compete with (user). The table is not a second page: it is the RAW DATA LAYER
// UNDER the view you are looking at. So the two poses are now a DEPTH change on one screen, driven
// by one discrete switch in the command bar (the light/dark-mode idiom, user):
//
//   scene → data : the HUD (rails, cards, overlays) fades out, the SCENE recedes — scaled back and
//                  dimmed, still live behind the glass — and the raw layer rises out of that depth
//                  (0.94 → 1, transparent → opaque) into the exact band the rails occupied.
//   data → scene : the reverse; the layer sinks back into the scene and the HUD returns.
//
// Nothing translates off-screen any more: the command bar, the LiveStrip and the scene all stay
// exactly where they were, which is what makes it read as one instrument gaining a layer rather
// than a page swap.
//
// The wrapper stays `position:fixed; inset:0` WITH a transform — a transformed box is the
// containing block for every `position:fixed` descendant (the canvas + the rails), so the existing
// shell CSS works untouched and the WebGL buffer stays viewport-sized while the whole scene scales
// as one composited unit (a pure transform: no resize, no re-render, no engine work). The HUD sits
// in its own child div animated by OPACITY ONLY — opacity makes a stacking context, NOT a
// containing block, so the fixed rails inside it keep resolving against the wrapper.
//
// The raw layer is a SIBLING of the wrapper (it must not inherit the scene's fade) and so is the
// bottom lane — where the lane mounts at all (Snapshots only, see `BottomStream`) it stays live in
// both poses, so it belongs to neither. TopBar stays
// outside as before (it hosts the RAW switch); portalled UI (sheets, tooltips) doesn't ride the
// transform — RailDock gates its sheets on `section`, LiveStrip portals its tip.
export const SHELL_ID = "shell";

/** How far back the scene sits while the raw layer is up — small enough to read as depth, not as a
 *  zoom-out; dim enough that table text stays legible over the busiest view (the hypergraph core). */
const SCENE_BACK = 0.92;
const SCENE_DIM = 0.26;

export default function SectionShell({
  scene,
  children,
  strip,
  raw,
}: {
  /** The 3D canvas — a direct child of the transformed wrapper (it recedes, it does not hide). */
  scene: ReactNode;
  /** The HUD: rails, overlays, everything that hides while the raw layer is up. */
  children: ReactNode;
  /** The bottom lane (`BottomStream`) — outside both poses, and live wherever it mounts. */
  strip: ReactNode;
  /** The per-view raw data table. */
  raw: ReactNode;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const rawRef = useRef<HTMLElement>(null);
  const tl = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => {
    const shell = shellRef.current;
    const hud = hudRef.current;
    const layer = rawRef.current;
    if (!shell || !hud || !layer) return;
    // Read live, not cached: an OS-level motion-preference flip mid-session takes effect the way
    // it does for every CSS-driven animation in the app.
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");

    const go = (section: "scene" | "data") => {
      tl.current?.kill(); // retarget mid-flight: build fresh from wherever the layers are now
      // Reduced motion collapses the whole choreography to an instant swap — the depth change is
      // pure motion, so there is nothing to degrade to (unlike the signal language's blink).
      const d = (s: number) => (mq.matches ? 0 : s);
      const t = gsap.timeline();
      if (section === "data") {
        t.set(layer, { visibility: "visible" })
          .to(hud, { opacity: 0, duration: d(0.26), ease: "power2.in" }, 0)
          .to(shell, { scale: SCENE_BACK, opacity: SCENE_DIM, duration: d(0.55), ease: "power3.inOut" }, 0)
          // `fromTo`, not `to`: the layer always rises from the same depth, even when the switch is
          // flipped back mid-sink and this timeline retargets from a half-sunk pose.
          .fromTo(
            layer,
            { opacity: 0, scale: 0.94, yPercent: 1.5 },
            { opacity: 1, scale: 1, yPercent: 0, duration: d(0.55), ease: "power3.out" },
            d(0.16),
          );
      } else {
        t.to(layer, { opacity: 0, scale: 0.96, yPercent: 1, duration: d(0.3), ease: "power2.in" }, 0)
          .set(layer, { visibility: "hidden" })
          .to(shell, { scale: 1, opacity: 1, duration: d(0.5), ease: "power3.out" }, d(0.1))
          .to(hud, { opacity: 1, duration: d(0.4), ease: "power2.out" }, d(0.2));
      }
      tl.current = t;
    };

    // The store is the one source of truth; a section committed before mount (HMR, a future deep
    // link) is applied without animation on the first frame.
    if (useStore.getState().section === "data") {
      gsap.set(shell, { scale: SCENE_BACK, opacity: SCENE_DIM });
      gsap.set(hud, { opacity: 0 });
      gsap.set(layer, { visibility: "visible", opacity: 1, scale: 1 });
    }

    const unsub = useStore.subscribe((s, prev) => {
      if (s.section !== prev.section) go(s.section);
    });

    // Escape returns to the scene — the switch is a small target and the raw layer covers the view.
    // Ignored while a text field has focus (a future table search box) so it never steals another
    // surface's dismiss.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || useStore.getState().section !== "data") return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      useStore.getState().setSection("scene");
    };
    window.addEventListener("keydown", onKey);

    return () => {
      unsub();
      window.removeEventListener("keydown", onKey);
      tl.current?.kill();
    };
  }, []);

  // Whichever layer is not presented is `inert`: nothing in it takes focus or a pointer event
  // (both are full of real controls — rails and canvas up here, a sortable table down there).
  // The STRIP is deliberately in NEITHER boundary: the live lane stays live in both poses.
  const section = useStore((s) => s.section);

  return (
    <>
      {/* The inline identity transform is REQUIRED from first paint: it flips the fixed children's
          containing block to this wrapper before anything renders, so geometry never jumps when
          GSAP later writes the same property. The background is the SCENE's own ground token, not
          the page's paper: during boot the canvas sits at opacity 0, so this is the colour the
          loading screen stands on — body's `--background` there made boot open on the HUD's paper
          and then jump to the scene ground as the canvas faded in (user, 2026-08-29). Painted here
          rather than on `body` so /about and /design keep the paper. */}
      <div ref={shellRef} id={SHELL_ID} className="fixed inset-0 will-change-transform bg-[var(--scene-ground)]" style={{ transform: "translateY(0px)" }}>
        {scene}
        {/* A plain div — no transform/filter/will-change, and OPACITY ONLY from the timeline — so
            it does NOT become a containing block for the fixed rails inside it. */}
        <div ref={hudRef} inert={section === "data"}>
          {children}
        </div>
      </div>

      {/* The raw layer: fixed into exactly the band the rails occupy (the same `--rail-top` /
          `--topbar-extra` / `--bottom-reserve` / `--footer-h` tokens), edge-aligned with the command
          bar, wearing the app's own glass (`.ig-panel`). z-9 puts it over the receded scene and under
          the strip (z-10, where the strip mounts) and the command bar (z-40). It starts
          `visibility:hidden` so
          it is out of the paint and hit-test path entirely until it surfaces. The reserve FALLBACKS
          are 0, matching the token's own static default — the lane is Snapshots-only, so "no
          `--bottom-reserve` yet" means no lane, not the ledger's band. */}
      <section
        ref={rawRef}
        id="datasection"
        aria-label="Raw data"
        inert={section !== "data"}
        className={
          "ig-panel fixed z-9 overflow-hidden left-4 right-4 min-[1100px]:left-[26px] min-[1100px]:right-[26px] " +
          "top-[calc(var(--rail-top)+var(--topbar-extra,0px))] bottom-[calc(var(--bottom-reserve,0px)+var(--footer-h,0px))] " +
          // Phone adds the FOOTER ROW's own height: the row floats over the scene's bottom edge by
          // design (--footer-h zeroes on phone), but this layer is a DATA pane — measured, the
          // lozenge sat on the channel pane's hash rows. One token, shared with SiteFooter.
          "max-[700px]:bottom-[calc(var(--phone-dock-h,56px)+var(--bottom-reserve,0px)+var(--footer-phone-h,22px))]"
        }
        style={{ visibility: "hidden", willChange: "transform, opacity" }}
      >
        {raw}
        {/* The layer's own dismiss — the third way back (the command bar's RAW switch and Escape
            are the other two; all three call the same `setSection("scene")`, so the depth timeline
            can't diverge). The switch is far away in the top-right of the command bar while the
            layer covers the view, and Escape is invisible: a control ON the surface you want to
            leave is the one that needs no hunting. The house card-close treatment — the ghost ×,
            here labelled for the layer rather than a selection. */}
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Close the raw data layer"
          title="Close the raw data layer"
          // The coarse-pointer arms grow the 24px ghost to the 44px touch floor AND re-anchor it
          // (top-4→1.5, right-3→0.5) so the × GLYPH stays where the fine-pointer one sits — grown
          // in place, the box's centre drifted 10px down-left onto the table header's AGE cell.
          className="absolute top-4 right-3 z-20 text-muted-foreground hover:text-foreground pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:top-1.5 pointer-coarse:right-0.5"
          onClick={() => useStore.getState().setSection("scene")}
        >
          <X aria-hidden />
        </Button>
      </section>

      {strip}
    </>
  );
}
