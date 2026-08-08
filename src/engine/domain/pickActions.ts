// The CLICK/SELECT DECISION TABLE — what picking a subject means, per view × pick kind, as
// pure data-in/actions-out logic. TWO kinds of caller execute it:
//   - the Engine's _handleClick (scene raycast clicks) via clickActions();
//   - the React components' handlers (GeoExplore's country/node rows, LiveStrip's bars) via
//     the named builders below — so the scene and the panels can never drift in semantics.
// The ORDERING contracts are tested invariants:
//   - selecting a node sets the network filter FIRST (its store subscription clears any old
//     country drill), then commits the node's own country AND cohort (full-ancestry rule,
//     spec Part 3 — every rung above the node commits so a deselect steps back down the same
//     ladder regardless of how the node was reached), then inspect LAST so the node-focus
//     camera flight wins over the network/country/cohort framings;
//   - a zoom-level toggle (country, cohort) drops every FINER rung first (moving between
//     levels deselects the finer ones); the "ladder-derived stepping" tests assert this
//     matches `domain/focusLadder.ts`'s finerLevels() exactly, so pickActions can't drift
//     from the ladder even though the drop list is hand-written per builder.
import type { Mode } from "@/src/store/store";
import type { PickDescriptor, MetaSnapSel } from "@/src/data/types";
import type { CohortSel, CompositionSel } from "./focusLadder";
import { METAGRAPHS } from "../config";
import { UNLISTED_KEY } from "./ledgerBands";

export type ClickAction =
  | { kind: "filter"; id: string }                                             // commit the network filter
  | { kind: "country"; cc: string | null }                                     // commit/clear the country drill
  | { kind: "cohort"; sel: CohortSel | null }                                  // commit/clear the city×provider cohort (geo)
  | { kind: "composition"; sel: CompositionSel | null }                        // commit/clear the composition group (hyper)
  | { kind: "inspect"; pick: PickDescriptor | null }                           // open/clear the node card
  // Select a snapshot (follow decides pin vs heartbeat) — or CLEAR it (pick null, follow
  // omitted: the follow state is untouched; FollowController owns the re-follow).
  | { kind: "snapshot"; pick: Extract<PickDescriptor, { kind: "snapshot" }> | null; follow?: boolean }
  | { kind: "metaSnap"; sel: MetaSnapSel | null };

// The network a node pick belongs to: its metagraph, or the DAG core for a validator.
export const pickNetId = (p: PickDescriptor): string | null =>
  p.kind === "metanode" ? p.meta?.id ?? null : p.kind === "l0" || p.kind === "l1" ? "dag" : null;

// Whether a pick participates in hover/click AT ALL — the per-view activity gate the Engine
// applies to every raycast hit before it reaches clickActions/tooltips.
//  - A registered-but-node-less metagraph hub is shown (dim) but never selectable, matching
//    its inactive look + its "registered · no live nodes" filter chip (`activeMetaIds` null =
//    counts not loaded yet → all allowed).
//  - GEO: off-filter nodes are genuinely hidden, so they must not respond either (Three's
//    raycaster ignores `visible`); the country drill is a LENS, so it does NOT gate picking.
//  - HYPER (and elsewhere): every node stays interactive — off-focus ones are only dimmed,
//    and clicking one drills into its network (gating them out read as a bug).
export function pickActive(
  p: PickDescriptor,
  mode: Mode,
  filter: string,
  activeMetaIds: ReadonlySet<string> | null,
): boolean {
  if (p.kind === "meta") return !activeMetaIds || activeMetaIds.has(p.cfg.id);
  if (mode !== "geo") return true;
  const id = p.kind === "l0" || p.kind === "l1" ? "dag" : p.kind === "metanode" ? p.meta?.id : undefined;
  if (id === undefined) return true; // non-node picks (snapshot) are view-gated by pickSources
  return filter === "all" || filter === id;
}

