"use client";

import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import { useStore } from "@/src/store/store";
import { VIEW_POLICIES } from "@/src/engine/domain/viewPolicy";
import { displayNetwork } from "@/src/data/unlisted";
import { applyClickActions } from "@/src/store/applyClickActions";
import { filterAccent } from "@/src/data/network";
import { identityHudCss } from "@/src/palette/identity";
import { hoverKeyOf } from "@/src/data/hoverSubject";
import { compositionGroups } from "@/src/data/composition";
import { subjectPairing } from "@/components/useSubjectPairing";
import CardHead, { RailPane } from "@/components/CardHead";
import InspectorCard from "@/components/InspectorCard";
import ContextCard from "@/components/ContextCard";
import RailThread from "@/components/RailThread";
import { RailShade } from "@/components/RailShade";
import RailDock from "@/components/RailDock";
import RailPager from "@/components/RailPager";
import HeightEase from "@/components/HeightEase";
import { useBreakpoint } from "@/components/useBreakpoint";
import { usePointerCoarse } from "@/components/usePointerCoarse";
import { PulseEdge, useEdgePulse } from "@/components/EdgePulse";
import { detailsCards, ladderSlotIds, ladderLevelOfSlot, type RailCard } from "@/components/railCards";
import { useLadderFocus } from "@/components/useLadderFocus";
import { useTrayActives } from "@/components/useTrayActives";
import { countryToggleActions, cohortToggleActions, compositionToggleActions } from "@/src/engine/domain/pickActions";
import { CountryTitle, CountryAside, CountryCard, ProviderTitle, ProviderCard, ProviderAside, CompositionTitle, CompositionCard, CompositionAside } from "@/components/inspector/cards";
import MetaSnapPane from "@/components/inspector/MetaSnapPane";
import type { TabSignal } from "@/components/RailDock";
import type { PickDescriptor } from "@/src/data/types";
import type { Mode } from "@/src/store/store";
import type { CohortSel, CompositionSel } from "@/src/engine/domain/focusLadder";

// Luminance stepping (card-redesign 2026-08-08): unboxed ancestor entries dim with their distance
// from the materialized box — the nearest parent is almost lit, the coarsest faintest — so the
// path reads as a dimmer→bright run ending at the box. (The old RUNG_STEP width step-back is
// retired: all slots share ONE fixed width, and depth moved to the thread's connector reach.)
const ENTRY_DIM_STEP = 0.14;
const ENTRY_DIM_FLOOR = 0.55;

// One pane in the right-rail **card stack**. Each pane is its own panel with its own
// "new subject" edge pulse (keyed on its subject) and its own close — rendering every card
// through this component is what makes the stack generic: `useEdgePulse` runs per pane, so
// any number of cards each pulse + close independently.
function CardPane({
  pick,
  eyebrow,
  onClose,
  collapsed,
  onToggle,
}: {
  pick: PickDescriptor;
  eyebrow: string;
  onClose: () => void;
  // CONTROLLED collapse from the ladder lane (ancestors rest collapsed); omitted → InspectorCard
  // falls back to its own local +/−.
  collapsed?: boolean;
  onToggle?: () => void;
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
    const nodeHue = identityHudCss(node?.kind === "metanode" && node.meta ? node.meta.id : "dag");
    subjectKey = hoverKeyOf(node);
    pair = subjectPairing<string>(hoverNodeId, subjectKey as string | null, setHoverNodeId, nodeHue);
  }
  const pulseKey = useEdgePulse(subjectKey);

  return (
    // No steady/selected edge state — the edge is purely transient (pulse + hover pairing);
    // a Detail pane exists only while its pick is live, so a permanent edge would just read
    // as a spine, which the design removed. `entry` = the card-redesign's collapsed tier: an
    // ancestor rung sheds its glass box entirely and rests as a one-line thread entry.
    <RailPane
      entry={collapsed}
      className={pair.className}
      style={pair.style}
      onMouseEnter={pair.onMouseEnter}
      onMouseMove={pair.onMouseMove}
      onMouseLeave={pair.onMouseLeave}
      onFocus={pair.onFocus}
      onBlur={pair.onBlur}
    >
      {/* Every card's × is CardHead's shared ghost-Button close — one baseline close (the node
          card's old hand-rolled × was removed). */}
      <InspectorCard p={pick} eyebrow={eyebrow} onClose={onClose} collapsed={collapsed} onToggle={onToggle} />
      <PulseEdge pulseKey={pulseKey} rail="right" />
    </RailPane>
  );
}

