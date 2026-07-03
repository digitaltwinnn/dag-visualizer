"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
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
  const phoneDock = useStore((s) => s.phoneDock);
  const setPhoneDock = useStore((s) => s.setPhoneDock);

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

  // Stable identity of "whichever Detail is on top" — a node by its hover-pairing key (falls
  // back to its kind so a keyless node still counts as an identity), a snapshot by ordinal. Used
  // ONLY to decide when a new detail should re-arm the hint (below); NOT rendered.
  const topSlot = selStack.find((slot) => cards[slot]?.active);
  const detailIdentity =
    topSlot === "node" ? `node:${hoverKeyOf(inspect) ?? inspect?.kind ?? ""}`
    : topSlot === "snap" && snap ? `snap:${snap.data.ordinal}`
    : null;

  // "Seen" tracking — GLOBAL CONSTRAINT: nothing here ever opens the sheet. `hint` only decides
  // whether the tab/button shows the pulsing dot; the sheet's `open` state is still owned by the
  // user tapping the trigger (RailDock's own state on tablet, `store.phoneDock` on phone).
  // `seen` starts true (arms only once a NEW detail actually lands) and: (1) flips true the
  // instant the panel opens (RailDock's onOpenChange), (2) resets false whenever the active
  // detail's identity changes, or `hasDetail` rises from false → true (a detail arriving where
  // there was none).
  const [seen, setSeen] = useState(true);
  const prevIdentity = useRef<string | null>(null);
  const prevHasDetail = useRef(false);
  useEffect(() => {
    const arrived = detailIdentity !== null && detailIdentity !== prevIdentity.current;
    const rose = hasDetail && !prevHasDetail.current;
    if (arrived || rose) setSeen(false);
    prevIdentity.current = detailIdentity;
    prevHasDetail.current = hasDetail;
  }, [detailIdentity, hasDetail]);

  const hint = hasDetail && !seen;

  // RailDock reports open/close changes here so opening can mark the hint "seen" (tablet: its
  // own internal state; phone: `store.phoneDock`, via `handleDismiss` below) — never the
  // reverse (a pick never sets `open`).
  const handleOpenChange = (next: boolean) => {
    if (next) setSeen(true);
  };

  // Transient re-pulse — mirrors the desktop cards' own `useFlashOnChange`, which flashes on ANY
  // reference change of a pane's `dep` (a new subject, OR the same subject's data updating —
  // e.g. the live snapshot ticking). That flash is invisible while the rail is collapsed, so the
  // tab hint stands in for it: bump `pulseCount` whenever `inspect`, `snap`, or the Context
  // subject (`filter`) changes reference, and RailDock replays a one-shot pulse on the dot. This
  // fires even when `hint` is already false (an already-seen card whose data just changed) — it
  // does NOT resurrect the persistent unseen dot, it's a separate transient animation.
  const [pulseCount, setPulseCount] = useState(0);
  const pulseMounted = useRef(false);
  useEffect(() => {
    if (!pulseMounted.current) {
      pulseMounted.current = true;
      return;
    }
    setPulseCount((n) => n + 1);
  }, [inspect, snap, filter]);

  // Tablet: Context + Detail panes + PickHint together (`content` below), unchanged from Task 3.
  // Phone: the SAME content (Context + Detail panes + PickHint) but hosted in the "Details"
  // bottom sheet (bottom-right button) instead of a side sheet — see below.
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
          <ContextCard />
          {panes}
          {!hasDetail && <PickHint mode={mode} />}
        </div>
      </>
    );
  }

  // Fix wave (auto-open + double-pulse): the phone right rail used to derive its sheet's `open`
  // as `open && hasDetail`. That derivation meant a scene pick (which flips `hasDetail`
  // false→true) could slide the sheet up on its own — an auto-open, violating the no-auto-open
  // invariant. `open` must ALWAYS be purely user-tap-driven (RailDock's own state, or on phone
  // `store.phoneDock` — see below) — never derived from `hasDetail`. `hasDetail`/`hint` still
  // only ever affect the hint dot and the sheet's CONTENT, never its open state. Dismissing the
  // sheet (its own ✕/Escape/grabber) clears whichever pick is on top, mirroring that pane's own
  // × — via `onOpenChange`, which is itself only invoked by RailDock's own tap/close
  // affordances, never by a pick.
  const handleDismiss = (next: boolean) => {
    handleOpenChange(next);
    if (!next) {
      if (topSlot === "snap") setSnap(null);
      else if (topSlot === "node") setInspect(null);
    }
  };

  if (bp === "tablet") {
    // Tablet: unchanged — the right edge tab opening a right-side Sheet, independent of the
    // left "Explore" dock (both can be open at once).
    return (
      <RailDock side="right" label="Details" style={accent} hint={hint} pulseKey={pulseCount} onOpenChange={handleOpenChange}>
        {content}
      </RailDock>
    );
  }

  // Phone: a bottom-RIGHT "Details" button opening a bottom sheet, mutually exclusive with the
  // "Explore" dock via the shared `store.phoneDock` field (see LeftColumn) — never auto-opened
  // by a pick (only the hint dot reacts to `hint`/`pulseCount`; `open` is 100% derived from
  // `phoneDock`, which only a tap (here) or a dismiss (handleDismiss, below) ever writes).
  return (
    <RailDock
      side="right"
      label="Details"
      style={accent}
      trigger="bottom-button"
      sheetSide="bottom"
      hint={hint}
      pulseKey={pulseCount}
      open={phoneDock === "details"}
      onOpenChange={(next) => {
        handleDismiss(next);
        setPhoneDock(next ? "details" : null);
      }}
    >
      {content}
    </RailDock>
  );
}
