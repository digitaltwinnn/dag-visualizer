"use client";

import type { CSSProperties, ReactNode } from "react";
import { useStore, type SelSlot } from "@/src/store/store";
import { filterAccent } from "@/src/data/network";
import InspectorCard from "@/components/InspectorCard";
import { useFlashOnChange } from "@/components/useFlashOnChange";
import type { PickDescriptor } from "@/src/data/types";

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

// Right column — the **facts** rail: a STACK of selected-subject cards, ordered by recency
// (`store.selStack`, most-recent first → on top), so you can hold several selections at once
// (a node AND a snapshot AND, later, more) and the one you picked last sits on top. Each card
// type is one entry in the registry below — add a future card by adding a slot (a store field +
// `setSel`) and an entry here; the stacking, ordering, flashing and empty-hint are all generic.
export default function Inspector() {
  const mode = useStore((s) => s.mode);
  const inspect = useStore((s) => s.inspect);
  const snap = useStore((s) => s.snap);
  const selStack = useStore((s) => s.selStack);
  const filter = useStore((s) => s.filter);
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
          eyebrow="Selected node"
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
          eyebrow="Selected snapshot"
          onClose={() => setSnap(null)}
          ownClose={false}
        />
      ) : null,
    },
  };

  const panes = selStack.filter((slot) => cards[slot]?.active).map((slot) => cards[slot].pane);

  // Nothing selected → a view-appropriate hint keeps the zone present (geo invites a node,
  // ledger a snapshot; hyper + the placeholder views stay empty).
  const hint =
    panes.length > 0
      ? null
      : mode === "geo"
        ? "Pick a node from the browser, or click one on the globe, to inspect it."
        : mode === "ledger"
          ? "Click a snapshot in the bar-chart below to inspect it."
          : null;

  return (
    <div id="rightcol" style={accent}>
      {panes}
      {hint && (
        <aside id="rc-empty" className="panel">
          <span className="insp-eyebrow">Details</span>
          <p className="rc-empty-text">{hint}</p>
        </aside>
      )}
    </div>
  );
}