// The country zoom-level TOGGLE — shared by the scene's empty-click-on-a-country and
// GeoExplore's country row (`drill`). Entering/leaving a country level drops the finer rungs
// first (the zoom-level rule — finerLevels("geo","country") = ["node","cohort"]): a selected
// node, then a committed cohort.
export function countryToggleActions(
  cc: string,
  current: { country: string | null; hasInspect: boolean; cohort: CohortSel | null },
): ClickAction[] {
  const acts: ClickAction[] = [];
  if (current.hasInspect) acts.push({ kind: "inspect", pick: null });
  if (current.cohort) acts.push({ kind: "cohort", sel: null });
  acts.push({ kind: "country", cc: current.country === cc ? null : cc });
  return acts;
}

// Cohort identity — cc+city+isp (all three; city/isp may be null and must match as null).
export const sameCohort = (a: CohortSel | null, b: CohortSel | null): boolean =>
  !!a && !!b && a.cc === b.cc && a.city === b.city && a.isp === b.isp;

// The cohort/provider zoom-level TOGGLE (spec Part 4) — GeoExplore's cohort row. Entering/
// leaving the cohort level drops the finer node selection first (finerLevels("geo","cohort")).
export function cohortToggleActions(
  c: CohortSel,
  current: { cohort: CohortSel | null; hasInspect: boolean },
): ClickAction[] {
  const acts: ClickAction[] = [];
  if (current.hasInspect) acts.push({ kind: "inspect", pick: null });
  acts.push({ kind: "cohort", sel: sameCohort(current.cohort, c) ? null : c });
  return acts;
}

// Composition-group identity — network + group key (the `${label}|${codes}` HyperExplore builds).
export const sameComposition = (a: CompositionSel | null, b: CompositionSel | null): boolean =>
  !!a && !!b && a.netId === b.netId && a.key === b.key;

// The COMPOSITION zoom-level TOGGLE (user, 2026-08-02) — HyperExplore's group row. A group is
// network-scoped, so the row commits its NETWORK first (only when it changes, the no-churn rule;
// the Engine's filter subscription clears every finer rung, which is why the composition commit
// must come after it), then drops the finer node selection (finerLevels("hyper","composition")),
// then commits the group itself. Re-clicking the committed group clears it — one toggle language.
export function compositionToggleActions(
  c: CompositionSel,
  current: { composition: CompositionSel | null; hasInspect: boolean; filter: string },
): ClickAction[] {
  const acts: ClickAction[] = [];
  if (c.netId !== current.filter) acts.push({ kind: "filter", id: c.netId });
  if (current.hasInspect) acts.push({ kind: "inspect", pick: null });
  acts.push({ kind: "composition", sel: sameComposition(current.composition, c) ? null : c });
  return acts;
}

// Selecting a NODE — shared by the scene node click and GeoExplore's node row (`selectNode`).
// Drills the global filter into the node's network (only when it actually changes — no churn),
// selects the node's full geo ANCESTRY in geo (country + cohort — border/firmer land/expanded
// explorer rows beneath the selection) or its ledger LAYER ancestry in ledger, and sets inspect
// LAST so the node camera wins the flight. Full-ancestry rule (spec Part 3): committing every
// rung above the node means a deselect steps back down the SAME ladder regardless of how the
// node was reached (scene click, explorer row, or a jump straight from "all"). `deselect` is
// the row's re-click toggle (one toggle language everywhere — the × on the card does the
// same); a scene click never deselects.
export function nodeSelectActions(
  p: PickDescriptor,
  opts: {
    mode: Mode;
    currentFilter: string;
    deselect?: boolean;
    /** HYPER ancestry: the composition group the node belongs to (the explorer row's parent
     *  group, or the one the Engine derives for a scene click). The caller resolves it, because
     *  the group vocabulary lives in the data layer. */
    compositionSel?: CompositionSel | null;
  },
): ClickAction[] {
  if (opts.deselect) return [{ kind: "inspect", pick: null }];
  const acts: ClickAction[] = [];
  const netId = pickNetId(p);
  if (netId && netId !== opts.currentFilter) acts.push({ kind: "filter", id: netId });
  acts.push(...nodeAncestryActions(p, opts));
  acts.push({ kind: "inspect", pick: p });
  return acts;
}

