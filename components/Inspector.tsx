"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import { ChevronsDownUp, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@/src/store/store";
import { applyClickActions } from "@/src/store/applyClickActions";
import { filterAccent, metagraphById, CORE_HEX } from "@/src/data/network";
import { identityHudHex } from "@/src/palette/identity";
import { hoverKeyOf } from "@/src/data/hoverSubject";
import { subjectPairing } from "@/components/useSubjectPairing";
import CardHead, { RIGHT_CARD } from "@/components/CardHead";
import { Card } from "@/components/ui/card";
import InspectorCard from "@/components/InspectorCard";
import ContextCard from "@/components/ContextCard";
import RailThread from "@/components/RailThread";
import RailDock from "@/components/RailDock";
import { useBreakpoint } from "@/components/useBreakpoint";
import { PulseEdge, useEdgePulse } from "@/components/EdgePulse";
import { detailsCards, ladderSlotIds, type RailCard } from "@/components/railCards";
import { useTrayActives } from "@/components/useTrayActives";
import { countryToggleActions, cohortToggleActions, clearAllActions } from "@/src/engine/domain/pickActions";
import { CountryTitle, CountryCard, ProviderTitle, ProviderCard } from "@/components/inspector/cards";
import type { TabSignal } from "@/components/RailDock";
import type { PickDescriptor } from "@/src/data/types";
import type { Mode } from "@/src/store/store";
import type { CohortSel } from "@/src/engine/domain/focusLadder";

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
  const ledgerHilite = useStore((s) => s.ledgerHilite);
  const setLedgerHilite = useStore((s) => s.setLedgerHilite);
  let pair;
  let subjectKey: string | number | null;
  if (pick.kind === "snapshot") {
    // Snapshot pairing hue follows the active filter's identity: the selected metagraph's (or
    // the DAG's own) brand hue, or the network cyan for "all" — `filterAccent` already draws
    // that exact line (metagraphById resolves "dag" through the identity map too).
    pair = subjectPairing<number>(hoverSnapOrd, pick.data.ordinal, setHoverSnapOrd, filterAccent(filter));
    subjectKey = pick.data.ordinal;
  } else if (pick.kind === "layer") {
    // Layer pairing rides the plane-highlight PREVIEW channel: hovering the card highlights its
    // floor plane in the 3D view (the reverse direction: hovering the plane pairs the card too).
    // Hue follows the active filter's identity like the snapshot card (`filterAccent`): the
    // selected metagraph's brand hue, or structural cyan on "all".
    pair = subjectPairing<string>(ledgerHilite, pick.layerId, setLedgerHilite, filterAccent(filter));
    subjectKey = pick.layerId;
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
        <InspectorCard p={pick} eyebrow={eyebrow} onClose={onClose} collapsed={collapsed} onToggle={onToggle} />
        <PulseEdge pulseKey={pulseKey} rail="right" />
      </aside>
    </Card>
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
  // Same channel + hue GeoExplore's own country rows pair on — structural cyan (a PLACE, not an
  // identity), so hovering this card previews the border on the globe and vice versa.
  const pair = subjectPairing<string>(hoverCountry, cc, setHoverCountry, "var(--primary)");
  const pulseKey = useEdgePulse(cc);
  return (
    <Card asChild className={cn(RIGHT_CARD, "sig-left", pair.className)}>
      <aside style={pair.style} onMouseEnter={pair.onMouseEnter} onMouseLeave={pair.onMouseLeave}>
        <CardHead
          eyebrow="Country"
          title={<CountryTitle cc={cc} />}
          titleKey={cc}
          onClose={onClose}
          collapsed={collapsed}
          onToggle={onToggle}
        />
        {!collapsed && <CountryCard cc={cc} />}
        <PulseEdge pulseKey={pulseKey} rail="right" />
      </aside>
    </Card>
  );
}

