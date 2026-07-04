"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useStore, type SelSlot } from "@/src/store/store";
import { filterAccent, CORE_HEX } from "@/src/data/network";
import { identityHudHex } from "@/src/palette/identity";
import { hoverKeyOf } from "@/src/data/hoverSubject";
import { subjectPairing } from "@/components/useSubjectPairing";
import { RIGHT_CARD } from "@/components/CardHead";
import { Card } from "@/components/ui/card";
import InspectorCard from "@/components/InspectorCard";
import ContextCard from "@/components/ContextCard";
import RailThread from "@/components/RailThread";
import RailDock from "@/components/RailDock";
import { useBreakpoint } from "@/components/useBreakpoint";
import { PulseEdge, useEdgePulse } from "@/components/EdgePulse";
import { StandbyHalo } from "@/components/state/StateAtoms";
import type { PickDescriptor } from "@/src/data/types";
import type { Mode } from "@/src/store/store";

// One pane in the right-rail **card stack**. Each pane is its own panel with its own
// "new subject" edge pulse (keyed on its subject) and its own close — rendering every card
// through this component is what makes the stack generic: `useEdgePulse` runs per pane, so
// any number of cards each pulse + close independently.
function CardPane({
  pick,
  eyebrow,
  onClose,
}: {
  pick: PickDescriptor;
  eyebrow: string;
  onClose: () => void;
}) {
  const inspect = useStore((s) => s.inspect);
  const hoverNodeId = useStore((s) => s.hoverNodeId);
  const hoverSnapOrd = useStore((s) => s.hoverSnapOrd);
  const setHoverNodeId = useStore((s) => s.setHoverNodeId);
  const setHoverSnapOrd = useStore((s) => s.setHoverSnapOrd);
  const filter = useStore((s) => s.filter);

  // The pairing lives on the OUTER pane (the rounded card), not an inner wrapper — so the synced
  // hover glow lights the card's rounded edge, and hovering anywhere on the card glows its 3D object.
  // `subjectKey` is the SAME identity that keys the body's title roll-in (node id row / ordinal
  // Odometer), so the title roll and the edge pulse fire together as one "new subject" moment —
  // and it is stable across same-subject data refreshes (no pulse on a re-render, only a new pick).
  let pair;
  let subjectKey: string | number | null;
  if (pick.kind === "snapshot") {
    // Snapshot pairing hue follows the active filter's identity: the selected metagraph's (or
    // the DAG's own) brand hue, or the network cyan for "all" — `filterAccent` already draws
    // that exact line (metagraphById resolves "dag" through the identity map too).
    pair = subjectPairing<number>(hoverSnapOrd, pick.data.ordinal, setHoverSnapOrd, filterAccent(filter));
    subjectKey = pick.data.ordinal;
  } else {
    // geoLive → the selected node, read from the store like GeoLiveCard does.
    const node =
      inspect && (inspect.kind === "l0" || inspect.kind === "l1" || inspect.kind === "metanode")
        ? inspect
        : null;
    const nodeHue = node?.kind === "metanode" && node.meta ? identityHudHex(node.meta.id) : CORE_HEX;
    subjectKey = hoverKeyOf(node);
    pair = subjectPairing<string>(hoverNodeId, subjectKey as string | null, setHoverNodeId, nodeHue);
  }
  const pulseKey = useEdgePulse(subjectKey);

  return (
    // No steady/selected edge state — the edge is purely transient (pulse + hover pairing);
    // a Detail pane exists only while its pick is live, so a permanent edge would just read
    // as a spine, which the design removed.
    <Card asChild className={cn(RIGHT_CARD, "sig-left", pair.className)}>
      <aside
        style={pair.style}
        onMouseEnter={pair.onMouseEnter}
        onMouseLeave={pair.onMouseLeave}
      >
        {/* Every card's × is CardHead's shared ghost-Button close — one baseline close (the node
            card's old hand-rolled × was removed). */}
        <InspectorCard p={pick} eyebrow={eyebrow} onClose={onClose} />
        <PulseEdge pulseKey={pulseKey} rail="right" />
      </aside>
    </Card>
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
    <p className="flex items-center gap-2 mt-[2px] mx-1 mb-0 py-0 px-[var(--panel-pad-x)] text-[12px] text-muted-foreground">
      <StandbyHalo /> {line}
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
      // geoLive reads the node from the store; its × is CardHead's shared close like every card.
      pane: (
        <CardPane
          key="node"
          pick={{ kind: "geoLive" }}
          eyebrow="Selected node"
          onClose={() => setInspect(null)}
        />
      ),
    },
    snap: {
      active: !!snap,
      pane: snap ? (
        <CardPane
          key="snap"
          pick={snap}
          eyebrow="Selected snapshot"
          onClose={() => setSnap(null)}
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

  // Transient re-pulse — mirrors the desktop cards' own `useEdgePulse` edge sweep, which fires on
  // a pane's subject changing (a new node/snapshot/metagraph picked). That sweep is invisible
  // while the rail is collapsed, so the tab hint stands in for it: bump `pulseCount` whenever
  // `inspect`, `snap`, or the Context subject (`filter`) changes reference, and RailDock replays
  // a one-shot pulse on the dot. This
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
    // outside, the thread manages its own top/bottom fade (inline mask, RailThread.tsx) independently.
    return (
      <>
        <RailThread />
        {/* `max-[1099px]:!hidden` + arbitrary width tweaks re-home 16/11-responsive.css (Task 9):
            the safety-net hide below the desktop breakpoint (SSR/first-paint assume desktop) and the
            small-laptop / tablet rail-width narrowing. `!` beats the `#rightcol` id rule in globals.css. */}
        <div
          id="rightcol"
          className="max-[1100px]:!w-[288px] max-[860px]:!w-[min(300px,calc(100vw-32px))] max-[1099px]:!hidden"
          style={accent}
        >
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
  // only ever affect the hint dot and the sheet's CONTENT, never its open state.
  //
  // Dismissing the sheet just COLLAPSES it — it does NOT clear the selection (a closed panel
  // isn't a deselection). This matches the tablet side sheet, and keeps the picks so reopening
  // shows the same stack; a specific pick is cleared via its own pane's × (or a new pick). (An
  // earlier phone-only variant cleared the top pick on dismiss, which was both inconsistent with
  // tablet and lossy when a node AND a snapshot were stacked — only the top one cleared.)

  if (bp === "tablet") {
    // Tablet: unchanged — the right edge tab opening a right-side Sheet, independent of the
    // left "Explore" dock (both can be open at once).
    return (
      <RailDock side="right" label="Details" style={accent} hint={hint} pulseKey={pulseCount} onOpenChange={handleOpenChange}>
        {content}
      </RailDock>
    );
  }

  // Phone: the RIGHT half of the persistent bottom bar, mutually exclusive with the "Explore"
  // dock via the shared `store.phoneDock` field (see ExploreRail) — never auto-opened by a pick
  // (only the hint dot reacts to `hint`/`pulseCount`; `open` is 100% derived from `phoneDock`,
  // which only a tap (here), a toggle-collapse, or a dismiss (handleDismiss, below) ever writes).
  return (
    <RailDock
      side="right"
      label="Details"
      style={accent}
      trigger="bottom-bar-half"
      sheetSide="bottom"
      hint={hint}
      pulseKey={pulseCount}
      open={phoneDock === "details"}
      onOpenChange={(next) => {
        handleOpenChange(next);
        setPhoneDock(next ? "details" : null);
      }}
    >
      {content}
    </RailDock>
  );
}
