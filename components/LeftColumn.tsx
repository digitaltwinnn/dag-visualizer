"use client";

import type { CSSProperties } from "react";
import { useStore, type Mode } from "@/src/store/store";
import { filterAccent } from "@/src/data/network";
import GeoExplore from "@/components/GeoExplore";
import LedgerPanel from "@/components/LedgerPanel";
import AboutView from "@/components/AboutView";
import RailThread from "@/components/RailThread";
import RailDock from "@/components/RailDock";
import { useBreakpoint } from "@/components/useBreakpoint";

// Per-view "About this view" copy — one orientation card at the top of the left rail in every
// view (collapsed by default). Built views carry no caption; the scaffolded (SOON) views do.
const ABOUT: Record<Mode, { title: string; eyebrow: string; lines: string[]; caption?: string }> = {
  hyper: {
    title: "How the network is built",
    eyebrow: "Hypergraph · about",
    lines: [
      "Constellation is a Hypergraph, not a blockchain — activity is organized as a DAG, so many parts of the network validate in parallel: horizontally scalable and feeless for users.",
      "The glowing core is the Global L0 (security + settlement); the validator shells around it bundle activity into the global snapshots streaming along the bottom. The orbiting clusters are metagraphs — independent networks that anchor their state into L0 for shared trust.",
    ],
  },
  geo: {
    title: "Where the network runs",
    eyebrow: "Geography · about",
    lines: [
      "Where the network runs — every validator plotted at its real geolocation, with a density heatmap and travelling-packet connection arcs between them.",
      "Drill into a country to see its nodes; filtering a metagraph narrows the map to that network's footprint.",
    ],
  },
  ledger: {
    title: "When the network settles",
    eyebrow: "Snapshots · about",
    lines: [
      "When the network settles — Global L0 produces a snapshot every few seconds, anchoring the metagraphs' own snapshots into shared trust. The 3D chamber stacks the validation layers top-to-bottom, and each global snapshot forms as its layer settles.",
      "The live snapshot sits centre-stage and trails off to the left as it ages; click any snapshot (here or in the strip below) to inspect its fee, size and per-metagraph breakdown.",
    ],
  },
  status: {
    title: "Is the network healthy?",
    eyebrow: "Status · about",
    caption: "SOON",
    lines: [
      "Live health of the network — validator uptime, node states (Ready / waiting / offline), and software-version spread across the Global L0 and the metagraphs.",
      "A single at-a-glance read of whether the network is healthy, and where any trouble is.",
    ],
  },
  transactions: {
    title: "How value moves",
    eyebrow: "Transactions · about",
    caption: "SOON",
    lines: [
      "The money flow across the network — $DAG and the metagraphs' own currencies moving between addresses, visualized as it happens.",
      "Look up and trace individual transactions (à la the DAG explorer), and read the network's economic statistics — value moved, active addresses, and more (t.b.d.).",
    ],
  },
  staking: {
    title: "Who backs the validators",
    eyebrow: "Staking · about",
    caption: "SOON",
    lines: [
      "Delegated staking across the network — who is staked to which validators, total $DAG delegated, and the rewards flowing back.",
      "How stake (and therefore consensus weight) is distributed, and how that shifts over time.",
    ],
  },
};

// Left control rail: the **explore/interact** zone. The global network filter lives in the
// top command bar; the selected-subject dossier now lives in the right rail (`ContextCard`).
// Every view now leads with a collapsed `AboutView` orientation card, above its ONE tool card
// (if any): Geography → GeoExplore (footprint + node browser); Snapshots → LedgerPanel;
// Hypergraph and the scaffolded views have no tool card, just the About card.
export default function LeftColumn() {
  const bp = useBreakpoint();
  const mode = useStore((s) => s.mode);
  const filter = useStore((s) => s.filter);
  const phoneDock = useStore((s) => s.phoneDock);
  const setPhoneDock = useStore((s) => s.setPhoneDock);
  // Theme every card's bullet to the current selection (the explore card is always
  // specific to the active filter).
  const accent = { ["--filter-accent"]: filterAccent(filter) } as CSSProperties;
  const content = (
    <>
      <AboutView {...ABOUT[mode]} />
      {mode === "geo" && <GeoExplore />}
      {mode === "ledger" && <LedgerPanel />}
    </>
  );
  if (bp === "desktop") {
    // The thread is a SIBLING of #leftcol (mirrors the right rail): the rail clips horizontally + can
    // gain an overflow-fade mask, either of which would blank a child thread. It points its ruler
    // ticks OUTWARD into the left margin, toward the screen edge.
    return (
      <>
        <RailThread side="left" />
        <div id="leftcol" style={accent}>
          {content}
        </div>
      </>
    );
  }
  if (bp === "tablet") {
    // Tablet: same content, hosted in the left edge-tab Sheet overlay so the 3D scene keeps
    // full width. The inline #leftcol/.rail-thread path is hidden below 1100px (00-base.css).
    return (
      <RailDock side="left" label="Explore" style={accent}>
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
  return (
    <RailDock
      side="left"
      label="Explore"
      style={accent}
      trigger="bottom-bar-half"
      sheetSide="bottom"
      open={phoneDock === "explore"}
      onOpenChange={(next) => setPhoneDock(next ? "explore" : null)}
    >
      {content}
    </RailDock>
  );
}
