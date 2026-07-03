"use client";

import type { CSSProperties, ReactNode } from "react";
import { useStore, type SelSlot } from "@/src/store/store";
import { filterAccent, CORE_HEX } from "@/src/data/network";
import { hex } from "@/src/util/format";
import { hoverKeyOf } from "@/src/data/hoverSubject";
import { subjectPairing } from "@/components/useSubjectPairing";
import { breadcrumbLabel } from "@/src/data/breadcrumb";
import InspectorCard from "@/components/InspectorCard";
import ContextCard from "@/components/ContextCard";
import RailThread from "@/components/RailThread";
import RailDock from "@/components/RailDock";
import { useBreakpoint } from "@/components/useBreakpoint";
import { useFlashOnChange } from "@/components/useFlashOnChange";
import { StandbyHalo } from "@/components/state/StateAtoms";
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
  const inspect = useStore((s) => s.inspect);
  const hoverNodeId = useStore((s) => s.hoverNodeId);
  const hoverSnapOrd = useStore((s) => s.hoverSnapOrd);
  const setHoverNodeId = useStore((s) => s.setHoverNodeId);
  const setHoverSnapOrd = useStore((s) => s.setHoverSnapOrd);

  // The pairing lives on the OUTER pane (the rounded card), not an inner wrapper — so the synced
  // hover glow lights the card's rounded edge, and hovering anywhere on the card glows its 3D object.
  let pair;
  if (pick.kind === "snapshot") {
    pair = subjectPairing<number>(hoverSnapOrd, pick.data.ordinal, setHoverSnapOrd, "var(--core)");
  } else {
    // geoLive → the selected node, read from the store like GeoLiveCard does.
    const node =
      inspect && (inspect.kind === "l0" || inspect.kind === "l1" || inspect.kind === "metanode")
        ? inspect
        : null;
    const nodeHue = node?.kind === "metanode" && node.meta ? hex(node.meta.color) : CORE_HEX;
    pair = subjectPairing<string>(hoverNodeId, hoverKeyOf(node), setHoverNodeId, nodeHue);
  }

  return (
    <aside
      className={"panel rc-pane " + pair.className}
      style={pair.style}
      ref={ref}
      onMouseEnter={pair.onMouseEnter}
      onMouseLeave={pair.onMouseLeave}
    >
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
    <p className="rc-pickhint"><StandbyHalo /> {line}</p>
  );
}

// Right column — the **facts** rail: a STACK of selected-subject cards, ordered by recency
// (`store.selStack`, most-recent first → on top), so you can hold several selections at once
// (a node AND a snapshot AND, later, more) and the one you picked last sits on top. Each card
// type is one entry in the registry below — add a future card by adding a slot (a store field +
// `setSel`) and an entry here; the stacking, ordering, flashing and empty-hint are all generic.
// An **instrument-channel thread** (`RailThread`) runs the rail's outer edge as the identity cue.
export default function Inspector() {
  const bp = useBreakpoint();
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

  const content = (
    <>
      <ContextCard />
      {panes}
      {!hasDetail && <PickHint mode={mode} />}
    </>
  );

  if (bp === "desktop") {
    // RailThread is a SIBLING of #rightcol, not a child: #rightcol gets the `.rail-clip` bottom-fade
    // mask when it overflows, and a mask composites its whole subtree — since the fixed thread doesn't
    // scroll with the rail, that mask's solid band slides off it and blanks the whole spine. Kept
    // outside, the thread manages its own top/bottom fade (13-right-column.css) independently.
    return (
      <>
        <RailThread />
        <div id="rightcol" style={accent}>
          {content}
        </div>
      </>
    );
  }
  // Tablet/phone: same Context + Detail panes + PickHint, hosted in the edge-tab Sheet overlay
  // so the 3D scene keeps full width. NOTE: on phone the Detail panes will move to a dedicated
  // bottom sheet in a follow-up task — for now this keeps the app fully functional at every size.
  return (
    <RailDock side="right" label="Details" style={accent}>
      {content}
    </RailDock>
  );
}
