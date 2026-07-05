"use client";

import { type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useStore } from "@/src/store/store";
import { filterAccent, metagraphById, CORE_HEX } from "@/src/data/network";
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
import { detailsCards } from "@/components/railCards";
import { useTrayActives } from "@/components/useTrayActives";
import type { TabSignal } from "@/components/RailDock";
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
// "what is this for" orientation lives on the LEFT rail's tool card, not here). EVERY view with
// pickable subjects gets one, view-specific wording — the map is an ALLOW-LIST mirroring the
// engine's pick registry (`_pickablesFor`): hyper/geo/ledger raycast; the flat placeholder views
// (status/transactions/staking) pick nothing → no entry → no hint.
const INVITE: Partial<Record<Mode, string>> = {
  hyper: "Click a hub or node in the hypergraph to inspect it.",
  geo: "Click a node on the globe (or a row in the explorer) to inspect it.",
  ledger: "Click a snapshot block (or a bar in the strip below) to inspect it.",
};

// ONE state-aware hint (user decision 2026-07-05, option c): view + pickability → message, so the
// slot always shows SOME guidance and never a FALSE one. Normally the view's pick-invite above;
// but when the selected network has nothing pickable in this view (geo with 0 locatable nodes —
// e.g. TBC/LEET), inviting a click would be a dead hint, so it turns into the honest variant
// instead. `selNodes` is exactly the set the globe plots + the explorer lists (empty ⇔ nothing
// pickable). "All" with 0 nodes = the data simply hasn't landed yet (boot), not a real empty
// selection → no hint rather than a false one flashing at startup.
function pickHintText(mode: Mode, filter: string, selNodesCount: number): string | null {
  const invite = INVITE[mode];
  if (!invite) return null;
  if (mode === "geo" && selNodesCount === 0) {
    const cfg = metagraphById(filter);
    if (!cfg) return null;
    return `${cfg.ticker || cfg.name} has no locatable nodes — explore it in the Hypergraph view.`;
  }
  return invite;
}
function PickHint({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-2 mt-[2px] mx-1 mb-0 py-0 px-[var(--panel-pad-x)] text-label text-muted-foreground">
      <StandbyHalo /> {text}
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
  const phoneSheetPx = useStore((s) => s.phoneSheetPx);
  const setPhoneSheetPx = useStore((s) => s.setPhoneSheetPx);

  const accent = { ["--filter-accent"]: filterAccent(filter) } as CSSProperties;

  // ── ONE source of truth for the hosted card set (railCards.ts) ──────────────────────────────
  // The manifest derives, from the store, the ordered list of cards this rail hosts + each card's
  // presence and EdgePulse subject. BOTH the rendered Detail panes AND the dock tray read it, so
  // the tray can never drift from what actually renders (the old bug: the tray drew the Context
  // icon even at the "all" filter, where ContextCard renders nothing). The Context card itself
  // stays ALWAYS-mounted below (via <ContextCard/>, which self-nulls on "all") so its EdgePulse
  // survives the dossier ⇄ nothing swap; the manifest only decides its tray-icon presence.
  const manifest = detailsCards({ mode, filter, inspect, snap, selStack });
  const detailPane: Record<string, ReactNode> = {
    // geoLive reads the node from the store; its × is CardHead's shared close like every card.
    node: (
      <CardPane key="node" pick={{ kind: "geoLive" }} eyebrow="Selected node" onClose={() => setInspect(null)} />
    ),
    snap: snap ? (
      <CardPane key="snap" pick={snap} eyebrow="Selected snapshot" onClose={() => setSnap(null)} />
    ) : null,
  };
  // Present Detail cards in the manifest's (recency) order — Context is rendered separately.
  const panes = manifest.filter((c) => c.present && c.kind !== "context").map((c) => detailPane[c.id]);
  const hasDetail = panes.length > 0;

  // The state-aware hint (pickHintText above): normal invite, honest no-pickables variant, or
  // nothing (no detail slot noise while a Detail card is up, and no hint in the pick-less views).
  const selNodes = useStore((s) => s.selNodes);
  const hintText = hasDetail ? null : pickHintText(mode, filter, selNodes.length);

  // ── Dock icon TRAY (tablet/phone) ───────────────────────────────────────────────────────────
  // GLOBAL CONSTRAINT: nothing here ever opens the sheet — the tray is purely visual; `open` is
  // still owned by the user tapping the trigger (RailDock's own state on tablet, `store.phoneDock`
  // on phone). `useTrayActives` (keyed to the manifest) marks a card's icon vivid/heartbeat when
  // its subjectKey changes while the sheet is closed, and bumps `updateKey` per event → RailDock
  // replays the travelling edge pulse. Opening clears all highlights (`onOpenChange`).
  const { actives, updateKey, onOpenChange: onTrayOpenChange } = useTrayActives(manifest);

  // Icon per hosted card comes from the manifest; hue is the tray's own presentation: the node's
  // metagraph hue (or core cyan), everything else the filter accent.
  const nodeHue =
    inspect?.kind === "metanode" ? (inspect.meta ? identityHudHex(inspect.meta.id) : undefined) : CORE_HEX;
  const tray: TabSignal[] = manifest
    .filter((c) => c.present)
    .map((c) => ({
      id: c.id,
      icon: c.icon,
      hue: c.kind === "node" ? nodeHue : filterAccent(filter),
      active: actives.has(c.id),
    }));

  // Tablet: Context + Detail panes + PickHint together (`content` below), unchanged from Task 3.
  // Phone: the SAME content (Context + Detail panes + PickHint) but hosted in the "Details"
  // bottom sheet (bottom-right button) instead of a side sheet — see below.
  const content = (
    <>
      <ContextCard />
      {panes}
      {hintText && <PickHint text={hintText} />}
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
          {hintText && <PickHint text={hintText} />}
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
      <RailDock side="right" label="Details" style={accent} signals={tray} updateKey={updateKey} signalKey={`${mode}|${filter}`} onOpenChange={onTrayOpenChange}>
        {content}
      </RailDock>
    );
  }

  // Phone: the RIGHT half of the persistent bottom bar, mutually exclusive with the "Explore"
  // dock via the shared `store.phoneDock` field (see ExploreRail) — never auto-opened by a pick
  // (only the icon tray reacts to updates; `open` is 100% derived from `phoneDock`,
  // which only a tap (here), a toggle-collapse, or a dismiss (handleDismiss, below) ever writes).
  return (
    <RailDock
      side="right"
      label="Details"
      style={accent}
      trigger="bottom-bar-half"
      sheetSide="bottom"
      signals={tray}
      updateKey={updateKey}
      open={phoneDock === "details"}
      sheetPx={phoneSheetPx}
      onSheetPx={setPhoneSheetPx}
      onOpenChange={(next) => {
        onTrayOpenChange(next);
        setPhoneDock(next ? "details" : null);
      }}
    >
      {content}
    </RailDock>
  );
}