// The rungs ABOVE a node in the destination view's ladder — the ONE definition of a node's
// ancestry, shared by a node SELECT (below the filter, above the inspect) and by a VIEW ENTRY
// (viewEntryActions). Each view contributes only the rungs it scopes to itself: hyper the
// composition group, geo the country + the provider cohort. The ledger contributes NOTHING
// since the layer rung's retirement (2026-08-06) — its floors/containers are visual aid.
function nodeAncestryActions(
  p: PickDescriptor,
  opts: { mode: Mode; compositionSel?: CompositionSel | null },
): ClickAction[] {
  const acts: ClickAction[] = [];
  if (opts.mode === "hyper" && opts.compositionSel) acts.push({ kind: "composition", sel: opts.compositionSel });
  if (opts.mode === "geo" && "geo" in p && p.geo?.cc) {
    acts.push({ kind: "country", cc: p.geo.cc });
    // Full-ancestry rule (spec Part 3): the node's cohort commits too, so deselect steps
    // node → cohort → country → network regardless of how the node was reached.
    acts.push({ kind: "cohort", sel: { cc: p.geo.cc, city: p.geo.city ?? null, isp: p.geo.isp ?? null } });
  }
  return acts;
}

// ARRIVING in a view with a node still selected. Node + network CARRY across a switch, but the
// view-scoped rungs do not (focusLadder.LEVEL_CARRY): country/cohort are geo's, composition is
// hyper's, and each is cleared on the way out. Without this the carried node would sit in the
// destination rail with every parent slot back on its ghost, and a deselect would step straight
// to the network (user, 2026-08-02: every card up to the selection belongs on the rail, in every
// view). So the entry re-derives exactly the ancestry a click on that node IN the destination
// view would have committed — no filter (it carried), no inspect (it's already open). A non-node
// pick (a dossier, a snapshot) has no ancestry and yields nothing.
export function viewEntryActions(opts: {
  mode: Mode;
  pick: PickDescriptor | null;
  compositionSel?: CompositionSel | null;
}): ClickAction[] {
  return opts.pick ? nodeAncestryActions(opts.pick, opts) : [];
}

// The network-filter TOGGLE — the FilterPicker's committed-row rule: picking the committed
// metagraph again steps back to "all" (one toggle language everywhere); "all" itself never
// toggles off.
export function filterToggleActions(id: string, currentFilter: string): ClickAction[] {
  return [{ kind: "filter", id: id !== "all" && id === currentFilter ? "all" : id }];
}

// The rail-controls CLEAR-ALL — one sweep back to the "all" overview: drop every committed
// rung finest→coarsest (mirroring the ladder's deselect stepping), the snapshot pin included
// (pick null, no `follow` — re-following stays with the FollowController, like every snapshot
// clear). Each channel is gated so an already-clear one emits no action (no store churn).
export function clearAllActions(current: {
  hasInspect: boolean;
  hasSnap: boolean;
  hasMetaSnap: boolean;
  cohort: CohortSel | null;
  composition: CompositionSel | null;
  country: string | null;
  filter: string;
}): ClickAction[] {
  const acts: ClickAction[] = [];
  if (current.hasInspect) acts.push({ kind: "inspect", pick: null });
  if (current.hasMetaSnap) acts.push({ kind: "metaSnap", sel: null });
  if (current.hasSnap) acts.push({ kind: "snapshot", pick: null });
  if (current.cohort) acts.push({ kind: "cohort", sel: null });
  if (current.composition) acts.push({ kind: "composition", sel: null });
  if (current.country) acts.push({ kind: "country", cc: null });
  if (current.filter !== "all") acts.push({ kind: "filter", id: "all" });
  return acts;
}