// The COUNTRY and PROVIDER (internal id: cohort) panes — the geo focus ladder's two coarse rungs.
// Neither `store.country` (a bare cc code) nor `store.cohort` (a `CohortSel`) is a PickDescriptor,
// so they don't fit CardPane's `pick`-dispatch above; rendering them directly from the store
// channel here (same head/body split, same RIGHT_CARD frame, same close-through-the-executor
// rule) is the smaller change than widening PickDescriptor + InspectorCard's switch for two
// kinds that only this rail ever shows. See the task report for this call.
function CountryPane({ cc, onClose, collapsed, onToggle }: { cc: string; onClose: () => void; collapsed: boolean; onToggle: () => void }) {
  const hoverCountry = useStore((s) => s.hoverCountry);
  const setHoverCountry = useStore((s) => s.setHoverCountry);
  const filter = useStore((s) => s.filter);
  // Same channel GeoExplore's own country rows pair on, so hovering this card previews the
  // border on the globe and vice versa. The HUE follows the active filter (user, 2026-08-02):
  // every right-rail card's edge signal now speaks the rail's scope colour — the hardcoded
  // structural cyan here (a PLACE, not an identity) read as a broken card next to its
  // metagraph-hued siblings once a network was committed. `filterAccent` still gives cyan on "all".
  const pair = subjectPairing<string>(hoverCountry, cc, setHoverCountry, filterAccent(filter));
  const pulseKey = useEdgePulse(cc);
  return (
    <RailPane entry={collapsed} className={pair.className} style={pair.style} onMouseEnter={pair.onMouseEnter} onMouseMove={pair.onMouseMove} onMouseLeave={pair.onMouseLeave} onFocus={pair.onFocus} onBlur={pair.onBlur}>
      <CardHead
        eyebrow="Country"
        title={<CountryTitle cc={cc} />}
        aside={<CountryAside cc={cc} />}
        titleKey={cc}
        onClose={onClose}
        collapsed={collapsed}
        onToggle={onToggle}
      />
      {!collapsed && <CountryCard cc={cc} />}
      <PulseEdge pulseKey={pulseKey} rail="right" />
    </RailPane>
  );
}

function ProviderPane({ sel, onClose, collapsed, onToggle }: { sel: CohortSel; onClose: () => void; collapsed: boolean; onToggle: () => void }) {
  const selNodes = useStore((s) => s.selNodes);
  const setHoverCohort = useStore((s) => s.setHoverCohort);
  const hoverGroup = useStore((s) => s.hoverGroup);
  const setHoverGroup = useStore((s) => s.setHoverGroup);
  const filter = useStore((s) => s.filter);
  const subjectKey = `${sel.cc}|${sel.city}|${sel.isp}`;
  const pulseKey = useEdgePulse(subjectKey);
  // TWO channels, one gesture: `hoverCohort` carries the member ids (the whole 3D honeycomb
  // stack glows together) and `hoverGroup` carries the group's scalar KEY, which is what
  // `subjectPairing` can compare — so this card pairs BIDIRECTIONALLY with its explorer row
  // exactly like the country/node/network cards do (user, 2026-08-02: the group cards were the
  // odd ones out, lighting nothing in the rail opposite).
  const pair = subjectPairing<string>(hoverGroup, subjectKey, setHoverGroup, filterAccent(filter));
  const ids = useMemo(
    () =>
      selNodes
        .filter((r) => {
          const geo = "geo" in r.pick ? r.pick.geo : undefined;
          return r.cc === sel.cc && (r.city || null) === sel.city && (geo?.isp || null) === sel.isp;
        })
        .map((r) => hoverKeyOf(r.pick))
        .filter((k): k is string => !!k),
    [selNodes, sel.cc, sel.city, sel.isp],
  );
  return (
    <RailPane
      entry={collapsed}
      className={pair.className}
      style={pair.style}
      onMouseEnter={() => {
        pair.onMouseEnter();
        setHoverCohort(ids);
      }}
      onMouseLeave={() => {
        pair.onMouseLeave();
        setHoverCohort(null);
      }}
      onFocus={() => {
        pair.onFocus();
        setHoverCohort(ids);
      }}
      onBlur={() => {
        pair.onBlur();
        setHoverCohort(null);
      }}
    >
      <CardHead
        eyebrow="Provider"
        title={<ProviderTitle sel={sel} />}
        aside={<ProviderAside sel={sel} />}
        titleKey={subjectKey}
        onClose={onClose}
        collapsed={collapsed}
        onToggle={onToggle}
      />
      {!collapsed && <ProviderCard sel={sel} />}
      <PulseEdge pulseKey={pulseKey} rail="right" />
    </RailPane>
  );
}