function ProviderPane({ sel, onClose, collapsed, onToggle }: { sel: CohortSel; onClose: () => void; collapsed: boolean; onToggle: () => void }) {
  const selNodes = useStore((s) => s.selNodes);
  const setHoverCohort = useStore((s) => s.setHoverCohort);
  const subjectKey = `${sel.cc}|${sel.city}|${sel.isp}`;
  const pulseKey = useEdgePulse(subjectKey);
  // hoverCohort is an id ARRAY (the whole 3D honeycomb stack glows together), not a scalar the
  // shared subjectPairing helper can compare — so this card only drives hover OUTWARD (card →
  // scene glow), the same member match ProviderCard's body uses.
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
    <Card asChild className={cn(RIGHT_CARD, "sig-left")}>
      <aside onMouseEnter={() => setHoverCohort(ids)} onMouseLeave={() => setHoverCohort(null)}>
        <CardHead
          eyebrow="Provider"
          title={<ProviderTitle sel={sel} />}
          titleKey={subjectKey}
          onClose={onClose}
          collapsed={collapsed}
          onToggle={onToggle}
        />
        {!collapsed && <ProviderCard sel={sel} />}
        <PulseEdge pulseKey={pulseKey} rail="right" />
      </aside>
    </Card>
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
  context: "Metagraph", country: "Country", cohort: "Provider", node: "Node", snap: "Snapshot", layer: "Layer",
};
export function GhostCard({ card }: { card: RailCard }) {
  const Icon = card.icon;
  const label = GHOST_EYEBROW[card.id] ?? card.id;
  return (
    // NEAR-transparent (user-tuned): the ghost drops .ig-panel's glass — the fill is a
    // background GRADIENT + backdrop blur, so `bg-transparent` (background-color only) can't
    // clear it; the arbitrary background property replaces the whole shorthand with a bare
    // HINT of the panel tone (--panel at 75%, user-tuned), no blur/depth shadow, faded dashed hairline.
    <Card
      asChild
      className={cn(
        RIGHT_CARD,
        "border-dashed py-3 shadow-none border-border/50 [background:color-mix(in_srgb,var(--panel)_75%,transparent)] [backdrop-filter:none]",
      )}
    >
      <aside aria-label={`${label} — nothing selected yet`}>
        <p className="m-0 flex items-start gap-2.5 text-label text-muted-foreground">
          <Icon
            aria-hidden
            className="size-3.5 flex-none mt-[1px] text-[var(--filter-accent,var(--primary))] opacity-55"
          />
          {/* fixed label column (fits the longest slot name, "METAGRAPH") so the instruction
              text starts at the SAME x on every ghost card (user) */}
          <span className="flex-none w-[86px] mt-[2px] text-micro tracking-caps uppercase">{label}</span>
          <span className="min-w-0">{card.hint}</span>
        </p>
      </aside>
    </Card>
  );
}

// The rail-top CONTROLS (desktop, variant-A descent spine, 2026-07-19): the desktop equivalent
// of the tablet dock's collapsibility, hoisted to an explicit control cluster the user asked for.
// Three quiet instrument buttons — minimize all (collapse every present card to eyebrow+title),
// expand all, and clear all (deselect the whole ladder back to the overview). Monochrome lucide
// glyphs (the ONE icon system), muted at rest; no card chrome — it reads as a toolbar in the
// rail's margin, not another panel. Shown only when the rail actually hosts a card.
function RailControls({
  onMinimize,
  onExpand,
  onClear,
}: {
  onMinimize: () => void;
  onExpand: () => void;
  onClear: () => void;
}) {
  const btn =
    "inline-flex items-center justify-center size-6 rounded-[var(--radius-xs)] text-muted-foreground hover:text-foreground hover:bg-wash-soft transition-colors cursor-pointer focus-visible:outline-1 focus-visible:outline-ring/60";
  return (
    <div className="pointer-events-auto flex items-center justify-end gap-0.5 pb-0.5 pr-0.5" role="group" aria-label="Details controls">
      <button type="button" className={btn} title="Minimize all cards" aria-label="Minimize all cards" onClick={onMinimize}>
        <ChevronsDownUp aria-hidden className="size-3.5" />
      </button>
      <button type="button" className={btn} title="Expand all cards" aria-label="Expand all cards" onClick={onExpand}>
        <ChevronsUpDown aria-hidden className="size-3.5" />
      </button>
      <button type="button" className={btn} title="Clear all selections" aria-label="Clear all selections" onClick={onClear}>
        <X aria-hidden className="size-3.5" />
      </button>
    </div>
  );
}

