"use client";

import type { CSSProperties } from "react";
import { useStore } from "@/src/store/store";
import { filterAccent } from "@/src/data/network";
import GeoExplore from "@/components/GeoExplore";
import LedgerPanel from "@/components/LedgerPanel";
import PlaceholderPanel from "@/components/PlaceholderPanel";
import RailThread from "@/components/RailThread";
import RailDock from "@/components/RailDock";
import { useBreakpoint } from "@/components/useBreakpoint";

// Per-view tool cards. The scaffolded (not-yet-built) views show a "coming soon" card (SOON);
// Hypergraph shows a static "about" card (the guided Learn tour is being reworked). Same shell
// either way so the four-zone HUD stays consistent.
const PLACEHOLDERS: Record<string, { title: string; eyebrow: string; lines: string[]; caption?: string }> = {
  hyper: {
    title: "Hypergraph",
    eyebrow: "Hypergraph · about",
    caption: "",
    lines: [
      "Constellation is a Hypergraph, not a blockchain — activity is organized as a DAG, so many parts of the network validate in parallel: horizontally scalable and feeless for users.",
      "The glowing core is the Global L0 (security + settlement); the validator shells around it bundle activity into the global snapshots streaming along the bottom. The orbiting clusters are metagraphs — independent networks that anchor their state into L0 for shared trust.",
    ],
  },
  status: {
    title: "Network status",
    eyebrow: "Status · about",
    lines: [
      "Live health of the network — validator uptime, node states (Ready / waiting / offline), and software-version spread across the Global L0 and the metagraphs.",
      "A single at-a-glance read of whether the network is healthy, and where any trouble is.",
    ],
  },
  transactions: {
    title: "Transactions",
    eyebrow: "Transactions · about",
    lines: [
      "The money flow across the network — $DAG and the metagraphs' own currencies moving between addresses, visualized as it happens.",
      "Look up and trace individual transactions (à la the DAG explorer), and read the network's economic statistics — value moved, active addresses, and more (t.b.d.).",
    ],
  },
  staking: {
    title: "Delegated staking",
    eyebrow: "Staking · about",
    lines: [
      "Delegated staking across the network — who is staked to which validators, total $DAG delegated, and the rewards flowing back.",
      "How stake (and therefore consensus weight) is distributed, and how that shifts over time.",
    ],
  },
};

// Left control rail: the **explore/interact** zone. The global network filter lives in the
// top command bar; the selected-subject dossier now lives in the right rail (`ContextCard`).
// This rail renders just the view's ONE tool card: Hypergraph → an "about" card (the guided
// Learn tour is being reworked); Geography → GeoExplore (footprint + node browser); Snapshots
// → the ledger "about" panel; the scaffolded views → a "coming soon" PlaceholderPanel.
export default function LeftColumn() {
  const bp = useBreakpoint();
  const mode = useStore((s) => s.mode);
  const filter = useStore((s) => s.filter);
  // Theme every card's bullet to the current selection (the explore card is always
  // specific to the active filter).
  const accent = { ["--filter-accent"]: filterAccent(filter) } as CSSProperties;
  const placeholder = PLACEHOLDERS[mode];
  const content = (
    <>
      {mode === "geo" && <GeoExplore />}
      {mode === "ledger" && <LedgerPanel />}
      {placeholder && <PlaceholderPanel {...placeholder} />}
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
  // Tablet/phone: same content, hosted in the edge-tab Sheet overlay so the 3D scene keeps
  // full width. The inline #leftcol/.rail-thread path is hidden below 1100px (00-base.css).
  return (
    <RailDock side="left" label="Explore" style={accent}>
      {content}
    </RailDock>
  );
}