// Hyper's twin of ProviderPane: the committed COMPOSITION group (make-up × network). Same
// reasoning for living here rather than in InspectorCard's `pick` switch (a `CompositionSel` is
// not a PickDescriptor), and the same two-channel hover coupling — `hoverCohort` carries the
// member ids for the 3D glow, `hoverGroup` the scalar key the row pairing compares.
function CompositionPane({ sel, onClose, collapsed, onToggle }: { sel: CompositionSel; onClose: () => void; collapsed: boolean; onToggle: () => void }) {
  const selNodes = useStore((s) => s.selNodes);
  const setHoverCohort = useStore((s) => s.setHoverCohort);
  const hoverGroup = useStore((s) => s.hoverGroup);
  const setHoverGroup = useStore((s) => s.setHoverGroup);
  const subjectKey = `${sel.netId}|${sel.key}`;
  const pulseKey = useEdgePulse(subjectKey);
  // The pairing hue is the group's NETWORK identity — the same expression its explorer row and
  // this card's own IdentityDot use (the DAG reads structural cyan). Not `filterAccent`: the two
  // ends of one pairing must light in the same hue, and the row is the fixed end.
  const pair = subjectPairing<string>(
    hoverGroup,
    subjectKey,
    setHoverGroup,
    identityHudCss(sel.netId),
  );
  // The SAME grouping the explorer rows and the Engine's glow resolution use — one helper, so
  // the card, the row and the 3D highlight always speak about the same machines.
  const ids = useMemo(
    () =>
      (compositionGroups(selNodes).find((g) => g.key === sel.key)?.rows ?? [])
        .map((r) => hoverKeyOf(r.pick))
        .filter((k): k is string => !!k),
    [selNodes, sel.key],
  );
  return (
    <RailPane
      entry={collapsed}
      className={pair.className}
      style={pair.style}
      onMouseEnter={() => {
        pair.onMouseEnter();
        setHoverCohort(ids);
      }}
      onMouseLeave={() => {
        pair.onMouseLeave();
        setHoverCohort(null);
      }}
      onFocus={() => {
        pair.onFocus();
        setHoverCohort(ids);
      }}
      onBlur={() => {
        pair.onBlur();
        setHoverCohort(null);
      }}
    >
      <CardHead
        eyebrow="Composition"
        title={<CompositionTitle sel={sel} />}
        aside={<CompositionAside sel={sel} />}
        titleKey={subjectKey}
        onClose={onClose}
        collapsed={collapsed}
        onToggle={onToggle}
      />
      {!collapsed && <CompositionCard sel={sel} />}
      <PulseEdge pulseKey={pulseKey} rail="right" />
    </RailPane>
  );
}

// A GHOST card — the hint state of a Detail slot (user design, 2026-07-10; replaces the single
// floating pick-invite). Every card the current view CAN produce is always visible: populated
// with its subject, or as this quiet placeholder saying what to interact with. AS SUBTLE AS
// POSSIBLE (user refinement): ONE line — kind mark · slot name · instruction — dashed hairline,
// slim vertical pad, no halo/animation, so the possibility space reads at a glance without the
// rail losing its calm. Availability + copy come from the rail manifest (railCards.ts), the
// same single source of truth the dock trays read.
const GHOST_EYEBROW: Record<string, string> = {
  context: "Metagraph", country: "Country", cohort: "Provider", composition: "Composition", node: "Node", snap: "Global snapshot",
  metaSnap: "Metagraph snapshot",
};
export function GhostCard({ card }: { card: RailCard }) {
  const Icon = card.icon;
  const label = GHOST_EYEBROW[card.id] ?? card.id;
  return (
    // UNBOXED (card-redesign 2026-08-08): the ghost sheds its dashed Card frame entirely — the
    // rail's boxes now mean "you are here", so an empty slot must not be a box at all. It rests
    // as a quiet hint LINE in the entry lane; the thread's HOLLOW dot (via `data-ghost`) is its
    // marker. `.rail-entry` keeps it in the thread's query.
    <aside
      data-ghost=""
      aria-label={`${label}: nothing selected yet`}
      className="rail-entry relative block w-auto pointer-events-auto px-[18px] py-2 min-h-0 flex-none"
    >
      <p className="m-0 flex items-start gap-2.5 text-label text-muted-foreground/80">
        <Icon
          aria-hidden
          className="size-3.5 flex-none mt-[1px] text-[var(--filter-accent,var(--primary))] opacity-45"
        />
        {/* fixed label column (fits the longest slot name, "METAGRAPH") so the instruction
            text starts at the SAME x on every ghost card (user) */}
        <span className="flex-none w-[86px] mt-[2px] text-micro tracking-caps uppercase opacity-80">{label}</span>
        <span className="min-w-0 italic">{card.hint}</span>
      </p>
    </aside>
  );
}