// Right column — the **facts** rail: a DESCENT-SPINE LADDER of selected-subject cards (variant-A
// redesign, 2026-07-19). The focus-ladder rungs (network → country → provider → node in geo;
// network → layer → node in ledger; network → node in hyper) render in a `.rail-ladder` lane
// (`store.selStack`, most-recent first → on top), so you can hold several selections at once
// (a node AND a snapshot AND, later, more) and the one you picked last sits on top. Each card
// type is one entry in the registry below — add a future card by adding a slot (a store field +
// `setSel`) and an entry here; the stacking, ordering, flashing and empty-hint are all generic.
// An **instrument-channel thread** (`RailThread`) runs the rail's outer edge as the identity cue.
export default function Inspector() {
  const bp = useBreakpoint();
  const inspect = useStore((s) => s.inspect);
  const snap = useStore((s) => s.snap);
  const layer = useStore((s) => s.layer);
  const country = useStore((s) => s.country);
  const cohort = useStore((s) => s.cohort);
  const filter = useStore((s) => s.filter);
  const mode = useStore((s) => s.mode) as Mode;

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
  const selNodes = useStore((s) => s.selNodes);
  const filterCfg = metagraphById(filter);
  const manifest = detailsCards({
    mode, filter, inspect, snap, layer, country, cohort,
    selNodesCount: selNodes.length,
    filterLabel: filterCfg ? filterCfg.ticker || filterCfg.name : null,
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
  const ladderIds = ladderSlotIds(mode);
  const presentOf = (id: string) => manifest.find((c) => c.id === id)?.present ?? false;
  const presentLadder = ladderIds.filter(presentOf);
  const focusId = presentLadder.length ? presentLadder[presentLadder.length - 1] : null;
  const autoCollapsed = (id: string) => ladderIds.includes(id) && presentOf(id) && id !== focusId;
  const effCollapsed = (id: string) => railCollapse[id] ?? autoCollapsed(id);
  const toggleCollapse = (id: string) => setRailCollapse(id, !effCollapsed(id));
  const cx = (id: string) => ({ collapsed: effCollapsed(id), onToggle: () => toggleCollapse(id) });

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
    // geoLive reads the node from the store; its × is CardHead's shared close like every card.
    node: (
      <CardPane key="node" pick={{ kind: "geoLive" }} eyebrow="Node" onClose={() => applyClickActions([{ kind: "inspect", pick: null }])} {...cx("node")} />
    ),
    snap: snap ? (
      <CardPane key="snap" pick={snap} eyebrow="Snapshot" onClose={() => applyClickActions([{ kind: "snapshot", pick: null }])} {...cx("snap")} />
    ) : null,
    layer: layer ? (
      <CardPane key="layer" pick={layer} eyebrow="Layer" onClose={() => applyClickActions([{ kind: "layer", pick: null }])} {...cx("layer")} />
    ) : null,
  };

  // ── The desktop LADDER LANE (the descent spine) + the flat tablet/phone stack ─────────────────
  // Ladder slots render in a `.rail-ladder` lane, in display order, each in a `.rung` whose body
  // indents by its depth (`--depth`); the finest present rung is `data-focus`. Context is special:
  // ALWAYS mounted (self-nulling on "all") so its EdgePulse survives the dossier⇄nothing swap —
  // so its rung always renders ContextCard, plus the context ghost when nothing's committed there.
  const ladderLane = (
    <div className="rail-ladder">
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
        return (
          <div key={id} className="rung" data-focus={id === focusId ? "" : undefined}>
            <div className="rung-body" style={{ ["--depth"]: depth } as CSSProperties}>
              {body}
            </div>
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

  // Rail-top controls act on EVERY present card (ladder + snapshot). Clear-all sweeps the whole
  // ladder back to the overview through the tested `clearAllActions` table AND drops any collapse
  // overrides so a fresh selection starts from the auto default again.
  const presentIds = manifest.filter((c) => c.present).map((c) => c.id);
  const hasCards = presentIds.length > 0;
  const minimizeAll = () => setRailCollapseMany(Object.fromEntries(presentIds.map((id) => [id, true])));
  const expandAll = () => setRailCollapseMany(Object.fromEntries(presentIds.map((id) => [id, false])));
  const clearAll = () => {
    setRailCollapseMany(Object.fromEntries(presentIds.map((id) => [id, null])));
    applyClickActions(
      clearAllActions({
        hasInspect: presentOf("node"),
        hasSnap: presentOf("snap"),
        cohort,
        country,
        layerId: layer ? layer.layerId : null,
        filter,
      }),
    );
  };

  // Slots in TWO groups (user refinement): POPULATED cards first, then every GHOST pushed to
  // the bottom — each group in the manifest's stable slot order. The tablet/phone sheets keep
  // this FLAT stack (no ladder lane on a small screen); the desktop rail uses the lane above.
  const panes = manifest.filter((c) => c.kind !== "context" && c.present).map((c) => detailPane[c.id]);
  const ghosts = manifest
    .filter((c) => !c.present && c.hint != null)
    .map((c) => <GhostCard key={`${c.id}-ghost`} card={c} />);

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
      <ContextCard {...cx("context")} />
      {panes}
      {ghosts}
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
          {hasCards && <RailControls onMinimize={minimizeAll} onExpand={expandAll} onClear={clearAll} />}
          {ladderLane}
          {trailingPanes}
          {trailingGhosts}
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
  // No `signalKey` here — the view/filter-switch pulse for the phone dock is a single full-width
  // overlay spanning both halves (`PhoneDockSweep`, mounted once in page.tsx), not a per-half prop.
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
