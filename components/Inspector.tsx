"use client";

import type { CSSProperties, ReactNode } from "react";
import { useStore, type SelSlot } from "@/src/store/store";
import { filterAccent } from "@/src/data/network";
import { breadcrumbLabel } from "@/src/data/breadcrumb";
import InspectorCard from "@/components/InspectorCard";
import ContextCard from "@/components/ContextCard";
import RailThread from "@/components/RailThread";
import { useFlashOnChange } from "@/components/useFlashOnChange";
import type { PickDescriptor } from "@/src/data/types";
import type { Mode } from "@/src/store/store";

// One pane in the right-rail **card stack**. Each pane is its own panel with its own
// "content updated" flash (keyed on its subject) and its own close — rendering every card
// through this component is what makes the stack generic: `useFlashOnChange` runs per pane, so
// any number of cards each flash + close independently.
function CardPane({
  dep,
  pick,
  eyebrow,
  onClose,
  ownClose,
}: {
  dep: unknown;
  pick: PickDescriptor;
  eyebrow: string;
  onClose: () => void;
  ownClose: boolean; // the card already renders its own close (e.g. the node card's gel-clear ×)
}) {
  const ref = useFlashOnChange(dep);
  return (
    <aside className="panel rc-pane" ref={ref}>
      {!ownClose && (
        <button className="rc-close" title="Close" onClick={onClose}>
          ×
        </button>
      )}
      <div className="rc-content">
        <InspectorCard p={pick} eyebrow={eyebrow} />
      </div>
    </aside>
  );
}

// A slim pick-invite for the empty Detail slot — one muted line + the cyan node-halo. NOT a card:
// the right rail is the FACTS scope, so when nothing is selected it stays quiet (the view's own
// "what is this for" orientation lives on the LEFT rail's tool card, not here). Placeholder views
// have no invite → nothing shows.
const INVITE: Partial<Record<Mode, string>> = {
  geo: "Click a node on the globe (or a row in the explorer) to inspect it.",
  ledger: "Click a snapshot in the bar-chart below to inspect it.",
};
function PickHint({ mode }: { mode: Mode }) {
  const line = INVITE[mode];
  if (!line) return null;
  return (
    <p className="rc-pickhint">
      <span className="rc-vd-halo" aria-hidden /> {line}
    </p>
  );
}

// Right column — the **facts** rail: a STACK of selected-subject cards, ordered by recency
// (`store.selStack`, most-recent first → on top), so you can hold several selections at once
// (a node AND a snapshot AND, later, more) and the one you picked last sits on top. Each card
// type is one entry in the registry below — add a future card by adding a slot (a store field +
// `setSel`) and an entry here; the stacking, ordering, flashing and empty-hint are all generic.
// An **instrument-channel thread** (`RailThread`) runs the rail's outer edge as the identity cue.
export default function Inspector() {
  const inspect = useStore((s) => s.inspect);
  const snap = useStore((s) => s.snap);
  const selStack = useStore((s) => s.selStack);
  const filter = useStore((s) => s.filter);
  const mode = useStore((s) => s.mode) as Mode;
  const setInspect = useStore((s) => s.setInspect);
  const setSnap = useStore((s) => s.setSnap);

  const accent = { ["--filter-accent"]: filterAccent(filter) } as CSSProperties;
  const isNode = inspect?.kind === "l0" || inspect?.kind === "l1" || inspect?.kind === "metanode";

  // The card registry: one entry per selection slot. A slot contributes a card only while its
  // selection is active; `selStack` decides the order.
  const cards: Record<SelSlot, { active: boolean; pane: ReactNode }> = {
    node: {
      active: !!isNode,
      // geoLive reads the node from the store and renders its own gel-clear × (ownClose).
      pane: (
        <CardPane
          key="node"
          dep={inspect}
          pick={{ kind: "geoLive" }}
          eyebrow={breadcrumbLabel("node", filter)}
          onClose={() => setInspect(null)}
          ownClose
        />
      ),
    },
    snap: {
      active: !!snap,
      pane: snap ? (
        <CardPane
          key="snap"
          dep={snap}
          pick={snap}
          eyebrow={breadcrumbLabel("snap", filter)}
          onClose={() => setSnap(null)}
          ownClose={false}
        />
      ) : null,
    },
  };

  const panes = selStack.filter((slot) => cards[slot]?.active).map((slot) => cards[slot].pane);
  const hasDetail = panes.length > 0;

  return (
    <div id="rightcol" style={accent}>
      <RailThread />
      <ContextCard />
      {panes}
      {!hasDetail && <PickHint mode={mode} />}
    </div>
  );
}
