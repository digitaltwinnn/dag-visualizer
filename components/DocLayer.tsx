"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useStore } from "@/src/store/store";
import type { DocPage } from "@/components/views";

// THE DOC OVERLAY (2026-09-04, user: "keep the background AND don't reboot the whole scene").
// /about and /design render as a scrollable document layer over the LIVE scene — the app's own
// command bar above it, the app's own footer below it, the scene's ground as the backdrop the
// old standalone pages could only fake with a wash. Opening and closing is a store write
// (`docPage`), published to the address bar by RouteSync; no navigation, no engine teardown.
//
// SEO is unchanged by the move: the /about route server-renders AppShell with `doc="about"`,
// which reaches this component as `initial` — the prose is in that route's HTML exactly as
// before (client components server-render; the dynamic imports below default to SSR and only
// code-split the chunks so the app routes don't carry the documents' weight).
//
// The `initial` → store ADOPTION is the NetLink mount pattern: SSR and the first client render
// draw from the prop (hydration sees no mismatch), one effect seeds the store and flips
// `adopted`, and from then on the store owns it — so the footer's toggles and Escape work the
// moment the page is interactive, and closing can't fight the prop.
const AboutDoc = dynamic(() => import("@/components/docs/AboutDoc"));
const DesignDoc = dynamic(() => import("@/components/docs/DesignDoc"));

// The one doc column (both documents read it): max-w-3xl is the document reading measure;
// /design's specimen grids wrap rather than widening past it. pt clears the fixed command bar.
const DOC_COLUMN = "relative mx-auto max-w-3xl px-6 pt-[68px] pb-24";

export default function DocLayer({ initial }: { initial: DocPage | null }) {
  const stored = useStore((s) => s.docPage);
  const setDocPage = useStore((s) => s.setDocPage);
  const [adopted, setAdopted] = useState(false);
  useEffect(() => {
    if (initial) useStore.getState().setDocPage(initial);
    setAdopted(true);
  }, [initial]);
  const page = adopted ? stored : initial;

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

  if (!page) return null;
  const Doc = page === "about" ? AboutDoc : DesignDoc;
  return (
    // The scroll viewport: html/body are overflow:hidden for the fixed-canvas app, so the
    // document scrolls in its own fixed box. z-[8]: over the canvas and the (stood-down) HUD,
    // under the footer strip (z-10) and the command bar (z-40), both of which stay live chrome.
    // NO VEIL of its own (user, 2026-09-04 — the background-mix read "brownish"): while a doc is
    // open the ENGINE is in its flat placeholder state (Engine's effective-view fold), so what
    // shows behind the text is the scene's own bare backdrop — the paper cyclorama in light, the
    // flat ground in dark — and the panels' glass sits straight on it, exactly the "soon" pages'
    // arrangement.
    <div
      className="fixed inset-0 z-[8] overflow-y-auto overscroll-contain"
      role="region"
      aria-label={page === "about" ? "About" : "Design"}
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
