"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useStore } from "@/src/store/store";
import { DOC_ROLL } from "@/src/engine/domain/viewTransition";
import { DOC_PAGES, type DocPage } from "@/components/views";
import RailThread from "@/components/RailThread";

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
// The doc components, keyed by the registry's own DocPage — the one place a new doc's component
// is wired (each stays its own dynamic() call so the chunks split; a computed import path would
// defeat the bundler's static analysis). DOC_PAGES in views.ts carries everything else.
const DOC_COMPONENTS: Record<DocPage, ReturnType<typeof dynamic>> = {
  about: dynamic(() => import("@/components/docs/AboutDoc")),
  design: dynamic(() => import("@/components/docs/DesignDoc")),
};

// The one doc column (both documents read it): max-w-3xl is the document reading measure;
// /design's specimen grids wrap rather than widening past it. pt clears the fixed command bar.
//
// THE COLUMN IS A SHEET (user, 2026-09-04 — "a slight fill and shadow make it look like a
// doc?"): a faint veil fill, hairline side edges and a soft ambient shadow lift the reading
// column off the stage while the margins keep the LIVE scene ground (the continuity the user
// wants). The fill is `--footer-glass` — the app's one VEIL token (cool white at low alpha in
// light, a dark veil in dark), picked after a --background mix at 62% read "too brown" over
// the stage's warm gradient (user, same day; the second brown strike after the full-viewport
// wash) — with a 2px backdrop blur to calm the stage's grid behind prose. min-h-full so a
// short document still reads as one sheet to the fold, not a scrap ending mid-viewport.
const DOC_COLUMN =
  "relative mx-auto max-w-3xl min-h-full px-8 pt-[68px] pb-24 " +
  "bg-[var(--footer-glass)] backdrop-blur-[2px] " +
  "border-x border-border shadow-[0_0_50px_rgba(0,0,0,0.14)]";

