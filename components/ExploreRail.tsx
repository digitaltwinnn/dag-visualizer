"use client";

import { Fragment, type CSSProperties, type ReactNode } from "react";
import { useStore } from "@/src/store/store";
import { filterAccent } from "@/src/data/network";
import GeoExplore from "@/components/GeoExplore";
import HyperExplore from "@/components/HyperExplore";
import LedgerPanel from "@/components/LedgerPanel";
import AboutView from "@/components/AboutView";
import { ABOUT } from "@/components/aboutCopy";
import RailThread from "@/components/RailThread";
import { RailShade } from "@/components/RailShade";
import RailDock, { type TabSignal } from "@/components/RailDock";
import { exploreCards } from "@/components/railCards";
import { useBreakpoint } from "@/components/useBreakpoint";

// Per-view About copy: ONE home, components/aboutCopy.ts — shared with /about (2026-08-13).
// Left control rail: the **explore/interact** zone. The global network filter lives in the
// top command bar; the selected-subject dossier now lives in the right rail (`ContextCard`).
// Every view now leads with a collapsed `AboutView` orientation card, above its ONE tool card
// (if any): Hypergraph → HyperExplore (network → layer shell → node); Geography → GeoExplore
// (footprint + node browser); Snapshots → LedgerPanel; the scaffolded views have no tool
// card, just the About card.
export default function ExploreRail() {
  const bp = useBreakpoint();
  const mode = useStore((s) => s.mode);
  const filter = useStore((s) => s.filter);
  const phoneDock = useStore((s) => s.phoneDock);
  const setPhoneDock = useStore((s) => s.setPhoneDock);
  const phoneSheetPx = useStore((s) => s.phoneSheetPx);
  const setPhoneSheetPx = useStore((s) => s.setPhoneSheetPx);
  // Theme every card's bullet to the current selection (the explore card is always
  // specific to the active filter).
  const accent = { ["--filter-accent"]: filterAccent(filter) } as CSSProperties;

  // ONE source of truth for the hosted card set (railCards.ts): both the rail content AND the dock
  // tray are derived from the same manifest, so they can't disagree about which cards this view
  // hosts. `id` maps to the component to render; the manifest owns presence/order.
  const manifest = exploreCards({ mode });
  const renderCard: Record<string, ReactNode> = {
    about: <AboutView {...ABOUT[mode]} />,
    tool: mode === "hyper" ? <HyperExplore /> : mode === "geo" ? <GeoExplore /> : mode === "ledger" ? <LedgerPanel /> : null,
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
      <RailDock side="left" label="Explore" style={accent} signals={tray} signalKey={`${mode}|${filter}`}>
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
      sheetSide="bottom"
      signals={tray}
      open={phoneDock === "explore"}
      sheetPx={phoneSheetPx}
      onSheetPx={setPhoneSheetPx}
      onOpenChange={(next) => setPhoneDock(next ? "explore" : null)}
    >
      {content}
    </RailDock>
  );
}
