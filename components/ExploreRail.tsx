"use client";

import { Fragment, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { useStore } from "@/src/store/store";
import { VIEW_POLICIES } from "@/src/engine/domain/viewPolicy";
import { filterAccent } from "@/src/data/network";
import GeoExplore from "@/components/GeoExplore";
import HyperExplore from "@/components/HyperExplore";
import LedgerPanel from "@/components/LedgerPanel";
import TrendExplore from "@/components/TrendExplore";
import RailThread from "@/components/RailThread";
import { RailShade } from "@/components/RailShade";
import RailDock, { type TabSignal } from "@/components/RailDock";
import { exploreCards } from "@/components/railCards";
import HeightEase from "@/components/HeightEase";
import { useBreakpoint } from "@/components/useBreakpoint";

// Left control rail: the **explore/interact** zone. The global network filter lives in the
// top command bar; the selected-subject dossier now lives in the right rail (`ContextCard`).
// The rail is the view's ONE tool card (if any): Hypergraph → HyperExplore (network → layer
// shell → node); Geography → GeoExplore (footprint + node browser); Snapshots → LedgerPanel;
// History → TrendExplore (the view's controls plus its roster of chart planes); the scaffolded
// view has no tool card and the rail is empty. The About orientation card that led every rail
// from 2026-08-08 RETIRED on 2026-09-28: prose is documentation, not interaction, and its one
// home is /about — the command bar's ABOUT row (topbar/AboutStrip.tsx) is the in-view door.
export default function ExploreRail() {
  const bp = useBreakpoint();
  // growIn arming — the Inspector's laneBooted pattern: the tool slot unmounts entirely on
  // the placeholder view and rejoins on a 3D one; rejoining grows from 0 instead of snapping.
  // ⚠️ DESKTOP ONLY — the inline rail is the one host that persists across the remount. In a
  // SHEET (tablet, phone) the content mounts fresh on every open (Radix portals it), so a
  // growIn there is not a slot joining a lane, it is the card growing from 0 INSIDE a sheet
  // that is itself growing to fit it: two motions, the second chasing the first (user,
  // 2026-09-28: "first it opens, then it moves again to take the height of the card"). Measured
  // at 390×844, the card eased 9 → 469px over ~650ms while the sheet's fit re-targeted three
  // times behind it. The sheet's own entrance IS the arrival there.
  const booted = useRef(false);
  useEffect(() => {
    booted.current = true;
  }, []);
  const mode = useStore((s) => s.mode);
  const filter = useStore((s) => s.filter);
  const phoneDock = useStore((s) => s.phoneDock);
  const setPhoneDock = useStore((s) => s.setPhoneDock);
  const phoneSheetPx = useStore((s) => s.phoneSheetPx);
  const setPhoneSheetPx = useStore((s) => s.setPhoneSheetPx);
  const setSceneCover = useStore((s) => s.setSceneCover);
  // Theme every card's bullet to the current selection (the explore card is always
  // specific to the active filter).
  const accent = { ["--filter-accent"]: filterAccent(filter) } as CSSProperties;

  // ONE source of truth for the hosted card set (railCards.ts): both the rail content AND the dock
  // tray are derived from the same manifest, so they can't disagree about which cards this view
  // hosts. `id` maps to the component to render; the manifest owns presence/order.
  //
  // THE NO-POP RULE READS PER CARD HERE, NOT PER STACK (user, 2026-09-04, second round: a
  // stack-level RollSwap made "things that always exist disappear and re-appear"). The TOOL is
  // genuinely view-scoped (four different explorers, none on "soon"), so it swaps keyed with
  // the house card materialize — no out-beat, so the slot is never held blank.
  const manifest = exploreCards({ mode });
  // Each card rides its own HeightEase (user, 2026-09-04, second round: "the explorer card
  // still jumps … snaps into its new height"): the wrapper sits OUTSIDE the keyed remount —
  // inside it, it would remount with the card and snap — so the slot's height eases from the
  // old card's to the new one's while the arriving card materializes within it. flex-none on
  // the wrapper is the cards' own rule (the rail scrolls; a card never compresses).
  const renderCard: Record<string, ReactNode> = {
    // The card opens EXPANDED on every tier (user, 2026-09-28). Phone opened it collapsed from
    // 2026-09-03 so the sheet read as a compact two-head chooser — About's head and this one —
    // and that reason left with the About card: a sheet holding one card has nothing to choose
    // between, and a collapsed head there is a tap the reader always pays.
    tool: (
      <HeightEase className="flex-none" growIn={booted.current && bp === "desktop"}>
        {/* ⚠️ TRANSFORM-FREE arrival (user, 2026-09-04: About collapsed + a tall explorer
            still "jumps a bit" at the top — animate-card-in's materialize runs
            translateY(5px) scale(0.985), and 0.985 of a 700px expanded list pulls the TOP
            edge visibly). The keyed card fades on the roll clock; the height ease and the
            head's title roll carry the rest of the arrival. */}
        <div key={`tool-${mode}`} className="animate-in fade-in duration-(--tempo-doc-rise) ease-(--ease-roll) delay-(--tempo-roll-lag) fill-mode-both motion-reduce:animate-none">
          {mode === "hyper" ? <HyperExplore />
          : mode === "geo" ? <GeoExplore />
          : mode === "ledger" ? <LedgerPanel />
          : mode === "trend" ? <TrendExplore />
          : null}
        </div>
      </HeightEase>
    ),
  };
  const content = (
    <>
      {manifest
        .filter((c) => c.present)
        .map((c) => (
          <Fragment key={c.id}>{renderCard[c.id]}</Fragment>
        ))}
    </>
  );
  // The dock's icon TRAY (tablet edge tab + phone dock half): the legend of what this sheet hosts,
  // straight from the manifest. The left cards are static tools (constant subjectKeys, no live
  // updates), so no `active` highlights / `updateKey` here — the tray stays a quiet legend.
  const tray: TabSignal[] = manifest
    .filter((c) => c.present)
    .map((c) => ({ id: c.id, icon: c.icon }));
  if (bp === "desktop") {
    // The thread is a SIBLING of #leftcol (mirrors the right rail): the rail clips horizontally + can
    // gain an overflow-fade mask, either of which would blank a child thread. It points its ruler
    // ticks OUTWARD into the left margin, toward the screen edge.
    return (
      <>
        <RailThread side="left" />
        {/* `max-[1099px]:!hidden` + arbitrary width tweaks re-home 16/11-responsive.css (Task 9):
            the safety-net hide below the desktop breakpoint (SSR/first-paint assume desktop, so the
            desktop rail can flash on a narrow viewport before useBreakpoint resolves) and the small-
            laptop / tablet rail-width narrowing. `!` beats the `#leftcol` id rule in globals.css. */}
        <div
          id="leftcol"
          className="max-[1100px]:!w-[224px] max-[860px]:!w-[210px] max-[860px]:!max-h-[calc(100vh-320px)] max-[1099px]:!hidden"
          style={accent}
        >
          <RailShade>{content}</RailShade>
        </div>
      </>
    );
  }
  if (bp === "tablet") {
    // Tablet: same content, hosted in the left edge-tab Sheet overlay so the 3D scene keeps
    // full width. The inline #leftcol/.rail-thread path is hidden below 1100px (globals.css).
    return (
      // `signalKey` = the same subject RailThread pulses on (desktop-only) — RailDock replays the
      // view/filter-switch pulse on the sheet edge / tab edge so tablet keeps the signal.
      <RailDock
        side="left"
        label="Explore"
        style={accent}
        signals={tray}
        signalKey={`${mode}|${filter}`}
        // This sheet OVERLAYS the canvas rather than sitting beside it, so the Engine has to
        // know what it can't see — see `store.sceneCoverL`.
        onCoverPx={(px) => setSceneCover("left", px)}
      >
        {content}
      </RailDock>
    );
  }
  // Phone: the LEFT half of the persistent bottom bar (below the LiveStrip, at the very bottom of
  // the viewport — see 16-responsive-shell.css), instead of the edge tab — a side tab + bottom
  // sheet reads spatially confusing on a narrow phone. `phoneDock` (the store) is the single
  // source of truth for which of the two phone docks (this one, or Inspector's "Details") is
  // open — they can't both be open at once, there's no room to stack two bottom sheets. Tapping
  // this half sets `phoneDock`, which simultaneously closes the Details dock (its own `open`
  // reads the same field); tapping it again while open collapses it (RailDock's own toggle).
  // No `signalKey` here — the view/filter-switch pulse for the phone dock is a single full-width
  // overlay spanning both halves (`PhoneDockSweep`, mounted once in page.tsx), not a per-half prop.
  return (
    <RailDock
      side="left"
      label="Explore"
      style={accent}
      trigger="bottom-bar-half"
      // Thirds whenever the Vitals section is present (VitalsDock gates on the same flag, so the
      // bar's geometry and the middle section's presence cannot disagree).
      barGeom={VIEW_POLICIES[mode].vitalsLane ? "w-1/3 left-0" : undefined}
      // At thirds the tray COMPACTS instead of standing down (2026-09-03, two rounds): the icon
      // legend measured 166px in a 130px section and spilled into the neighbour, but dropping it
      // also dropped the persistent unseen-update cue — trayCompact keeps that as one dot.
      signals={tray}
      trayCompact={VIEW_POLICIES[mode].vitalsLane}
      sheetSide="bottom"
      open={phoneDock === "explore"}
      sheetPx={phoneSheetPx}
      onSheetPx={setPhoneSheetPx}
      onOpenChange={(next) => setPhoneDock(next ? "explore" : null)}
      // The sheet's HEIGHT off the canvas — the Engine shifts the scene up into the band above it
      // (store `sceneCoverBExplore`; `domain/sheetShift.ts` has the design).
      onCoverPx={(px) => setSceneCover("explore", px)}
    >
      {content}
    </RailDock>
  );
}
