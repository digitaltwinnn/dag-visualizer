"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { useStore } from "@/src/store/store";
import type { DocPage } from "@/components/views";

// THE DOC OVERLAY (2026-09-04, user: "keep the background AND don't reboot the whole scene").
// /about and /design render as a scrollable document layer on the scene's BARE STAGE — while a
// doc is open the engine runs its flat placeholder state with the parked fleet hidden too
// (Engine's doc fold), so what shows behind the text is background only: the paper cyclorama in
// light, the flat ground in dark. The app's own command bar above, the app's own footer below.
// Opening and closing is a store write (`docPage`), published to the address bar by RouteSync;
// no navigation, no engine teardown.
//
// THE TWO TRANSITIONS ARE SEQUENCED BY SIGNALS, AND TEXT NEVER LONG-FADES (user, 2026-09-04,
// across three observations). Opening from a live 3D view: the gather plays IN FULL (the fleet
// flies to the parked grids like any view exit) and the document holds until the ENGINE's
// boundary signal (`store.docStageReady` — written frame-aligned with the choreography, so
// ?slowmo and low FPS stretch the wait correctly; a wall-clock delay here measurably desynced),
// then enters with the HUD's own text entrance: the short --tempo-roll rise, a quick lift+fade
// that is over before the eye can catch anti-aliased prose mid-blend (the long opacity crawl
// "felt uneasy"). Closing is the mirror: the roll-out IS the doc's OUT phase — `docClosing`
// holds the engine's flat stage until this component's exit completes (it clears the flag), and
// only then does the destination view's entry begin, fleet revealed at the grids for the
// flight. Reduced motion snaps everything; the unmount waits for the roll.
//
// SEO is unchanged by the overlay move: the /about route server-renders AppShell with
// `doc="about"`, which reaches this component as `initial` — the prose is in that route's HTML
// (client components server-render; the dynamic imports below default to SSR and only split the
// chunks). A cold doc load fades in like any other appearance — one entrance, every path.
//
// The `initial` → store ADOPTION is the NetLink mount pattern: SSR and the first client render
// draw from the prop (hydration sees no mismatch), one effect seeds the store and flips
// `adopted`, and from then on the store owns it.
const AboutDoc = dynamic(() => import("@/components/docs/AboutDoc"));
const DesignDoc = dynamic(() => import("@/components/docs/DesignDoc"));

// The one doc column (both documents read it): max-w-3xl is the document reading measure;
// /design's specimen grids wrap rather than widening past it. pt clears the fixed command bar.
const DOC_COLUMN = "relative mx-auto max-w-3xl px-6 pt-[68px] pb-24";

const ROLL_MS = 400; // the entrance/exit roll = --tempo-roll (the CSS half of the pairing)

export default function DocLayer({ initial }: { initial: DocPage | null }) {
  const stored = useStore((s) => s.docPage);
  const setDocPage = useStore((s) => s.setDocPage);
  const [adopted, setAdopted] = useState(false);
  useEffect(() => {
    if (initial) useStore.getState().setDocPage(initial);
    setAdopted(true);
  }, [initial]);
  const page = adopted ? stored : initial;

  // The fade machinery: `render` is what stays MOUNTED (held through the exit fade), `visible`
  // drives the opacity. EVERY appearance fades in on the gather clock — the cold doc load
  // included (user, 2026-09-04: "fade in should work the same way"; it previously showed
  // instantly): `visible` boots false even when the route seeded a page, and the mount effect
  // flips it through the double-rAF like any in-app open. Crawlers are unaffected — the prose
  // is in the HTML regardless of its starting opacity.
  const [render, setRender] = useState<DocPage | null>(initial);
  const [visible, setVisible] = useState(false);
  const stageReady = useStore((s) => s.docStageReady);
  const exitT = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (page) {
      if (exitT.current) { clearTimeout(exitT.current); exitT.current = null; }
      setRender(page);
      // Hold the entrance until the ENGINE says the stage is bare (docStageReady — true by
      // default, false only while a live scene's gather is playing under this document).
      if (!stageReady) return;
      // DOUBLE rAF: a single one fires before the mounted-hidden state has ever been painted
      // (rAF callbacks run ahead of that frame's style/paint), so the class flip coalesced and
      // the rise snapped — measured opacity 1 at 150ms.
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setVisible(true)); });
      return () => { cancelAnimationFrame(raf1); if (raf2) cancelAnimationFrame(raf2); };
    }
    setVisible(false);
    exitT.current = setTimeout(() => {
      exitT.current = null;
      setRender(null);
      // The roll-out finished — release the engine's held stage (the entry begins now).
      useStore.getState().setDocClosing(false);
    }, ROLL_MS);
    return () => { if (exitT.current) { clearTimeout(exitT.current); exitT.current = null; } };
  }, [page, stageReady]);

  // Unmount safety: a torn-down layer must never leave the engine holding the flat stage.
  useEffect(() => () => useStore.getState().setDocClosing(false), []);

  // Escape closes the document — the RAW layer's own gesture, and like there it is one of
  // several routes back (the footer toggles, the bar's view switch, browser back).
  useEffect(() => {
    if (!page) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDocPage(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page, setDocPage]);

  if (!render) return null;
  const Doc = render === "about" ? AboutDoc : DesignDoc;
  return (
    // The scroll viewport: html/body are overflow:hidden for the fixed-canvas app, so the
    // document scrolls in its own fixed box. z-[8]: over the canvas and the (stood-down) HUD,
    // under the footer strip (z-10) and the command bar (z-40), both of which stay live chrome.
    // NO VEIL of its own (user, 2026-09-04 — the background-mix read "brownish"): the engine's
    // bare stage IS the ground, and the panels' glass sits straight on it. pointer-events gate
    // off during the exit fade so a leaving document can't eat the scene's first clicks.
    <div
      className={cn(
        "fixed inset-0 z-[8] overflow-y-auto overscroll-contain",
        // The HUD's text entrance at document scale: a short rise + fade on the roll clock —
        // never a long opacity crawl over prose. The transform lives on THIS fixed container,
        // whose box is inset-0 — its own fixed child (the scrim) re-anchors to it, same box, so
        // nothing shifts (trap 2 stays satisfied for everything outside).
        "transition-[opacity,transform] duration-(--tempo-roll) ease-out motion-reduce:transition-none",
        !visible && "opacity-0 translate-y-3 pointer-events-none",
      )}
      role="region"
      aria-label={render === "about" ? "About" : "Design"}
    >
      {/* The bar's scrim: without it a half-clipped line of prose rides the strip between the
          viewport top and the bar's own glass while scrolling. Fixed, z above the flowing text,
          under the bar. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-[1] h-24"
        style={{
          background:
            "linear-gradient(to bottom, color-mix(in oklch, var(--background) 85%, transparent) 0%, " +
            "color-mix(in oklch, var(--background) 70%, transparent) 55%, transparent 100%)",
        }}
      />
      <div className={DOC_COLUMN}>
        <Doc />
      </div>
    </div>
  );
}