// Selecting a SNAPSHOT — shared by the ledger's tile click and LiveStrip's bar click:
// clicking the LIVE tip (re-)follows the heartbeat; anything older pins that snapshot
// (the FollowController only auto-advances while following).
export function snapshotSelectActions(
  p: Extract<PickDescriptor, { kind: "snapshot" }>,
  isLiveTip: boolean,
  current?: {
    pinnedOrdinal: number | null;
    metaSnap: MetaSnapSel | null;
    /** The committed network filter + whether the clicked tick's anchor set contains it. A
     *  FILTER IS A STORY (user, 2026-08-07): pinning a tick the committed network did NOT
     *  anchor into releases the filter back to "all" — otherwise the network dim keeps
     *  shaping a snapshot that has nothing to do with it. Omitted = the filter holds. */
    filter?: string;
    tickHasFilter?: boolean;
  },
): ClickAction[] {
  // RE-CLICKING the pinned tick DESELECTS (2026-08-07 — the toggle every other rung already
  // speaks): the finer metaSnap slot drops with it, and the deselect RESUMES LIVE (live is the
  // default until something is clicked — the FollowController repopulates the card chain and
  // the trail slides back to the live front).
  if (!isLiveTip && current && current.pinnedOrdinal != null && current.pinnedOrdinal === p.data.ordinal) {
    const out: ClickAction[] = [];
    if (current.metaSnap) out.push({ kind: "metaSnap", sel: null });
    out.push({ kind: "snapshot", pick: null, follow: true });
    return out;
  }
  const out: ClickAction[] = [];
  if (
    current?.filter && current.filter !== "all" && current.filter !== "dag" &&
    current.tickHasFilter === false
  ) {
    out.push({ kind: "filter", id: "all" });
  }
  out.push({ kind: "snapshot", pick: p, follow: isLiveTip });
  return out;
}

// Metagraph snapshot identity — metaId + ordinal (the snapshot's own ordinal, not the global one).
export const sameMetaSnap = (a: MetaSnapSel | null, b: MetaSnapSel | null): boolean =>
  a === b || (!!a && !!b && a.metaId === b.metaId && a.ordinal === b.ordinal);

/** A TILE on the ledger's upper floor (spec §5.3): the metagraph snapshot itself. Filter-first,
 *  then the global tick it anchored into, subject LAST — the same full-ancestry contract a node
 *  select follows, so deselecting the tile steps back to the tick rather than to the network.
 *  `follow: false` because pinning a tile pins its tick; the live heartbeat is the strip's job. */
export function metaSnapSelectActions(
  sel: MetaSnapSel,
  global: Extract<PickDescriptor, { kind: "snapshot" }>,
  current: { filter: string; metaSnap: MetaSnapSel | null; following?: boolean },
): ClickAction[] {
  // The deselect-toggle applies only to a PINNED selection. While FOLLOWING, the shown subject
  // is auto-selected — clicking it must CONVERT the auto-selection into an explicit pin (the
  // click-scoped decode rule, user 2026-08-07), not silently deselect.
  if (sameMetaSnap(current.metaSnap, sel) && !current.following) return [{ kind: "metaSnap", sel: null }];
  const out: ClickAction[] = [];
  // Filter-first only for a LISTED metagraph — an UNKNOWN-lane tile carries a raw state-channel
  // address (2026-08-07, inspectable tiles): the filter vocabulary doesn't know it, so like the
  // unlisted band it commits only the tick + the subject.
  const listed = METAGRAPHS.some((m) => m.id === sel.metaId);
  if (listed && current.filter !== sel.metaId) out.push({ kind: "filter", id: sel.metaId });
  out.push({ kind: "snapshot", pick: global, follow: false });
  out.push({ kind: "metaSnap", sel });
  return out;
}

/** A BAND on the byte bar (spec §5.3): an aggregate of that metagraph's snapshots in one tick, so
 *  it selects the PAIR — the metagraph and the tick — and drops any finer tile. The neutral
 *  unlisted band names no metagraph, so it commits only the tick. */