// NO rail-top toolbar (user 2026-08-09, removing the last of it): the cards ARE the controls. Every
// head is a disclosure toggle, so a collapse-all button is a second way to say what a click already
// says, and its × was the coarsest card's own × — clearing the ladder from the top rung cascades
// down anyway. A toolbar in the rail's margin is chrome the grammar doesn't need; the pile speaks
// for itself. Don't grow it back.

// Right column — the **facts** rail: a DESCENT-SPINE LADDER of selected-subject cards (variant-A
// redesign, 2026-07-19). The focus-ladder rungs (network → country → provider → node in geo;
// network → snapshot → metagraph snapshot → node in ledger; network → composition → node in
// hyper) render in a `.rail-ladder` lane
// (`store.selStack`, most-recent first → on top), so you can hold several selections at once
// (a node AND a snapshot AND, later, more) and the one you picked last sits on top. Each card
// type is one entry in the registry below — add a future card by adding a slot (a store field +
// `setSel`) and an entry here; the stacking, ordering, flashing and empty-hint are all generic.
// An **instrument-channel thread** (`RailThread`) runs the rail's outer edge as the identity cue.
export default function Inspector() {
  const bp = useBreakpoint();
  const inspect = useStore((s) => s.inspect);
  const snap = useStore((s) => s.snap);
  const metaSnap = useStore((s) => s.metaSnap);
  const country = useStore((s) => s.country);
  const cohort = useStore((s) => s.cohort);
  const composition = useStore((s) => s.composition);
  const filter = useStore((s) => s.filter);
  const mode = useStore((s) => s.mode) as Mode;

  const phoneDock = useStore((s) => s.phoneDock);
  const setPhoneDock = useStore((s) => s.setPhoneDock);
  const phoneSheetPx = useStore((s) => s.phoneSheetPx);
  const setSceneCover = useStore((s) => s.setSceneCover);
  const setPhoneSheetPx = useStore((s) => s.setPhoneSheetPx);

  const accent = { ["--filter-accent"]: filterAccent(filter) } as CSSProperties;

  // ── ONE source of truth for the hosted card set (railCards.ts) ──────────────────────────────
  // The manifest derives, from the store, the ordered list of cards this rail hosts + each card's
  // presence and EdgePulse subject. BOTH the rendered Detail panes AND the dock tray read it, so
  // the tray can never drift from what actually renders (the old bug: the tray drew the Context
  // icon even at the "all" filter, where ContextCard renders nothing). The Context card itself
  // stays ALWAYS-mounted below (via <ContextCard/>, which self-nulls on "all") so its EdgePulse
  // survives the dossier ⇄ nothing swap; the manifest only decides its tray-icon presence.
  const selNodes = useStore((s) => s.selNodes);
  const coarse = usePointerCoarse();
  const manifest = detailsCards({
    mode, filter, inspect, snap, country, cohort, composition, metaSnap, coarse,
    selNodesCount: selNodes.length,
    filterLabel: displayNetwork(filter)?.ticker ?? null, // one lookup — catalog + the unlisted pseudo-network
  });

  // ── The descent-spine ladder collapse model (variant-A, 2026-07-19) ──────────────────────────
  // The facts rail's focus-ladder rungs render in a lane, coarsest→finest, indented one step per
  // level. Only the FOCUSED rung (the finest committed one) rests expanded; its committed
  // ANCESTORS auto-collapse to eyebrow+title — that's what makes the containment read at a glance.
  // A per-slot store override (`railCollapse`, written by the card's own +/− or the rail-top
  // minimize/expand controls) beats the auto default; a non-ladder card (snapshot) defaults open.
  const railCollapse = useStore((s) => s.railCollapse);
  const setRailCollapse = useStore((s) => s.setRailCollapse);
  const setRailCollapseMany = useStore((s) => s.setRailCollapseMany);
  const requestFocusRung = useStore((s) => s.requestFocusRung);
  const ladderIds = ladderSlotIds(mode);
  const presentOf = (id: string) => manifest.find((c) => c.id === id)?.present ?? false;
  // The focus rung comes from the shared derivation the EXPLORE rail reads too (`focusSlotId`),
  // so the row emphasis over there and the collapse/halo over here can't disagree.
  const focusId = useLadderFocus();
  const autoCollapsed = (id: string) => ladderIds.includes(id) && presentOf(id) && id !== focusId;
  const effCollapsed = (id: string) => railCollapse[id] ?? autoCollapsed(id);
  // Publish which slot is the BOX (store.boxedCard) — the same `present && !effCollapsed` that
  // renders it, so channel and render can't disagree (the data-tier lesson). The subject
  // callout reads it to mirror the box exactly as the camera does: re-boxing an ancestor card
  // (clicking a committed node's hub) steps the scene label up with it (user, 2026-08-15).
  const boxedId = ladderIds.find((id) => presentOf(id) && !effCollapsed(id)) ?? null;
  const setBoxedCard = useStore((s) => s.setBoxedCard);
  useEffect(() => {
    setBoxedCard(boxedId);
    return () => setBoxedCard(null);
  }, [boxedId, setBoxedCard]);
  // ONE BOX AT A TIME (card-redesign 2026-08-08): the rail's grammar is "the box = you are here",
  // so manually expanding an entry re-materializes IT as the box and dissolves whichever box was
  // open — single-open accordion semantics across the present ladder rungs, written as overrides
  // in one store update. Collapsing the open box just closes it (no box open is a legal rest).
  const presentLadderIds = ladderIds.filter(presentOf);
  const toggleCollapse = (id: string) => {
    const next = !effCollapsed(id);
    if (!next && ladderIds.includes(id)) {
      setRailCollapseMany({
        ...Object.fromEntries(presentLadderIds.filter((x) => x !== id).map((x) => [x, true])),
        [id]: false,
      });
    } else {
      setRailCollapse(id, next);
    }
    // THE CAMERA FRAMES THE BOXED RUNG (user, 2026-08-09: "when we click the card, can we also
    // update the view camera position, we do the same when we click a row in the explorer"). Only
    // on OPEN, and only for a real rung — closing a box leaves no subject to frame, and the
    // snapshot slots aren't rungs (no pose of their own). The Engine re-walks its own ladder from
    // this rung, so the card lands the pose its explorer row would have, without re-applying the
    // row's actions — those are TOGGLES, and feeding a committed rung back through one would
    // DESELECT it. Nothing is committed or released here, so the finest selection stands.
    if (!next) {
      const level = ladderLevelOfSlot(id);
      if (level) requestFocusRung(level);
    }
  };
  const cx = (id: string) => ({ collapsed: effCollapsed(id), onToggle: () => toggleCollapse(id) });

  // The overrides are scoped to ONE selection moment (user, 2026-08-02: "only in geo it minimises
  // the parent card, not in the other views"). They were permanent: expanding the Metagraph card
  // once wrote `railCollapse.context = false`, which then beat the auto rule FOREVER and in EVERY
  // view — so the rail looked like it auto-collapsed in the view where the user hadn't touched a
  // +/− and not in the ones where they had. A new selection is a new moment, so every override is
  // dropped whenever the committed ladder changes (subject identity, not just depth) and the auto
  // "only the focus rung is open" default governs again. Within one selection the +/− still holds.
  const following = useStore((s) => s.following);
  const selectionKey = [
    mode,
    filter,
    country ?? "",
    cohort ? `${cohort.cc}|${cohort.city}|${cohort.isp}` : "",
    composition ? `${composition.netId}|${composition.key}` : "",
    inspect ? hoverKeyOf(inspect) ?? "" : "",
    // While FOLLOWING, the auto-advancing ordinals are NOT a new selection moment — the heartbeat
    // must not drop the user's +/− overrides every ~4s (item 8; advanceSnap already keeps the
    // recency stack still for the same reason). Guards BOTH live-advanced cards: the global
    // (advanceSnap) AND the metagraph snapshot (advanceMetaSnap — found live 2026-08-08: its
    // unguarded ordinal re-materialized the focus card on every heartbeat in live metagraph mode).
    following ? (snap ? "live" : "") : snap?.data.ordinal ?? "",
    following ? (metaSnap ? "live" : "") : metaSnap ? `${metaSnap.metaId}:${metaSnap.ordinal}` : "",
  ].join("§");
  // Arms HeightEase's growIn for slots that JOIN the lane after boot (false on the first
  // render pass, true on every later one — a mounting slot's wrapper then eases from 0
  // instead of shoving the pile in one frame).
  const laneBooted = useRef(false);
  useEffect(() => {
    laneBooted.current = true;
  }, []);
  const lastSelection = useRef(selectionKey);
  const lastMode = useRef(mode);
  const modeEnteredAt = useRef(0);
  useEffect(() => {
    if (lastSelection.current === selectionKey) return;
    lastSelection.current = selectionKey;
    const modeChanged = lastMode.current !== mode;
    lastMode.current = mode;
    // Read the live overrides rather than closing over them: `railCollapse` changes on every
    // +/− too, and this effect must fire on a SELECTION change only.
    const staleNulls = Object.fromEntries(Object.keys(useStore.getState().railCollapse).map((id) => [id, null]));
    // EXPANDED STATE SURVIVES A VIEW SWITCH (user, 2026-09-04 — reversing 2026-08-08's
    // scene-first entry, which collapsed the whole ladder on arrival: with every rung's height
    // now EASING, the collapse-and-reopen cycle was the "node card size jumps between views"
    // itself). A switch is ARRIVAL machinery, not a new selection moment — so through the mode
    // change and its grace window the overrides are left exactly as they stand: the boundary's
    // ancestry re-derive (`viewEntryActions`) and the ledger's live-follow entry are selection
    // changes, but dropping the +/− state for them would re-collapse what the user had open.
    // Only a selection change AFTER the window is a user gesture, and that still resets to the
    // auto only-the-focus-rung-is-open default exactly as before.
    // ⚠️ The freeze is EXPLICIT, not an absence of writes (found live, first cut): the
    // boundary's re-derive lands its commits one after another, and with no overrides the
    // auto default follows the FOCUS — which tracks the last arrival commit, so the box
    // drifted onto the provider mid-choreography while the node card the user had open fell
    // back to an entry. Snapshotting the departure state into explicit overrides at the mode
    // flip pins what is open and closed; the arrival can then shuffle focus freely under an
    // unchanged pile, and the first post-window selection drops the snapshot like any other
    // override set.
    const ENTRY_GRACE_MS = 4200; // ≥ the ~3.9s 3D↔3D choreography
    if (modeChanged) {
      modeEnteredAt.current = Date.now();
      // Open = "is a PRESENT box right now" — a not-yet-present slot's autoCollapsed is
      // false (ghosts aren't collapsed), so a bare effCollapsed snapshot pinned the arriving
      // ancestor slots OPEN and the re-derive materialized three boxes at once (measured).
      setRailCollapseMany({
        ...staleNulls,
        ...Object.fromEntries(ladderIds.map((id) => [id, !(presentOf(id) && !effCollapsed(id))])),
      });
      return;
    }
    if (Date.now() - modeEnteredAt.current < ENTRY_GRACE_MS) return;
    if (Object.keys(staleNulls).length) setRailCollapseMany(staleNulls);
  }, [selectionKey, setRailCollapseMany]); // eslint-disable-line react-hooks/exhaustive-deps -- mode/ladderIds ride selectionKey (mode is a component of it)

  const detailPane: Record<string, ReactNode> = {
    // Country/provider toggle CLOSED through the same tested table a row re-click runs — the ×
    // is the ladder's own step-back, not a bespoke clear (countryToggleActions also drops any
    // finer rung first, matching the zoom-level rule).
    country: country ? (
      <CountryPane
        key="country"
        cc={country}
        onClose={() => applyClickActions(countryToggleActions(country, { country, hasInspect: !!inspect, cohort }))}
        {...cx("country")}
      />
    ) : null,
    cohort: cohort ? (
      <ProviderPane
        key="cohort"
        sel={cohort}
        onClose={() => applyClickActions(cohortToggleActions(cohort, { cohort, hasInspect: !!inspect }))}
        {...cx("cohort")}
      />
    ) : null,
    composition: composition ? (
      <CompositionPane
        key="composition"
        sel={composition}
        onClose={() =>
          applyClickActions(compositionToggleActions(composition, { composition, hasInspect: !!inspect, filter }))
        }
        {...cx("composition")}
      />
    ) : null,
    // geoLive reads the node from the store; its × is CardHead's shared close like every card.
    node: (
      <CardPane key="node" pick={{ kind: "geoLive" }} eyebrow="Node" onClose={() => applyClickActions([{ kind: "inspect", pick: null }])} {...cx("node")} />
    ),
    snap: snap ? (
      <CardPane key="snap" pick={snap} eyebrow="Global snapshot" onClose={() => applyClickActions([{ kind: "snapshot", pick: null }])} {...cx("snap")} />
    ) : null,
    // The metagraph-snapshot tile: a card slot with no ladder rung (spec §7.1), so its × just
    // clears its own channel — there is no coarser rung for it to step back to.
    metaSnap: metaSnap ? (
      <MetaSnapPane key="metaSnap" onClose={() => applyClickActions([{ kind: "metaSnap", sel: null }])} {...cx("metaSnap")} />
    ) : null,
  };

  // ── The desktop LADDER LANE + the flat tablet/phone stack ────────────────────────────────────
  // Ladder slots render in a lane, in display order (coarsest→finest), ALL AT ONE FIXED WIDTH
  // (card-redesign 2026-08-08 — the RUNG_STEP width step-back is retired). Hierarchy is carried by
  // STATE CONTRAST along the fixed order: the focus rung is the ONE materialized glass box, its
  // committed ancestors rest as unboxed entries dimming with distance (ENTRY_DIM_STEP), ghosts are
  // quiet hint lines below. Since the SLAB (`.rail-ladder`, globals.css) the committed rungs also
  // ABUT — no gap, hairline seams, squared interior corners — so the ancestry and the box read as
  // one pile. That is a physical stack, NOT the retired in-lane descent spine (which
  // drew a line in the thread's own vocabulary and gave the rail two instruments): nothing is drawn,
  // the cards simply touch. It splits the labour — THE STACK CARRIES DEPTH, THE THREAD CARRIES
  // STATE (hollow ghost / solid populated / solid+halo focus, see RailThread).
  // `data-depth`/`data-focus` are the thread's read; the slab keys off `data-tier` alone. Context is
  // special: ALWAYS mounted (self-nulling on "all") so its EdgePulse survives the dossier⇄nothing
  // swap — so its rung always renders ContextCard, plus the context ghost when nothing's committed.
  const entryDim = (id: string): number | undefined => {
    if (!presentOf(id) || !effCollapsed(id)) return undefined;
    const pi = presentLadderIds.indexOf(id);
    if (pi < 0) return undefined;
    // Distance to the open box (the focus rung when present, else the finest present rung).
    const anchor = focusId && presentLadderIds.includes(focusId) ? presentLadderIds.indexOf(focusId) : presentLadderIds.length - 1;
    const dist = Math.abs(anchor - pi);
    return Math.max(ENTRY_DIM_FLOOR, 1 - ENTRY_DIM_STEP * dist);
  };
  const ladderLane = (
    <div className="rail-ladder flex flex-col">
      {ladderIds.map((id, depth) => {
        const card = manifest.find((c) => c.id === id);
        if (!card) return null;
        const body: ReactNode =
          id === "context" ? (
            <>
              <ContextCard {...cx("context")} />
              {!card.present && card.hint != null && <GhostCard card={card} />}
            </>
          ) : card.present ? (
            detailPane[id]
          ) : card.hint != null ? (
            <GhostCard card={card} />
          ) : null;
        if (!body) return null;
        // The rung's PRESENTATION TIER, stated on the wrapper for the slab CSS (globals.css) —
        // `entry` | `box` | `ghost`, from the same `effCollapsed` that decides what renders, so
        // marker and render can't disagree. The slab needs the tier and nothing else: it was
        // previously sniffed with `:has()` and the box read off `[data-focus]`, which is wrong
        // whenever a coarser rung is manually expanded (single-open then demotes the focus rung to
        // an entry and the box sits mid-pile) — both joints around it fell back to `--rail-gap`.
        const boxed = card.present && !effCollapsed(id);
        const tier = !card.present ? "ghost" : boxed ? "box" : "entry";
        // The materialized BOX carries the sibling pager + swipe — the plank is drawn on the card's
        // own bottom edge, so it must never ride a one-line entry. That's the whole gate: `boxed`,
        // not the focus rung. Single-open makes the box unique, and it can be ANY committed rung, so
        // keying on `[data-focus]` here had the same bug the tier marker fixed above — and it also
        // shut out the two SNAPSHOT slots, which are lane members with no focus rung at all
        // (`railLadderBoundary.test.ts` asserts rung → slot, never the reverse). RailPager renders
        // children untouched when the rung has no sibling set.
        const focused = id === focusId;
        const wrapped = boxed ? <RailPager slot={card.kind}>{body}</RailPager> : body;
        return (
          // The distance-dim rides a VAR, not wrapper opacity (2026-08-08): the entry itself
          // applies `opacity-[var(--entry-dim,1)]` and RELEASES it on hover (the materialize
          // preview) — a wrapper opacity would clamp the hover lift from outside.
          <div key={id} data-depth={depth} data-tier={tier} data-focus={focused ? "" : undefined} style={{ ["--entry-dim" as string]: entryDim(id) } as CSSProperties}>
            {/* Every rung's height EASES (HeightEase — its header carries the rule and the
                follow-don't-fight heuristic that keeps it off the pager's own slides). The
                slab selectors are descendant, not child, so the extra level is free — the
                RailPager precedent. */}
            <HeightEase growIn={laneBooted.current}>{wrapped}</HeightEase>
          </div>
        );
      })}
    </div>
  );
  // Cards that AREN'T ladder rungs (the snapshot slot in every 3D view) render below the lane —
  // present card first, else its ghost — plus, in flat/placeholder views (no ladder), everything.
  const nonLadder = manifest.filter((c) => c.kind !== "context" && !ladderIds.includes(c.id));
  const trailingPanes = nonLadder.filter((c) => c.present).map((c) => detailPane[c.id]);
  const trailingGhosts = nonLadder
    .filter((c) => !c.present && c.hint != null)
    .map((c) => <GhostCard key={`${c.id}-ghost`} card={c} />);



  // The tablet/phone sheets host the SAME LADDER LANE as the desktop rail (card-redesign
  // 2026-08-08 — sheets used to keep a flat populated-first/ghosts-last stack; with ghosts now
  // one-line entries the scroll-cost rationale is gone, and the lane brings the entry
  // distance-dim, the single-open accordion and the lane order in one move). The tucked SLAB
  // rides along (its CSS is `.rail-ladder`-scoped, so it applies wherever the lane renders) —
  // that's intended: the slab is the cards' own geometry, not an instrument. What IS
  // desktop-only is the THREAD, which the sheets don't render — their single instrument is the
  // sheet edge.

  // ── Dock icon TRAY (tablet/phone) ───────────────────────────────────────────────────────────
  // GLOBAL CONSTRAINT: nothing here ever opens the sheet — the tray is purely visual; `open` is
  // still owned by the user tapping the trigger (RailDock's own state on tablet, `store.phoneDock`
  // on phone). `useTrayActives` (keyed to the manifest) marks a card's icon vivid/heartbeat when
  // its subjectKey changes while the sheet is closed, and bumps `updateKey` per event → RailDock
  // replays the travelling edge pulse. Opening clears all highlights (`onOpenChange`).
  const { actives, updateKey, onOpenChange: onTrayOpenChange } = useTrayActives(manifest);
  // ⚠️ ON PHONE THE STORE IS THE OPENNESS TRUTH, and it must be SYNCED, not only heard through
  // RailDock's onOpenChange (user, 2026-09-03: "if I click a node in geo the cue does not
  // show"). A controlled Radix sheet fires onOpenChange only for interactions it mediates — when
  // the OTHER dock section opens, this sheet's `open` prop flips false externally and no
  // callback runs, so the tracker still believed the sheet was open and swallowed every later
  // pick as "seen". Tablet keeps the callback wiring alone: its sheet state is RailDock's own,
  // and every close there is user-driven through Radix.
  useEffect(() => {
    if (bp === "phone") onTrayOpenChange(phoneDock === "details");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bp, phoneDock]);

  // Icon per hosted card comes from the manifest; hue is the tray's own presentation: the node's
  // metagraph hue (or core cyan), everything else the filter accent.
  const nodeHue =
    inspect?.kind === "metanode" ? (inspect.meta ? identityHudCss(inspect.meta.id) : undefined) : identityHudCss("dag");
  const tray: TabSignal[] = manifest
    .filter((c) => c.present)
    .map((c) => ({
      id: c.id,
      icon: c.icon,
      hue: c.kind === "node" ? nodeHue : filterAccent(filter),
      active: actives.has(c.id),
    }));

  // Tablet + phone host the same ladder-lane `content` (see the note above the lane).
  const content = (
    <>
      {ladderLane}
      {trailingPanes}
      {trailingGhosts}
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
          <RailShade>
            {ladderLane}
            {trailingPanes}
            {trailingGhosts}
          </RailShade>
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
      <RailDock
        side="right"
        label="Details"
        style={accent}
        signals={tray}
        updateKey={updateKey}
        signalKey={`${mode}|${filter}`}
        onOpenChange={onTrayOpenChange}
        // See `store.sceneCoverR` — this sheet takes width off the canvas the Engine places
        // the subject callout against.
        onCoverPx={(px) => setSceneCover("right", px)}
      >
        {content}
      </RailDock>
    );
  }

  // Phone: the RIGHT half of the persistent bottom bar, mutually exclusive with the "Explore"
  // dock via the shared `store.phoneDock` field (see ExploreRail) — never auto-opened by a pick
  // (only the icon tray reacts to updates; `open` is 100% derived from `phoneDock`,
  // which only a tap (here), a toggle-collapse, or a dismiss (handleDismiss, below) ever writes).
  // No `signalKey` here — the view/filter-switch pulse for the phone dock is a single full-width
  // overlay spanning both halves (`PhoneDockSweep`, mounted once in page.tsx), not a per-half prop.
  return (
    <RailDock
      side="right"
      label="Details"
      style={accent}
      trigger="bottom-bar-half"
      // Thirds with the Vitals section — see ExploreRail's matching arm.
      barGeom={VIEW_POLICIES[mode].vitalsLane ? "w-1/3 right-0" : undefined}
      sheetSide="bottom"
      // Compact tray at thirds — see ExploreRail's matching arm.
      signals={tray}
      trayCompact={VIEW_POLICIES[mode].vitalsLane}
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