// The roll's one JS home is the choreography's own DOC_ROLL (domain/viewTransition — the fleet's
// stage fade reads the same constant, so text and nodes move as one); --tempo-nav is its CSS pair.
const ROLL_MS = DOC_ROLL * 1000;

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
  // The appearance PHASE, tw-animate style (2026-09-04, the RollSwap rework reaching back —
  // user: "do you also need to rework the docs views?"): "hold" = mounted hidden, waiting for
  // the engine's stage (no animation); "in" = the two-beat entrance plays; "out" = the roll-out
  // plays, held by fill-mode-forwards until the ROLL_MS timeout unmounts. Animations carry
  // their own from-state, which deletes the old `visible` flag AND the double-rAF paint dance
  // it needed (a transition only runs from a painted state; an animation just runs). The
  // SEQUENCING JS below is untouched — stageReady, docClosing and the doc→doc timeout are the
  // engine handshake, not animation bookkeeping.
  const [phase, setPhase] = useState<"hold" | "in" | "out">("hold");
  // The document that has RISEN — the doc rails' pulse subject (see their mount below): it
  // changes exactly when a document arrives on screen, so the rails play the view-switch pulse
  // at that moment and not during a roll-out.
  const [arrived, setArrived] = useState<DocPage | null>(null);
  const stageReady = useStore((s) => s.docStageReady);
  const exitT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const renderRef = useRef(render);
  renderRef.current = render;
  useEffect(() => {
    const clearPending = () => {
      if (exitT.current) { clearTimeout(exitT.current); exitT.current = null; }
    };
    const rise = (p: DocPage) => {
      setPhase("in");
      setArrived(p);
    };
    clearPending();
    if (page) {
      // A DOC→DOC SWITCH ROLLS LIKE EVERYTHING ELSE (user, 2026-09-04 — "between about and
      // design it still pops; why is it not behaving consistently?"): the standing document
      // rolls out on the same clock, then the next one rolls in — the one transition grammar,
      // every path.
      if (renderRef.current != null && renderRef.current !== page) {
        setPhase("out");
        exitT.current = setTimeout(() => {
          exitT.current = null;
          setRender(page);
          // The container survives the swap, so the old document's scroll would too.
          box.current?.scrollTo(0, 0);
          rise(page);
        }, ROLL_MS);
        return clearPending;
      }
      setRender(page);
      // Hold the entrance until the ENGINE says the stage is bare (docStageReady — true by
      // default, false only while a live scene's gather is playing under this document).
      if (!stageReady) return clearPending;
      rise(page);
      return clearPending;
    }
    setPhase("out");
    exitT.current = setTimeout(() => {
      exitT.current = null;
      setRender(null);
      setArrived(null);
      setPhase("hold");
      // The roll-out finished — release the engine's held stage (the entry begins now).
      useStore.getState().setDocClosing(false);
    }, ROLL_MS);
    return clearPending;
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
  const Doc = DOC_COMPONENTS[render];
  return (
    <>
      {/* THE DOC'S RAILS ARE THE APP'S OWN RULERS (user, 2026-09-04 — "the rails should just
          sit at the edge of the view like any other view … an existing component, not a guess
          and/or duplication"): the SAME RailThread the desktop rails carry, in standalone mode
          (no rail columns to measure while DocGate has them down, so no card marks — ruler +
          identity spine only, at the exact x the measured branch computes). Mounted OUTSIDE the
          rolling container: the rails are view furniture, not document text, so they hold the
          edges through a doc→doc roll exactly as the desktop threads hold through a view
          switch — and they swap in the same frame DocGate swaps the desktop ones out, so the
          instrument reads as never leaving. `signal` keys the travelling switch-pulse to each
          document's ARRIVAL (the risen page), the effect the rails play on every view change. */}
      <RailThread side="left" standalone signal={arrived ?? ""} />
      <RailThread side="right" standalone signal={arrived ?? ""} />
      {/* The scroll viewport: html/body are overflow:hidden for the fixed-canvas app, so the
          document scrolls in its own fixed box. z-[8]: over the canvas and the (stood-down) HUD,
          under the footer strip (z-10) and the command bar (z-40), both of which stay live chrome.
          NO VEIL of its own (user, 2026-09-04 — the background-mix read "brownish"): the engine's
          bare stage IS the ground, and the panels' glass sits straight on it. pointer-events gate
          off during the exit fade so a leaving document can't eat the scene's first clicks. */}
      <div
      ref={box}
      className={cn(
        "fixed inset-0 z-[8] overflow-y-auto overscroll-contain slim-scroll",
        // TWO-BEAT ARRIVAL (user, 2026-09-04 — "first show the 'page' and then roll in the
        // text"), spoken in tw-animate (the house vocabulary; see the phase note above): this
        // container carries only the SHEET's fade — no transform, so the fixed × strip and
        // scrim keep anchoring to the same inset-0 box (trap 2) — on the short
        // --tempo-doc-sheet beat; the exit keeps the nav clock, whose DOC_ROLL twin also
        // times the unmount + the engine's stage release (the exit boundary must not move).
        // Reduced motion drops the animations and the extra opacity-0 keeps the exit a SNAP
        // (fill-forwards with no animation would hold the sheet visible through the timeout).
        phase === "hold" && "opacity-0 pointer-events-none",
        phase === "in" &&
          "animate-in fade-in duration-(--tempo-doc-sheet) motion-reduce:animate-none",
        phase === "out" &&
          "animate-out fade-out duration-(--tempo-nav) ease-out fill-mode-forwards pointer-events-none motion-reduce:animate-none motion-reduce:opacity-0",
      )}
      role="region"
      aria-label={DOC_PAGES[render].label}
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
        {/* The text's own roll — the arrival's SECOND beat: fill-mode-both holds frame 0
            (hidden) through the [animation-delay:--tempo-doc-sheet] wait, then the rise runs
            on --tempo-doc-rise. The delay is an arbitrary property on purpose — Tailwind's
            delay-* feeds transitions, not tw-animate's animation-delay. The exit drops the
            delay and rides the nav clock so sheet and text leave as one gesture.
            ⚠️ The entrance curve is NOT ease-out (user, 2026-09-04: doubling the duration
            "looks just as fast" — ease-out lands most of the change in the first half-second
            whatever the total, and 16px of travel hid the rest). A restrained-start bezier
            plus 32px of travel keeps the motion VISIBLE through the window; the exit keeps
            ease-out, where front-loading is exactly right. */}
        <div
          className={cn(
            phase === "hold" && "opacity-0",
            phase === "in" &&
              "animate-in fade-in slide-in-from-bottom-8 duration-(--tempo-doc-rise) ease-(--ease-roll) fill-mode-both [animation-delay:var(--tempo-doc-sheet)] motion-reduce:animate-none",
            phase === "out" &&
              "animate-out fade-out slide-out-to-bottom-8 duration-(--tempo-nav) ease-out fill-mode-forwards motion-reduce:animate-none motion-reduce:opacity-0",
          )}
        >
          <Doc />
        </div>
      </div>
      {/* The layer's own dismiss — the RAW layer's rule verbatim (its header comment carries
          the reasoning): the view switch is far away while the layer covers the view it would
          return to, Escape is invisible, and a control ON the surface you want to leave needs
          no hunting. ON THE SHEET, not the viewport (user, 2026-09-04 — "top right of the doc"):
          the fixed strip re-centres the column's own measure and the × sits at its top-right,
          below the command bar's band, pinned there through scrolling. `fixed` inside the
          transformed layer, so it rides the roll as part of the document. */}
      <div className="fixed inset-x-0 top-0 z-20 pointer-events-none">
        <div className="relative mx-auto max-w-3xl">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Close ${DOC_PAGES[render].label}`}
            title={`Close ${DOC_PAGES[render].label}`}
            className="absolute top-[74px] right-2 pointer-events-auto text-muted-foreground hover:text-foreground pointer-coarse:min-h-11 pointer-coarse:min-w-11"
            onClick={() => setDocPage(null)}
          >
            <X aria-hidden />
          </Button>
        </div>
      </div>
      </div>
    </>
  );
}
