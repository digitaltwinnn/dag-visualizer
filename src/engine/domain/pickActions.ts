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
import type { PickDescriptor, MetaSnapSel, TickNetSel } from "@/src/data/types";
import { METAGRAPHS } from "@/src/net/current";
import type { CohortSel, CompositionSel } from "./focusLadder";
import { UNLISTED_KEY } from "./ledgerBands";
import { VIEW_POLICIES } from "./viewPolicy";

export type ClickAction =
  | { kind: "filter"; id: string }                                             // commit the network filter
  | { kind: "country"; cc: string | null }                                     // commit/clear the country drill
  | { kind: "cohort"; sel: CohortSel | null }                                  // commit/clear the city×provider cohort (geo)
  | { kind: "composition"; sel: CompositionSel | null }                        // commit/clear the composition group (hyper)
  | { kind: "inspect"; pick: PickDescriptor | null }                           // open/clear the node card
  // Select a snapshot (follow decides pin vs heartbeat) — or CLEAR it (pick null, follow
  // omitted: the follow state is untouched; FollowController owns the re-follow).
  | { kind: "snapshot"; pick: Extract<PickDescriptor, { kind: "snapshot" }> | null; follow?: boolean }
  // Commit/clear the network INSIDE the pinned tick — the ledger's Metagraph rung. NOT the filter:
  // see `tickNetSelectActions` and `domain/tickNet.ts`.
  | { kind: "tickNet"; sel: TickNetSel | null }
  | { kind: "metaSnap"; sel: MetaSnapSel | null }
  // Bring a trend plane forward, or release the focused one (null) — a VIEW-LOCAL emphasis, not a
  // selection rung: see `trendPlaneActions`.
  | { kind: "trendFocus"; id: string | null };

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
// LAST so the node camera wins the flight.
//
// ⚠️ NOT THE FILTER IN GEOGRAPHY (user, 2026-09-26: "navigation sets the filter automatically
// sometimes and that feels unexpected"). A geo node is a PLACE first: clicking a machine in
// Germany used to empty the globe and the country list down to that machine's network, which
// is the opposite of the browsing the click was part of. So in geo the ancestry is country →
// cohort → node and the network is never committed by a node — the top-bar filter and the
// hub-less scene keep it a deliberate, separate gesture. NOR IN THE LEDGER (user, 2026-09-29: the
// explorer's signer row set the filter): the committed network is the chamber's LENS, and no
// other row of that explorer moves it (`metaSnapSelectActions`, decision 13). Only hyper keeps
// filter-first (a node is a bead on its hub's shell; the filter is what dims the other hubs and
// frames the network, and the node rung inherits that framing) — `viewPolicy.nodeCommitsNetwork`
// is the allow-list. Full-ancestry rule
// (spec Part 3): committing every
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
    /** A surface that never moves the filter (the RAW node table — user, 2026-09-29: "clicking a
     *  row on the hyper page sets the filter, that should not happen") passes `false`: the record
     *  microscope inspects the node it lists, and the top bar stays the one place to commit a
     *  network. Absent = the view's own policy. */
    commitNetwork?: boolean;
  },
): ClickAction[] {
  if (opts.deselect) return [{ kind: "inspect", pick: null }];
  const acts: ClickAction[] = [];
  const netId = pickNetId(p);
  // Only a view whose row opts in drills the filter first (see the header).
  if (netId && netId !== opts.currentFilter && (opts.commitNetwork ?? VIEW_POLICIES[opts.mode].nodeCommitsNetwork)) acts.push({ kind: "filter", id: netId });
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

// Selecting a SNAPSHOT — shared by the ledger's tile click and LiveStrip's bar click:
// clicking the LIVE tip (re-)follows the heartbeat; anything older pins that snapshot
// (the FollowController only auto-advances while following).
/** CLEARING A GLOBAL SNAPSHOT — its card's × and the pinned tick's re-click, one builder (user,
 *  2026-09-29: "deleting a snapshot card will clear the rung that is there at that moment"; live
 *  stays the default). The tick is the ledger rail's PARENT: the tick-local network, its metagraph
 *  snapshot and a node under it hang from it, so they clear with it, finest first, and live
 *  resumes. Only what is there right now is cleared.
 *
 *  ⚠️ NOT THE FILTER (user, 2026-10-02: "I want that changed too" — closing the last exception to
 *  "no selection in Snapshots writes the filter"). It used to clear a committed filter here,
 *  because with one set, live follow re-grows that network's newest snapshot card on the next
 *  beat and the × seemed to leave the children standing. That is simply what live means under a
 *  lens: the × releases the PIN, and the card goes back to following the filtered network's
 *  newest tick. The filter is cleared where it is set — the top bar. */
export function snapshotClearActions(current: { metaSnap: MetaSnapSel | null; hasInspect?: boolean; tickNet?: TickNetSel | null }): ClickAction[] {
  const out: ClickAction[] = [];
  // The NODE is the ledger ladder's finest rung (a metagraph snapshot's validator, `∨`), so a node
  // card left standing under a cleared tick would hang from nothing — and its pager, losing the
  // signer set, would fall back to walking every node.
  if (current.hasInspect) out.push({ kind: "inspect", pick: null });
  if (current.metaSnap) out.push({ kind: "metaSnap", sel: null });
  // The network committed INSIDE this tick hangs under it by construction, so it goes with it.
  if (current.tickNet) out.push({ kind: "tickNet", sel: null });
  out.push({ kind: "snapshot", pick: null, follow: true });
  return out;
}

export function snapshotSelectActions(
  p: Extract<PickDescriptor, { kind: "snapshot" }>,
  isLiveTip: boolean,
  current?: {
    pinnedOrdinal: number | null;
    metaSnap: MetaSnapSel | null;
    hasInspect?: boolean;
    /** The network committed inside the pinned tick, if any — it belongs to THAT tick. */
    tickNet?: TickNetSel | null;
  },
): ClickAction[] {
  // RE-CLICKING the pinned tick DESELECTS (2026-08-07 — the toggle every other rung already
  // speaks): the finer metaSnap slot drops with it, and the deselect RESUMES LIVE (live is the
  // default until something is clicked — the FollowController repopulates the card chain and
  // the trail slides back to the live front).
  if (!isLiveTip && current && current.pinnedOrdinal != null && current.pinnedOrdinal === p.data.ordinal) {
    return snapshotClearActions({ metaSnap: current.metaSnap, hasInspect: current.hasInspect, tickNet: current.tickNet });
  }
  const out: ClickAction[] = [];
  // ⚠️ NO SELECTION IN SNAPSHOTS WRITES THE FILTER (user, 2026-10-02: "consistent, and a filter
  // should not be changed from the explorer, so no reset also"). "A filter is a story" (2026-08-07)
  // used to RELEASE the filter here when the pinned tick held nothing of the filtered network, so
  // the explorer's rows reset the top bar while tiles and bands kept it — two behaviours. The
  // filter is the reader's lens and stays what they set; a tick the lens has nothing in is shown
  // as exactly that (the chamber dims, the explorer row is faint, and the rail's Metagraph card
  // stands down — `domain/tickNet.ledgerCardNetwork`).
  // A METAGRAPH SNAPSHOT ANCHORS INTO EXACTLY ONE TICK, so committing a DIFFERENT tick drops it
  // (user, 2026-08-10). This is stronger than the filter's story rule one rung up: that one is
  // about set membership, this is a one-to-one join (`metagraph.timestamp === global.timestamp`),
  // so the held snapshot provably did not anchor here. Left in place it sat directly under the
  // global card in the pile — where ADJACENCY IS CONTAINMENT — stating that tick B contains a
  // snapshot that landed in tick A. Releases first, subject last, like the filter above.
  if (current?.metaSnap && current.metaSnap.globalOrdinal !== p.data.ordinal) {
    out.push({ kind: "metaSnap", sel: null });
  }
  // …and so does the network committed INSIDE the old tick (2026-10-02): it is "this network in
  // THAT tick", so under another tick's card it would claim a membership nobody committed. The
  // resolver already refuses to honour it there (`ledgerNetwork`); this keeps the store honest.
  if (current?.tickNet && current.tickNet.globalOrdinal !== p.data.ordinal) {
    out.push({ kind: "tickNet", sel: null });
  }
  out.push({ kind: "snapshot", pick: p, follow: isLiveTip });
  return out;
}

/** THE NETWORK INSIDE A TICK (user, 2026-10-02) — the ledger's Metagraph rung, committed WITHOUT
 *  the filter. The pager's ∨ from the tick card, its ‹ › between that tick's networks, the byte
 *  bar's band and a snapshot tile's ancestry all land here.
 *
 *  It replaces "the filter IS the step" (2026-09-15): stepping down from a card re-scoped the whole
 *  app — the top bar, the other views, the lists — from a pager, and the commit outlived the visit.
 *  The chamber still answers exactly as it did (the coloured dim, the commit tilt, the Metagraph
 *  card), because every ledger surface resolves through `domain/tickNet.ledgerNetwork`; only the
 *  app-wide lens is left alone.
 *
 *  It always PINS the tick (`follow: false`): the commit is "this network in THIS tick", so a live
 *  tick advancing underneath would orphan it on the next beat. A network the held snapshot does
 *  not belong to drops that snapshot first — releases first, coarse → fine, subject last. */
export function tickNetSelectActions(
  metaId: string,
  global: Extract<PickDescriptor, { kind: "snapshot" }>,
  current: { metaSnap: MetaSnapSel | null; hasInspect?: boolean; net?: string | null },
): ClickAction[] {
  const out: ClickAction[] = [];
  // A NODE hangs under the network it was opened from, so moving to ANOTHER network drops it —
  // the filter's own cascade did this while the rung was the filter; a tick-local commit has no
  // such cascade, and a Dor validator left under "Metagraph Paca" states a membership nobody
  // committed. Finest first, like every release.
  if (current.hasInspect && current.net !== metaId) out.push({ kind: "inspect", pick: null });
  // …by NETWORK KEY: an unlisted snapshot belongs to the unlisted network, whatever its address.
  if (current.metaSnap && netKeyOf(current.metaSnap.metaId) !== metaId) out.push({ kind: "metaSnap", sel: null });
  out.push({ kind: "snapshot", pick: global, follow: false });
  out.push({ kind: "tickNet", sel: { metaId, globalOrdinal: global.data.ordinal } });
  return out;
}

/** The tick-local Metagraph card's × — everything that hangs under it, finest first, then the
 *  network itself. The tick stays: it is the parent, and its own × is `snapshotClearActions`. */
export function tickNetClearActions(current: { metaSnap: MetaSnapSel | null; hasInspect?: boolean }): ClickAction[] {
  const out: ClickAction[] = [];
  if (current.hasInspect) out.push({ kind: "inspect", pick: null });
  if (current.metaSnap) out.push({ kind: "metaSnap", sel: null });
  out.push({ kind: "tickNet", sel: null });
  return out;
}

/** The NETWORK KEY a channel belongs to: its own id when the catalog knows it, else the unlisted
 *  set's (`UNLISTED_KEY`) — every uncatalogued channel is one network as far as the rail's
 *  Metagraph rung goes, exactly as it is one lane in the chamber and one filter in the top bar. */
export const netKeyOf = (metaId: string): string =>
  // A former address keys to its network's CURRENT id (the catalog's `formerIds`).
  METAGRAPHS.find((m) => m.id === metaId || m.formerIds?.includes(metaId) === true)?.id ?? UNLISTED_KEY;

/** The tick-local network a metagraph snapshot's commit carries — and it is ALWAYS written (null
 *  for a seam row), so a snapshot never sits under a network left standing from the previous
 *  commit in the same tick.
 *
 *  ⚠️ AN UNLISTED CHANNEL COMMITS THE UNLISTED NETWORK (user, 2026-10-02: "an unregistered
 *  metagraph … has no corresponding details card, so when we navigate the rung down it jumps
 *  straight to node"). It used to write null — "an unlisted channel names no catalogued network,
 *  so the rung stays honestly empty" — which left the ladder with a hole between the tick and
 *  the snapshot and nothing for ∨ to open. The unlisted set already HAS a dossier (the top bar's
 *  `unlisted` filter opens it), so the rung is that card. */
const tickNetOf = (sel: MetaSnapSel | null, global: Extract<PickDescriptor, { kind: "snapshot" }>): TickNetSel | null =>
  sel ? { metaId: netKeyOf(sel.metaId), globalOrdinal: global.data.ordinal } : null;

/** Does a held node belong to this channel's network? The DAG core's nodes belong to no
 *  metagraph; everything else compares by NETWORK KEY, so a former address and the unlisted set
 *  each match themselves. */
const nodeIsOf = (inspect: PickDescriptor, metaId: string): boolean => {
  const net = pickNetId(inspect);
  return net != null && net !== "dag" && netKeyOf(net) === netKeyOf(metaId);
};

// Metagraph snapshot identity — metaId + ordinal (the snapshot's own ordinal, not the global one).
export const sameMetaSnap = (a: MetaSnapSel | null, b: MetaSnapSel | null): boolean =>
  a === b || (!!a && !!b && a.metaId === b.metaId && a.ordinal === b.ordinal);

/** A TILE on the ledger's upper floor (spec §5.3): the metagraph snapshot itself. The global
 *  tick it anchored into first, the subject LAST — so deselecting the tile steps back to the
 *  tick. `follow: false` because pinning a tile pins its tick; the live heartbeat is the strip's job.
 *
 *  ⚠️ NOT THE FILTER (design session 2026-09-26, decision 13 — the same rule Geography took the
 *  same day). It used to filter-first for a listed metagraph, so browsing a tick's anchors in the
 *  explorer and picking one re-committed the app-wide filter: every other network vanished from
 *  the chamber, the list and the other views, and the commit outlived the visit (user: "click dor,
 *  then click the actual dor snapshot: it does filter"). A snapshot is a record in a tick; the
 *  filter is a lens over the whole app, and only the top bar's picker and the Hypergraph's hub
 *  and network rows set it now.
 *
 *  FULL ANCESTRY IS tick → network → snapshot (user, 2026-10-02: "the parent rung is incomplete;
 *  it should ensure it is complete and also select the related details card"). Dropping the filter
 *  left the Metagraph rung between the two EMPTY, because that rung had no state but the filter.
 *  It commits the tick-local network now (`tickNet`), which fills the rung and writes nothing
 *  app-wide. An UNLISTED channel names no catalogued network, so that rung stays honestly empty. */
export function metaSnapSelectActions(
  sel: MetaSnapSel,
  global: Extract<PickDescriptor, { kind: "snapshot" }>,
  current: {
    metaSnap: MetaSnapSel | null;
    following?: boolean;
    /** The node card's pick, if one is held. REQUIRED, so no caller can forget the rule below. */
    inspect: PickDescriptor | null;
  },
): ClickAction[] {
  // The deselect-toggle applies only to a PINNED selection. While FOLLOWING, the shown subject
  // is auto-selected — clicking it must CONVERT the auto-selection into an explicit pin (the
  // click-scoped decode rule, user 2026-08-07), not silently deselect.
  if (sameMetaSnap(current.metaSnap, sel) && !current.following) return [{ kind: "metaSnap", sel: null }];
  const out: ClickAction[] = [];
  // A SNAPSHOT DROPS THE NODE IT CANNOT CONTAIN (user, 2026-10-03: "remove node"). A node carried
  // in from another view — a DAG validator picked on the globe — stayed in the pile under a
  // Digital Evidence snapshot, where adjacency is containment: the rail said that node belonged
  // to that snapshot. `tickNetSelectActions` already drops a node on a network change; this is
  // the same rule for the commit that reaches the network THROUGH a snapshot. A node of the
  // snapshot's own network stays (its card says whether it signed). Finest first, like every
  // release.
  if (current.inspect && !nodeIsOf(current.inspect, sel.metaId)) out.push({ kind: "inspect", pick: null });
  out.push({ kind: "snapshot", pick: global, follow: false });
  out.push({ kind: "tickNet", sel: tickNetOf(sel, global) });
  out.push({ kind: "metaSnap", sel });
  return out;
}

/** A PLANE in the History view's stack (2026-09-18) — and it is FOCUS ONLY.
 *
 *  ⚠️ The plane does NOT commit its network, and that is a decision rather than an omission. A
 *  committed network filter SCOPES the stack down to that one network, so committing on a plane
 *  click would make the other four planes vanish — the exact opposite of the focused state the
 *  gesture reaches for, where the clicked layer comes forward and the rest hold their depth order
 *  behind it. The top-bar filter stays the separate, deliberate way to scope the stack.
 *
 *  So this is the whole action list: one `trendFocus`, toggling like every other rung's subject
 *  (re-clicking the focused plane releases it — one toggle language everywhere). The executor owns
 *  the one consequence that is not a store write of its own: paging an off-window plane into view.
 */
export function trendPlaneActions(id: string, currentFocus: string | null): ClickAction[] {
  return [{ kind: "trendFocus", id: currentFocus === id ? null : id }];
}

/** The raw layer's ARRIVAL commit — "the layer opens on a subject": with nothing selected the
 *  anchor log commits its own first row when the layer surfaces, so the channel pane opens
 *  populated instead of on an empty state. An arrival is NOT a click, so it has no
 *  deselect toggle; like `metaSnapSelectActions` it never moves the FILTER — a silently
 *  committed network would re-filter the very log the user just opened, and no gesture named a
 *  network. It still pins the tick (`follow: false`), because the pane's deep read is gated on
 *  not-following (an auto-advancing card must never turn the gesture route into a poll), and
 *  the arrival IS the deliberate gesture the read is waiting for. The caller guards the other
 *  half of the rule — an existing selection is never overridden.
 *
 *  ⚠️ `sel` may be NULL, and that is a real arrival, not a no-op: a SEAM row is a global tick that
 *  anchored nothing, so the tick IS the whole subject and the finer metaSnap slot must be CLEARED
 *  rather than left holding a previous row's snapshot. Committing the coarse rung alone and
 *  dropping the finer one is the same shape `snapshotSelectActions` already takes when a pinned
 *  tick changes underneath a metaSnap. */
export function metaSnapArrivalActions(
  sel: MetaSnapSel | null,
  global: Extract<PickDescriptor, { kind: "snapshot" }>,
): ClickAction[] {
  return [
    { kind: "snapshot", pick: global, follow: false },
    // The full ancestry, as a click builds it — and a stale network from the same tick is replaced.
    { kind: "tickNet", sel: tickNetOf(sel, global) },
    { kind: "metaSnap", sel },
  ];
}

/** A BAND on the byte bar (spec §5.3): an aggregate of that metagraph's snapshots in one tick, so
 *  it selects the PAIR — the metagraph and the tick — and drops any finer tile. The neutral
 *  unlisted band names no metagraph, so it commits only the tick. */
export function bandSelectActions(
  metaId: string,
  global: Extract<PickDescriptor, { kind: "snapshot" }>,
  current: { metaSnap: MetaSnapSel | null; hasInspect?: boolean; net?: string | null },
): ClickAction[] {
  const out: ClickAction[] = [];
  // Another network's band drops the node committed under the old one (see `tickNetSelectActions`).
  if (current.hasInspect && current.net !== metaId) out.push({ kind: "inspect", pick: null });
  // The UNLISTED band is the unlisted network's band (see `tickNetOf`), so it commits like any
  // other — and, like every Snapshots selection, leaves the filter as the reader set it.
  if (current.metaSnap) out.push({ kind: "metaSnap", sel: null });
  out.push({ kind: "snapshot", pick: global, follow: false });
  // THE NETWORK HALF OF THE PAIR IS TICK-LOCAL (2026-10-02) — it used to filter-first, the last
  // ledger gesture still committing the app filter; now it is the same commit the tile and the
  // pager's ∨ make (`tickNetSelectActions`), coarse → fine, subject last.
  out.push({ kind: "tickNet", sel: { metaId, globalOrdinal: global.data.ordinal } });
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
  // Resuming live releases the tick-local network first: it is "this network in THAT tick", and
  // left standing it kept the chamber dimmed for it until the next beat — and came back from a
  // plain click on the same tick later.
  if (!following) return [{ kind: "tickNet", sel: null }, { kind: "snapshot", pick: shown, follow: true }];
  return [{ kind: "snapshot", pick: shown, follow: false }];
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
    // deselects, same as the explorer row (the toggle rule; omitted = never toggles).
    pinnedOrdinal?: number | null; metaSnap?: MetaSnapSel | null;
    // …and the network committed inside the pinned tick, which a different tick's click drops.
    tickNet?: TickNetSel | null;
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
      hasInspect: current.hasInspect,
      tickNet: current.tickNet,
    });

  // A node, in any view. (No autoRotate action: geo disables the controls' rotation at mode
  // entry and the inspect subscription re-asserts it on the node flight.)
  return nodeSelectActions(p, { mode, currentFilter: current.filter, compositionSel: input.compositionSel });
}