export function bandSelectActions(
  metaId: string,
  global: Extract<PickDescriptor, { kind: "snapshot" }>,
  current: { filter: string; metaSnap: MetaSnapSel | null; tickHasFilter?: boolean },
): ClickAction[] {
  const out: ClickAction[] = [];
  const listed = metaId !== UNLISTED_KEY;
  if (listed && current.filter !== metaId) out.push({ kind: "filter", id: metaId });
  // The UNLISTED band can't filter-first, so it carries the RELEASE rule itself (2026-08-08,
  // review fix — a listed band's filter-first makes the new filter in-story by construction,
  // but the unlisted band of an out-of-story tick would leave a stale filter dimming it).
  if (!listed && current.tickHasFilter === false) out.push({ kind: "filter", id: "all" });
  if (current.metaSnap) out.push({ kind: "metaSnap", sel: null });
  out.push({ kind: "snapshot", pick: global, follow: false });
  return out;
}

// The snapshot card's LIVE-MODE switch (user, 2026-08-02). The card no longer opens itself on
// entering the ledger — it is a picked subject like every other card — so following the
// heartbeat is now an explicit act, and the card's own live/age element is the switch. Turning
// it ON hands the subject back to the FollowController (its `following` effect re-points at the
// latest relevant snapshot); turning it OFF pins whatever is on screen at that moment.
export function followToggleActions(
  shown: Extract<PickDescriptor, { kind: "snapshot" }>,
  following: boolean,
): ClickAction[] {
  return [{ kind: "snapshot", pick: shown, follow: !following }];
}

export function clickActions(input: {
  mode: Mode;
  // The raycast pick (already drag-suppressed + pickActive-gated by the Engine), or null.
  pick: PickDescriptor | null;
  // The drillable country under the cursor when NOTHING was picked (the Engine resolves the
  // land-sphere hit, policy-gated to geo); null elsewhere/over ocean.
  countryCc: string | null;
  // HYPER only: the composition group the picked node belongs to, resolved by the Engine (the
  // group vocabulary lives in the data layer) — the node's ancestry rung, like the ledger floor.
  compositionSel?: CompositionSel | null;
  current: {
    filter: string; country: string | null; hasInspect: boolean; cohort: CohortSel | null;
    // Ledger: the pinned tick + its metaSnap child — a scene band click on the pinned tick
    // deselects, same as the explorer row (the toggle rule; omitted = never toggles) — and
    // whether the clicked tick's anchors include the committed filter (the filter-releases rule).
    pinnedOrdinal?: number | null; metaSnap?: MetaSnapSel | null; tickHasFilter?: boolean;
  };
}): ClickAction[] {
  const { mode, pick: p, countryCc, current } = input;

  // Empty click on a drillable country: toggle its drill — the scene twin of the explorer
  // row. Mode-gated here TOO (the Engine only resolves countryCc in geo, but the table stays
  // safe on its own).
  if (!p) return mode === "geo" && countryCc ? countryToggleActions(countryCc, current) : [];

  // A hub click selects the metagraph (opens its context pane + frames it).
  if (p.kind === "meta") return [{ kind: "filter", id: p.cfg.id }];

  // The ledger's snapshot bands: a scene band is never the strip's live tip — it pins, and
  // re-clicking the pinned tick's band deselects (the same tested toggle the explorer runs).
  if (p.kind === "snapshot")
    return snapshotSelectActions(p, false, {
      pinnedOrdinal: current.pinnedOrdinal ?? null,
      metaSnap: current.metaSnap ?? null,
      filter: current.filter,
      tickHasFilter: current.tickHasFilter,
    });

  // A node, in any view. (No autoRotate action: geo disables the controls' rotation at mode
  // entry and the inspect subscription re-asserts it on the node flight.)
  return nodeSelectActions(p, { mode, currentFilter: current.filter, compositionSel: input.compositionSel });
}
