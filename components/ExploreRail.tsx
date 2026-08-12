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
//
// ⚠️ HYPER'S FACTS, corrected by the user (2026-08-12) — three claims that read plausibly and are
// wrong: the network is NOT feeless (scalability is the real headline); work is NOT "spread across"
// networks as if sharded — metagraphs are INDEPENDENT and interlinked; and the unit here is a NODE,
// never a "machine" (that word belongs to the ledger's trays). The card must also say what is META
// about a metagraph in plain words — the core keeps a record ABOUT a metagraph's ledger, never its
// contents — because that is the same fact that explains the scaling, so the two belong in one
// breath rather than as a claim and an unrelated boast.
//
// ⚠️ AND IT MUST ANSWER ITS OWN TITLE (user, 2026-08-12). "How the network is built" was answered
// with what the network IS and how big each one gets, which is a different question: what this view
// actually shows is the LAYERS — L0, dL1, cL1 — each with a job inside its own network, and the
// fact that a network runs only the ones it needs (no token → no cL1). The layers are the FACT and
// belong here; the rings they are drawn as are the LOOK and stay out, per the rule above.
//
// ⚠️ GEO STAYS OFF THE DECENTRALIZATION QUESTION ENTIRELY (user, 2026-08-12). "Decentralization is
// a claim, and this is where you can check it" was too bold — location is only ONE input to it (who
// owns the nodes, what they cost, who operates them all matter and none of it is on this globe), so
// the card was answering a broad, contested question with a partial view. The correction is NOT a
// hedged version of the same claim: the word doesn't belong on the card at all, because naming it —
// even to qualify it — is still the card taking up the topic. The copy states the two facts the view
// carries, place and provider, and the axes along which networks differ; the reader does the rest.
// Rule: this card describes what there is to explore, and grades nothing.
const ABOUT: Record<Mode, { title: string; eyebrow: string; lines: string[]; caption?: string }> = {
  hyper: {
    title: "How the network is built",
    eyebrow: "About",
    lines: [
      "Constellation is a Hypergraph, not a blockchain: rather than one chain doing all the work, it is many independent networks, interlinked through a shared core.",
      "Each of those is a metagraph, and what is meta about it is that the core never handles its data — the metagraph keeps its own ledger, and the core keeps only a record about it. So every metagraph runs at its own pace, in parallel with the rest, which is what lets the whole thing scale.",
      "Inside a network the work is split across layers, and every node runs one or more of them: L0 holds the network's own state and seals its snapshots, data L1 takes in what applications write, and currency L1 moves a token — if the network has one at all.",
      "A network runs only the layers it needs, which is where the flexibility shows: some are three nodes doing all of it at once, others a fleet with the roles split apart, and plenty carry no currency layer whatsoever.",
    ],
  },
  geo: {
    title: "Where the network runs",
    eyebrow: "About",
    lines: [
      "Every node sits at the real location it runs from, with the provider hosting it named beside it. Where a network placed itself, and whose hardware it sits on, are two separate facts — and both are here.",
      "Networks differ along both: some keep every node in one country while others reach across continents, and a network spread wide can still rent all of it from one provider. The map and the provider names are what you compare them by.",
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
