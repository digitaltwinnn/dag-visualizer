"use client";

import { Fragment, type CSSProperties, type ReactNode } from "react";
import { useStore, type Mode } from "@/src/store/store";
import { filterAccent } from "@/src/data/network";
import GeoExplore from "@/components/GeoExplore";
import HyperExplore from "@/components/HyperExplore";
import LedgerPanel from "@/components/LedgerPanel";
import AboutView from "@/components/AboutView";
import RailThread from "@/components/RailThread";
import { RailShade } from "@/components/RailShade";
import RailDock, { type TabSignal } from "@/components/RailDock";
import { exploreCards } from "@/components/railCards";
import { useBreakpoint } from "@/components/useBreakpoint";

// Per-view "About this view" copy — one orientation card at the top of the left rail in every
// view (collapsed by default). Built views carry no caption; the scaffolded (SOON) views do.
//
// COPY RULE (user, 2026-08-12): About says what you can FIND OUT here and why it is worth
// knowing — never what the view LOOKS like. The user is already looking at it, so a sentence
// spent on honeycomb towers, a "3D chamber" or a trail receding to the left buys nothing (and
// two of those three were factually wrong). It also names no medium: that the scene is 3D is
// visible, not information. The GESTURE belongs to the right rail's ghost hints and the
// explorer's own hint — About must not restate it, which is what had geo telling you to drill
// a country three times on one screen. Paragraph 1 = the network fact this view exists to show;
// paragraph 2 = what to look FOR in it.
const ABOUT: Record<Mode, { title: string; eyebrow: string; lines: string[]; caption?: string }> = {
  hyper: {
    title: "How the network is built",
    eyebrow: "About",
    lines: [
      "Constellation is a Hypergraph, not a blockchain — work is spread across many networks validating at the same time, which is what lets it scale out and stay feeless for the people using it.",
      "Each network runs its own machines but borrows its security from the core. What differs is scale and make-up: some are three machines, some a fleet, and the roles they run decide what the network can actually do.",
    ],
  },
  geo: {
    title: "Where the network runs",
    eyebrow: "About",
    lines: [
      "Decentralization is a claim, and this is where you can check it — every node sits at the real location it runs from.",
      "Concentration is the thing to look for: how much of a network sits in one country, or behind a single hosting provider. Neither shows up in a node count.",
    ],
  },
  ledger: {
    title: "When the network anchors",
    eyebrow: "About",
    lines: [
      "Every few seconds the base ledger seals a moment, and each network's own snapshots are anchored into it. That shared record is what makes their state provable without them having to trust each other.",
      "This is the network's recent past: how often each one anchors, how much it wrote, and what it paid. Busy networks anchor many times a minute; quiet ones leave gaps you can see.",
    ],
  },
  status: {
    title: "Is the network healthy?",
    eyebrow: "About",
    caption: "SOON",
    lines: [
      "Whether the network is healthy right now, and where any trouble is — node uptime, what state each node is in, and how far the software versions have drifted apart.",
      "Version spread is the quiet one to watch: a network running several releases at once is mid-upgrade, or stuck.",
    ],
  },
  transactions: {
    title: "How value moves",
    eyebrow: "About",
    caption: "SOON",
    lines: [
      "Value moving across the network as it happens — $DAG and the metagraphs' own currencies, between addresses.",
      "Trace a single transaction end to end, or read the totals: how much moved, and how many addresses were active doing it.",
    ],
  },
  staking: {
    title: "Who backs the nodes",
    eyebrow: "About",
    caption: "SOON",
    lines: [
      "Who is backing which nodes — delegated $DAG, the nodes it is staked to, and the rewards flowing back.",
      "Stake is consensus weight, so how it concentrates is the thing to watch, and whether that is shifting.",
    ],
  },
};

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
