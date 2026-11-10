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
import { heldOut } from "./viewNetwork";
import type { Mode } from "@/src/store/store";
import type { LedgerRegister } from "@/src/store/mode";
import type { GlobalSnapshot, PickDescriptor, MetaSnapSel, TickNetSel, BlockSel, DataBlockSel } from "@/src/data/types";
import { METAGRAPHS } from "@/src/engine/config";
import { hasLevel, type CohortSel, type CompositionSel } from "./focusLadder";
import { is3D } from "./viewTransition";
import { UNLISTED_KEY } from "./ledgerBands";
import { VIEW_POLICIES, drawsDataBlocks, readsBlockWindow } from "./viewPolicy";

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
  // The network the rail is browsing (`domain/viewNetwork.ts`), never the filter.
  | { kind: "railNet"; id: string | null }
  | { kind: "metaSnap"; sel: MetaSnapSel | null }
  // Commit/clear a BLOCK in the Snapshots view's Blocks register — a slot under its tick, not a
  // ladder rung: see `blockSelectActions`.
  | { kind: "block"; sel: BlockSel | null }
  | { kind: "dataBlock"; sel: DataBlockSel | null }
  // Bring a trend plane forward, or release the focused one (null) — a VIEW-LOCAL emphasis, not a
  // selection rung: see `trendPlaneActions`.
  | { kind: "trendFocus"; id: string | null }
  // Move History's time cursor — the Moment card's ‹ › through the moments of a committed Range
  // (2026-10-07). Like `trendFocus`, a view-local subject, not a ladder rung: no pose, no cascade.
  | { kind: "trendCursor"; ms: number | null };

/** A BLOCK'S PLACE IN THE RAIL (2026-11-08 — user: a DAG block reached under a DED metagraph snapshot,
 *  "this must be much more structurally sound"). A DAG block is the global's own: Global → Block, no
 *  network or metagraph snapshot between. A token block is its accepting metagraph snapshot's:
 *  Global → Metagraph → Metagraph snapshot → Block. `blockInPlace` says whether the parents a builder
 *  commits (or the rail shows) are the block's: the tick must be its own; a DAG block stands under no
 *  metagraph snapshot and no tick-network but the DAG's; a token block stands under its own snapshot
 *  (or none yet) and no other network. A parent left `undefined` is not judged (the builder leaves it
 *  as it stands). Every builder that commits a parent releases a block out of place (`releaseBlock`,
 *  the one release), the card renders only in place (`railCards.parentHolds`), and the ghost's step
 *  offers only blocks in place (`railSiblings.blockStep`). */
export function blockInPlace(
  block: BlockSel,
  parents: { globalOrdinal?: number | null; metaSnap?: MetaSnapSel | null; tickNet?: { metaId: string } | null },
): boolean {
  if (parents.globalOrdinal != null && parents.globalOrdinal !== block.anchorOrd) return false;
  const ms = parents.metaSnap;
  const tn = parents.tickNet;
  // The same network: the DAG by its own id, a listed chain by its catalog key (a former address keys
  // to its current id), anything else by the raw id — the unlisted set is never one network here.
  const sameNet = (a: string, b: string): boolean => a === b || (netKeyOf(a) === netKeyOf(b) && netKeyOf(a) !== UNLISTED_KEY);
  if (block.chain === "dag") return !ms && (!tn || tn.metaId === "dag");
  if (ms && !(ms.metaId === block.chain && ms.ordinal === block.ordinal)) return false;
  return !tn || sameNet(tn.metaId, block.chain);
}

/** A BLOCK IS IN EXACTLY ONE SNAPSHOT (spec, "Rules"): every builder that pins a tick releases a
 *  committed block that tick cannot contain, FIRST (finest first); a builder that keeps the block's
 *  own tick (`anchorOrd`) keeps the block. The one release of a block a commit leaves out of place
 *  (`blockInPlace`), so no builder re-derives it. */
function releaseBlock(
  out: ClickAction[],
  block: BlockSel | null | undefined,
  parents: { globalOrdinal?: number | null; metaSnap?: MetaSnapSel | null; tickNet?: { metaId: string } | null },
): void {
  if (block && !blockInPlace(block, parents)) out.push({ kind: "block", sel: null });
}

/** A DATA BLOCK IS IN EXACTLY ONE METAGRAPH SNAPSHOT (the Data block card, 2026-11-07): a builder
 *  that commits another snapshot, or none, releases it first — the one home of that release. */
function releaseDataBlock(out: ClickAction[], dataBlock: DataBlockSel | null | undefined, keep: MetaSnapSel | null): void {
  if (dataBlock && !(keep && sameMetaSnap(keep, dataBlock.snap))) out.push({ kind: "dataBlock", sel: null });
}
export const sameDataBlock = (a: DataBlockSel | null, b: DataBlockSel | null): boolean =>
  !!a && !!b && a.index === b.index && sameMetaSnap(a.snap, b.snap);

// The network a node pick belongs to: its metagraph, or the DAG core for a validator.
export const pickNetId = (p: PickDescriptor): string | null =>
  p.kind === "metanode" ? p.meta?.id ?? null : p.kind === "l0" || p.kind === "l1" ? "dag" : null;

// Whether a pick participates in hover/click AT ALL — the per-view activity gate the Engine
// applies to every raycast hit before it reaches clickActions/tooltips.
//  - A registered-but-node-less metagraph hub is shown (dim) but never selectable, matching
//    its inactive look + its "registered · no live nodes" filter chip (`activeMetaIds` null =
//    counts not loaded yet → all allowed).
//  - GEO: a node off the network the view stands on stays on screen, dimmed, and answers nothing,
//    under a browse too; the country drill is a LENS, so it does NOT gate picking.
//  - HYPER (and elsewhere): every node stays interactive — off-focus ones are only dimmed,
//    and clicking one drills into its network (gating them out read as a bug).
//  - A FILTER (`held`, the real one, never a browse) holds a view that browses: another network's
//    hub and nodes stay on screen, dimmed, and do not respond (`viewNetwork.heldOut`).
export function pickActive(
  p: PickDescriptor,
  mode: Mode,
  filter: string,
  activeMetaIds: ReadonlySet<string> | null,
  held = "all",
): boolean {
  const net = p.kind === "meta" ? p.cfg.id : p.kind === "core" ? "dag" : pickNetId(p);
  if (VIEW_POLICIES[mode].railBrowses && net != null && heldOut(held, net)) return false;
  if (p.kind === "meta") return !activeMetaIds || activeMetaIds.has(p.cfg.id);
  if (mode !== "geo") return true;
  const id = p.kind === "l0" || p.kind === "l1" ? "dag" : p.kind === "metanode" ? p.meta?.id : undefined;
  if (id === undefined) return true; // non-node picks (snapshot) are view-gated by pickSources
  return filter === "all" || filter === id;
}

// The country zoom-level TOGGLE — shared by the scene's empty-click-on-a-country and
// GeoExplore's country row (`drill`). Entering/leaving a country level drops the finer rungs
// first (the zoom-level rule — finerLevels("geo","country") = ["node","cohort"]): a selected
// node, then a committed cohort. The committed country is RELEASED only while it is the finest
// rung: with a node or a provider held under it, the click steps up TO the country (user,
// 2026-11-03: a click on the country from a node's close-up "should give that the focus but it
// zooms out entirely").
export function countryToggleActions(
  cc: string,
  current: { country: string | null; hasInspect: boolean; cohort: CohortSel | null },
): ClickAction[] {
  const finest = !current.hasInspect && !current.cohort;
  const acts: ClickAction[] = [];
  if (current.hasInspect) acts.push({ kind: "inspect", pick: null });
  if (current.cohort) acts.push({ kind: "cohort", sel: null });
  acts.push({ kind: "country", cc: current.country === cc && finest ? null : cc });
  return acts;
}

/** The Country card's × — releases the country and everything finer, whatever is held under it. */
export function countryClearActions(current: { hasInspect: boolean; cohort: CohortSel | null }): ClickAction[] {
  const acts: ClickAction[] = [];
  if (current.hasInspect) acts.push({ kind: "inspect", pick: null });
  if (current.cohort) acts.push({ kind: "cohort", sel: null });
  acts.push({ kind: "country", cc: null });
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

/** A PAGER STEP KEEPS THE NETWORK (user, 2026-11-09: "provider card, swipe it, metagraph content drops
 *  and it becomes a ghost at the bottom"; then, of a first cut that fell back to another network's
 *  node: "close the node, don't switch the network"). In Geography the Metagraph card is the held
 *  NODE's network, so a provider or country step that released the node emptied the card above it.
 *  With a node held the step either CARRIES it — `carry`, a node of the SAME network in the new scope
 *  (its cohort with it for a country step) — or, where the scope has none, closes the node and keeps
 *  its network as the rail's browse (`keepNet`, `railNet`: never the filter). The swiped rung goes
 *  LAST either way, so it keeps the box. With no node held it is the plain toggle; a step is never
 *  the same subject (the pager steps away), so it never toggles off. */
export function cohortStepActions(
  c: CohortSel,
  current: { cohort: CohortSel | null; hasInspect: boolean },
  carry: PickDescriptor | null,
  keepNet: string | null = null,
): ClickAction[] {
  if (current.hasInspect && carry) return [{ kind: "inspect", pick: carry }, { kind: "cohort", sel: c }];
  // The browse goes FIRST: a network change clears the country drill (the Engine's network-switch
  // clear), so the provider's country is re-committed after it, then the provider.
  if (current.hasInspect && keepNet) return [{ kind: "inspect", pick: null }, { kind: "railNet", id: keepNet }, { kind: "country", cc: c.cc }, { kind: "cohort", sel: c }];
  return cohortToggleActions(c, current);
}
export function countryStepActions(
  cc: string,
  current: { country: string | null; hasInspect: boolean; cohort: CohortSel | null },
  carry: { pick: PickDescriptor; cohort: CohortSel } | null,
  keepNet: string | null = null,
): ClickAction[] {
  if (current.hasInspect && carry) return [{ kind: "inspect", pick: carry.pick }, { kind: "cohort", sel: carry.cohort }, { kind: "country", cc }];
  if (current.hasInspect && keepNet) return [...countryToggleActions(cc, current).slice(0, -1), { kind: "railNet", id: keepNet }, { kind: "country", cc }];
  return countryToggleActions(cc, current);
}

/** THE AI CARD'S PROVIDER ROW (user, 2026-10-31): the cohort rung's toggle, for a row that names a
 *  provider rather than sitting under a drilled country, so it brings its country along. The node
 *  goes first, as `cohortToggleActions`; the country before its cohort, which hangs under it. */
export function noteCohortActions(
  c: CohortSel,
  current: { country: string | null; cohort: CohortSel | null; hasInspect: boolean },
): ClickAction[] {
  const acts: ClickAction[] = [];
  if (current.hasInspect) acts.push({ kind: "inspect", pick: null });
  if (current.country !== c.cc) acts.push({ kind: "country", cc: c.cc });
  acts.push({ kind: "cohort", sel: sameCohort(current.cohort, c) ? null : c });
  return acts;
}

// Composition-group identity — network + group key (the `${label}|${codes}` HyperExplore builds).
export const sameComposition = (a: CompositionSel | null, b: CompositionSel | null): boolean =>
  !!a && !!b && a.netId === b.netId && a.key === b.key;

// The COMPOSITION zoom-level TOGGLE (user, 2026-08-02) — HyperExplore's group row. A group is
// network-scoped, so the row stands the view on its NETWORK first (only when it changes, the no-churn
// rule; the Engine's network subscription clears every finer rung, which is why the composition
// commit must come after it), then drops the finer node selection (finerLevels("hyper","composition")),
// then commits the group itself. Re-clicking the committed group clears it — one toggle language.
export function compositionToggleActions(
  c: CompositionSel,
  current: { composition: CompositionSel | null; hasInspect: boolean; filter: string },
): ClickAction[] {
  const acts: ClickAction[] = [];
  if (c.netId !== current.filter) acts.push({ kind: "railNet", id: c.netId });
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
// other row of that explorer moves it (`metaSnapSelectActions`, decision 13). Only hyper stands the
// view on the node's network first (a node is a bead on its hub's shell; the network is what dims
// the other hubs and frames the hub, and the node rung inherits that framing), as a browse, never
// the filter (user, 2026-11-02: "one rule everywhere") — `viewPolicy.nodeCommitsNetwork` is the
// allow-list. Full-ancestry rule
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
  if (netId && netId !== opts.currentFilter && (opts.commitNetwork ?? VIEW_POLICIES[opts.mode].nodeCommitsNetwork)) acts.push({ kind: "railNet", id: netId });
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
// view would have committed, no inspect (it's already open). EXCEPT THE NETWORK (user, 2026-11-02: "as
// they fly between the views their focus should be kept"): a browse clears on leaving and the node
// carries, so a view whose node stands on its network does so again, and the node commits after it,
// because a network change clears what was picked under the old one. A non-node pick (a dossier, a
// snapshot) has no ancestry and yields nothing.
export function viewEntryActions(opts: {
  mode: Mode;
  filter: string;
  pick: PickDescriptor | null;
  compositionSel?: CompositionSel | null;
}): ClickAction[] {
  const { pick } = opts;
  if (!pick) return [];
  // A FILTER HOLDS THE VIEW (`viewNetwork.heldOut`): Snapshots can pick a node of another network
  // inside a tick, and carrying it here would step around the filter, so it stays behind.
  const held = pickNetId(pick);
  if (VIEW_POLICIES[opts.mode].railBrowses && held && heldOut(opts.filter, held)) return [{ kind: "inspect", pick: null }];
  const ancestry = nodeAncestryActions(pick, opts);
  const netId = VIEW_POLICIES[opts.mode].nodeCommitsNetwork ? pickNetId(pick) : null;
  return netId && netId !== opts.filter ? [{ kind: "railNet", id: netId }, ...ancestry, { kind: "inspect", pick }] : ancestry;
}

// The network-filter TOGGLE — the FilterPicker's committed-row rule: picking the committed
// metagraph again steps back to "all" (one toggle language everywhere); "all" itself never
// toggles off.
export function filterToggleActions(id: string, currentFilter: string, railNet: string | null = null): ClickAction[] {
  // Browsing, the filter's own network is the way back (`railNetActions`), not a re-pick.
  if (railNet != null && id === currentFilter) return [{ kind: "railNet", id: null }];
  return [{ kind: "filter", id: id !== "all" && id === currentFilter ? "all" : id }];
}

/** ONE RULE (user, 2026-11-02: "yes make it one rule everywhere"): only the top bar sets the filter.
 *  A step on a rail or a row naming a network stands the view on it, and leaves the filter alone.
 *  `current` is what the step comes back from: the network it would end the browse on. */
export function railNetActions(id: string, current: string): ClickAction[] {
  return [{ kind: "railNet", id: id === current ? null : id }];
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
export function snapshotClearActions(current: { metaSnap: MetaSnapSel | null; tickNet?: TickNetSel | null; block?: BlockSel | null; dataBlock?: DataBlockSel | null }): ClickAction[] {
  const out: ClickAction[] = [];
  // A BLOCK hangs under its tick (it is in exactly one snapshot), so it goes with it, finest first —
  // and a DATA BLOCK under its metagraph snapshot, finer still. A held NODE is not the tick's: the
  // ledger has no node rung (2026-11-08), so a node carried in from Hypergraph or Geography is shown
  // nowhere here and HOLDS, for the view it came from (the "NO SNAPSHOTS BUILDER RELEASES THE NODE" note).
  if (current.dataBlock) out.push({ kind: "dataBlock", sel: null });
  if (current.block) out.push({ kind: "block", sel: null });
  if (current.metaSnap) out.push({ kind: "metaSnap", sel: null });
  // The network committed INSIDE this tick hangs under it by construction, so it goes with it.
  if (current.tickNet) out.push({ kind: "tickNet", sel: null });
  out.push({ kind: "snapshot", pick: null, follow: true });
  return out;
}

/** A GLOBAL SNAPSHOT AS A PICK — the descriptor every surface hands the builders for a tick (its row,
 *  its plate, its band, the follow's advance). One home for the shape and its title (refactor round
 *  R1, P6: it was written inline sixteen times). */
export function globalPick(g: GlobalSnapshot): Extract<PickDescriptor, { kind: "snapshot" }> {
  return { kind: "snapshot", title: `Global snapshot #${g.ordinal}`, data: g };
}

/** THE TICK CONTEXT a builder reads off the selection as it stands: the pinned tick (none while
 *  following — live is no pin), the metagraph snapshot and the network committed inside it, the
 *  committed block and the follow. Every surface that hands a builder its `current` reads it here
 *  rather than building it by hand (refactor round R1, P6: seven copies), so the next slot one rung
 *  finer is one line, not a sweep. `block` is REQUIRED in the answer, so a builder that requires it
 *  still gets it by construction. Structural over the store's own fields, so the engine, the scene's
 *  pager model and the components all pass their state as it is. */
export type TickContext = {
  pinnedOrdinal: number | null;
  metaSnap: MetaSnapSel | null;
  tickNet: TickNetSel | null;
  block: BlockSel | null;
  following: boolean;
  /** The committed data block, if one is held — another tick's pin drops it (2026-11-08). */
  dataBlock: DataBlockSel | null;
};
export function tickContextOf(s: {
  following: boolean;
  snap: { data: { ordinal: number } } | null;
  metaSnap: MetaSnapSel | null;
  tickNet?: TickNetSel | null;
  block?: BlockSel | null;
  dataBlock?: DataBlockSel | null;
}): TickContext {
  return { pinnedOrdinal: !s.following && s.snap ? s.snap.data.ordinal : null, metaSnap: s.metaSnap, tickNet: s.tickNet ?? null, block: s.block ?? null, following: s.following, dataBlock: s.dataBlock ?? null };
}

export function snapshotSelectActions(
  p: Extract<PickDescriptor, { kind: "snapshot" }>,
  isLiveTip: boolean,
  current?: {
    pinnedOrdinal: number | null;
    metaSnap: MetaSnapSel | null;
    /** The network committed inside the pinned tick, if any — it belongs to THAT tick. */
    tickNet?: TickNetSel | null;
    /** The committed block, if any — it is in exactly one tick. */
    block?: BlockSel | null;
    /** The committed data block, if any — in exactly one snapshot, so another tick's pin drops it
     *  (2026-11-08: a pin from the explorer left a live-seated data block in the store). */
    dataBlock?: DataBlockSel | null;
  },
): ClickAction[] {
  // RE-CLICKING the pinned tick DESELECTS (2026-08-07 — the toggle every other rung already
  // speaks): the finer metaSnap slot drops with it, and the deselect RESUMES LIVE (live is the
  // default until something is clicked — the FollowController repopulates the card chain and
  // the trail slides back to the live front).
  if (!isLiveTip && current && current.pinnedOrdinal != null && current.pinnedOrdinal === p.data.ordinal) {
    return snapshotClearActions({ metaSnap: current.metaSnap, tickNet: current.tickNet, block: current.block });
  }
  const out: ClickAction[] = [];
  // A DATA BLOCK IS IN EXACTLY ONE SNAPSHOT, finest of all: another tick's pin drops it first.
  if (current?.dataBlock && current.dataBlock.snap.globalOrdinal !== p.data.ordinal) out.push({ kind: "dataBlock", sel: null });
  // A BLOCK IS IN EXACTLY ONE SNAPSHOT (spec, "Rules"), so committing another tick drops it — the
  // metagraph snapshot's one-to-one rule below, one slot finer. Finest first.
  releaseBlock(out, current?.block, { globalOrdinal: p.data.ordinal });
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
 *  The chamber still answers exactly as it did (the coloured dim, the Metagraph
 *  card), because every ledger surface resolves through `domain/tickNet.ledgerNetwork`; only the
 *  app-wide lens is left alone.
 *
 *  It always PINS the tick (`follow: false`): the commit is "this network in THIS tick", so a live
 *  tick advancing underneath would orphan it on the next beat. A network the held snapshot does
 *  not belong to drops that snapshot first — releases first, coarse → fine, subject last. */
export function tickNetSelectActions(
  metaId: string,
  global: Extract<PickDescriptor, { kind: "snapshot" }>,
  current: {
    metaSnap: MetaSnapSel | null;
    /** The committed block — REQUIRED, so no caller can forget that another tick drops it. */
    block: BlockSel | null;
  },
): ClickAction[] {
  const out: ClickAction[] = [];
  releaseBlock(out, current.block, { globalOrdinal: global.data.ordinal, tickNet: { metaId } });
  // A held node is left alone: the ledger shows none, and it holds for the view it came from.
  // A snapshot of another network goes, finest first —
  // …by NETWORK KEY: an unlisted snapshot belongs to the unlisted network, whatever its address.
  if (current.metaSnap && netKeyOf(current.metaSnap.metaId) !== metaId) out.push({ kind: "metaSnap", sel: null });
  out.push({ kind: "snapshot", pick: global, follow: false });
  out.push({ kind: "tickNet", sel: { metaId, globalOrdinal: global.data.ordinal } });
  return out;
}

/** The tick-local Metagraph card's × — everything that hangs under it, finest first, then the
 *  network itself. The tick stays: it is the parent, and its own × is `snapshotClearActions`. */
export function tickNetClearActions(current: { metaSnap: MetaSnapSel | null }): ClickAction[] {
  const out: ClickAction[] = [];
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

/** ⚠️ NO SNAPSHOTS BUILDER RELEASES THE NODE (user, 2026-11-10: a node carried into Snapshots is
 *  shown nowhere there, "but the selection must survive so returning brings it back"). The ledger's
 *  ladder has no node rung and the view no node card (2026-11-08), so the releases that used to
 *  drop a node under a tile, a band, a network, a tick's × or a resume of LIVE protected a rung that
 *  is gone — and destroyed the Hypergraph or Geography selection the reader would return to. The
 *  node is that view's subject, carried across Snapshots untouched (`LEVEL_CARRY.node`).
 *  `pickActions.test.ts` pins that no builder here emits an `inspect`. */
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
 *  filter is a lens over the whole app, and only the top bar's picker sets it now.
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
    /** The committed block — REQUIRED, so no caller can forget that another tick drops it. */
    block: BlockSel | null;
    /** The committed data block: another snapshot's commit releases it (optional — a surface that
     *  cannot hold one leaves it; presence stands it down regardless, `parentHolds`). */
    dataBlock?: DataBlockSel | null;
  },
): ClickAction[] {
  // The deselect-toggle applies only to a PINNED selection. While FOLLOWING, the shown subject
  // is auto-selected — clicking it must CONVERT the auto-selection into an explicit pin (the
  // click-scoped decode rule, user 2026-08-07), not silently deselect.
  if (sameMetaSnap(current.metaSnap, sel) && !current.following) return [{ kind: "metaSnap", sel: null }];
  const out: ClickAction[] = [];
  // A STEP INSIDE THE LIVE PAIR STAYS LIVE (user, 2026-11-03: "if we swipe metagraph snapshots
  // we're still within the 'live' global … so it should not become pinned"). Following, with the
  // live card on this network's snapshot in the live global, another snapshot of the SAME network
  // in the SAME global is held without pinning the global; `followLatest` keeps it until the next
  // global arrives. The shown subject itself still converts to a pin (the rule above).
  const live = current.following ? current.metaSnap : null;
  if (live && !sameMetaSnap(live, sel) && live.metaId === sel.metaId && live.globalOrdinal === sel.globalOrdinal && global.data.ordinal === sel.globalOrdinal) {
    releaseBlock(out, current.block, { globalOrdinal: global.data.ordinal, metaSnap: sel });
    releaseDataBlock(out, current.dataBlock, sel);
    out.push({ kind: "metaSnap", sel: { ...sel, held: true } });
    return out;
  }
  // What hangs under another snapshot goes, finest first. A held node stays: the ledger draws no node
  // card, so no pile states it belongs to this snapshot, and it holds for the view it came from.
  releaseBlock(out, current.block, { globalOrdinal: global.data.ordinal, metaSnap: sel });
  releaseDataBlock(out, current.dataBlock, sel);
  out.push({ kind: "snapshot", pick: global, follow: false });
  out.push({ kind: "tickNet", sel: tickNetOf(sel, global) });
  out.push({ kind: "metaSnap", sel });
  return out;
}

/** A DATA BLOCK in the Data blocks register (2026-11-07, user: "a data block is just like a tx block")
 *  — a slot under the metagraph snapshot that carried it: committing it commits that snapshot's
 *  chain first (the tick pinned, the network, the snapshot — `metaSnapSelectActions`, unless the
 *  snapshot already stands pinned), then the data block, last so it ranks and its card is the box.
 *  The same data block again releases the data block alone. No rung, no pose. */
export function dataBlockSelectActions(
  sel: DataBlockSel,
  global: Extract<PickDescriptor, { kind: "snapshot" }>,
  current: { dataBlock: DataBlockSel | null; metaSnap: MetaSnapSel | null; following?: boolean; block: BlockSel | null },
): ClickAction[] {
  if (sameDataBlock(current.dataBlock, sel)) return [{ kind: "dataBlock", sel: null }];
  const out: ClickAction[] = [];
  const pinnedHere = sameMetaSnap(current.metaSnap, sel.snap) && !current.following;
  if (!pinnedHere) out.push(...metaSnapSelectActions(sel.snap, global, { metaSnap: current.metaSnap, following: current.following, block: current.block, dataBlock: current.dataBlock }));
  else if (current.dataBlock) out.push({ kind: "dataBlock", sel: null });
  out.push({ kind: "dataBlock", sel });
  return out;
}

/** THE METAGRAPH SNAPSHOT CARD'S × (2026-11-08): what hangs under the snapshot goes with it, finest
 *  first — its data block, a token block it accepted — then the snapshot; the tick and its network stay. */
export function metaSnapClearActions(current: { metaSnap: MetaSnapSel | null; block?: BlockSel | null; dataBlock?: DataBlockSel | null }): ClickAction[] {
  if (!current.metaSnap) return [];
  const out: ClickAction[] = [];
  releaseDataBlock(out, current.dataBlock, null);
  if (current.block && current.block.chain !== "dag" && current.block.chain === current.metaSnap.metaId && current.block.ordinal === current.metaSnap.ordinal) out.push({ kind: "block", sel: null });
  out.push({ kind: "metaSnap", sel: null });
  return out;
}

/** The Data block card's ×: the data block alone, its snapshot stays. */
export function dataBlockClearActions(current: { dataBlock: DataBlockSel | null }): ClickAction[] {
  return current.dataBlock ? [{ kind: "dataBlock", sel: null }] : [];
}

/** A BLOCK in the Snapshots view's Blocks register (2026-11-05) — a SLOT under the global that
 *  accepted it (a DAG block) or anchored its metagraph snapshot (a token block), like a tile: no
 *  focus rung, no pose of its own (camera principle 2: the chamber's one pose holds).
 *
 *  Selecting it PINS that global (`follow: false`), so the tick is the card above the block's — a
 *  live follow would walk the card away from the block on the next beat. The pin is left alone
 *  when it already stands on that tick, and what hangs under ANOTHER tick (its metagraph snapshot,
 *  the network committed inside it) is released first, as `snapshotSelectActions` does: coarse
 *  releases, then the tick, subject last. The same block again releases the block alone (the
 *  toggle every rung speaks), leaving the tick pinned. */
export function blockSelectActions(
  b: BlockSel,
  global: Extract<PickDescriptor, { kind: "snapshot" }>,
  current: {
    block: BlockSel | null;
    pinnedOrdinal: number | null;
    metaSnap?: MetaSnapSel | null;
    tickNet?: TickNetSel | null;
    /** LIVE in the Blocks register follows the newest block (D3): the block shown while following
     *  is the follow's, not a pick, so clicking it PINS it rather than releasing it. */
    following?: boolean;
  },
  /** A TOKEN block's accepting metagraph snapshot (`blockWindow.blockMetaSnap`; the scene pick carries
   *  it): committed with the block — its network too — so the rail reads Metagraph → Metagraph
   *  snapshot → Block, the block the box (user, 2026-11-07: "automatically also populate its
   *  metagraph snapshot card, but open the block card as that's the subject"). Null for a DAG block:
   *  its accepting snapshot is the global itself, the card already above it. */
  snapOf: MetaSnapSel | null = null,
): ClickAction[] {
  const same = !!current.block && current.block.chain === b.chain && current.block.hash === b.hash;
  if (same && !current.following) return [{ kind: "block", sel: null }];
  const out: ClickAction[] = [];
  // THE BLOCK'S CHAIN, coarse to fine, the block last so it ranks (its card is the box): the global
  // pinned, then the network and the snapshot the window names, then the block.
  // A DAG block's place is the global alone (`blockInPlace`): a metagraph snapshot or a network of
  // another chain standing in this tick leaves with the commit, finest first (user, 2026-11-08: a DAG
  // block had been opened under a DED snapshot). A token block's parents are restated below.
  if (!snapOf) {
    if (current.metaSnap && (current.metaSnap.globalOrdinal !== b.anchorOrd || !blockInPlace(b, { metaSnap: current.metaSnap }))) out.push({ kind: "metaSnap", sel: null });
    if (current.tickNet && (current.tickNet.globalOrdinal !== b.anchorOrd || !blockInPlace(b, { tickNet: current.tickNet }))) out.push({ kind: "tickNet", sel: null });
  }
  if (same || current.pinnedOrdinal !== b.anchorOrd) out.push({ kind: "snapshot", pick: global, follow: false });
  if (snapOf) {
    out.push({ kind: "tickNet", sel: tickNetOf(snapOf, global) });
    if (!sameMetaSnap(current.metaSnap ?? null, snapOf)) out.push({ kind: "metaSnap", sel: snapOf });
  }
  out.push({ kind: "block", sel: b });
  return out;
}

/** SWITCHING THE SNAPSHOTS VIEW'S REGISTER releases what the register it enters cannot draw: only
 *  Transaction blocks draws a block, and it is the one register that draws no metagraph snapshot —
 *  entering it drops the committed metagraph snapshot, entering either other (Metagraph snapshots or
 *  Data blocks, whose subjects are the same snapshots — D6) drops the block. The pin (`snap`) and the
 *  committed network (`tickNet`) are the tick's own and stay. Finest first, like every release;
 *  `switchLedgerRegister` applies it through the executor. */
export function registerSwitchActions(
  to: LedgerRegister,
  current: { block: BlockSel | null; metaSnap: MetaSnapSel | null; dataBlock?: DataBlockSel | null },
  /** Is the held metagraph snapshot a SUBJECT of the register entered (`ladderLevels.snapshotIsSubject`
   *  — the caller judges it against the exact read and the block window)? `false` releases it: a tile
   *  the register does not draw can hold no card (2026-11-08). `undefined` (unknown) keeps it. */
  metaSnapIsSubject: boolean | undefined = true,
): ClickAction[] {
  const out: ClickAction[] = [];
  // A data block is the Data blocks register's alone: any other register drops it, finest first.
  if (current.dataBlock && !drawsDataBlocks(to)) out.push({ kind: "dataBlock", sel: null });
  // A block is Transaction blocks' alone.
  if (current.block && !readsBlockWindow(to)) out.push({ kind: "block", sel: null });
  // The metagraph snapshot stays wherever it is the register's subject (a block-carrying one in
  // Transaction blocks stands under its token block); one the register cannot draw goes.
  if (current.metaSnap && metaSnapIsSubject === false) out.push({ kind: "metaSnap", sel: null });
  return out;
}

/** THE BLOCK CARD'S LIVE / PINNED CONTROL (D3 — in the Blocks register live follows the newest
 *  block, so the control rides the Block card, not the Global snapshot card). Either way the block
 *  is re-committed LAST, so it RANKS and its card stays the box the reader pressed (the live advance
 *  never ranks it, and the snapshot action ahead of it ranks the Global card). LIVE pins what is on
 *  screen: the global pinned, the block kept. PINNED resumes: the tick-local network released, the
 *  follow turned on, and the follow's next beat re-seats the newest block (`followLatest`). */
export function blockFollowActions(
  block: BlockSel,
  global: Extract<PickDescriptor, { kind: "snapshot" }>,
  following: boolean,
): ClickAction[] {
  if (!following) return [{ kind: "tickNet", sel: null }, { kind: "snapshot", pick: global, follow: true }, { kind: "block", sel: block }];
  return [...followToggleActions(global, true, block), { kind: "block", sel: block }];
}

/** The Block card's × — releases the block alone; the tick it hangs under stays pinned. */
export function blockClearActions(current: { block: BlockSel | null }): ClickAction[] {
  return current.block ? [{ kind: "block", sel: null }] : [];
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

/** A NOTABLE DAY BELONGS TO A CHART (user, 2026-10-30): under All, committing one brings its plane
 *  forward, the explorer row's own commit (a whole-network day's plane is the hypergraph's, "dag").
 *  It commits and never toggles: a plane already forward stays forward. Under a filter it does
 *  nothing, and that is the rule rather than a gap: the filter is the top bar's alone, and a
 *  filtered stack holds only its own plane, so a focus could name a chart that is not there. */
export function noteDayActions(networkId: string | null, filter: string, currentFocus: string | null): ClickAction[] {
  const id = networkId ?? "dag";
  return filter !== "all" || currentFocus === id ? [] : [{ kind: "trendFocus", id }];
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
  /** The committed block — REQUIRED, so no caller can forget that another tick drops it. */
  block: BlockSel | null,
): ClickAction[] {
  const out: ClickAction[] = [];
  releaseBlock(out, block, { globalOrdinal: global.data.ordinal, metaSnap: sel });
  return [
    ...out,
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
  current: {
    metaSnap: MetaSnapSel | null;
    /** The committed block — REQUIRED, so no caller can forget that another tick drops it. */
    block: BlockSel | null;
  },
): ClickAction[] {
  const out: ClickAction[] = [];
  releaseBlock(out, current.block, { globalOrdinal: global.data.ordinal, tickNet: { metaId } });
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
  /** The committed block — REQUIRED, so no caller can forget it hangs under one tick. */
  block: BlockSel | null,
): ClickAction[] {
  // Resuming live releases the tick-local network first: it is "this network in THAT tick", and
  // left standing it kept the chamber dimmed for it until the next beat — and came back from a
  // plain click on the same tick later. A committed BLOCK goes for the same reason, whatever tick
  // is shown: live walks the card off its tick on the next beat. Finest first. A held NODE stays
  // (user, 2026-11-10): the ledger has no node rung, so the node is not live's to release — it is
  // the Hypergraph or Geography selection the reader returns to.
  if (!following) {
    return [
      ...(block ? [{ kind: "block", sel: null } as const] : []),
      { kind: "tickNet", sel: null },
      { kind: "snapshot", pick: shown, follow: true },
    ];
  }
  // Pinning what is on screen keeps a block of that tick and drops one of any other.
  const out: ClickAction[] = [];
  releaseBlock(out, block, { globalOrdinal: shown.data.ordinal });
  out.push({ kind: "snapshot", pick: shown, follow: false });
  return out;
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
    // …and the committed block (the Blocks register), which a block click toggles and a different
    // tick's click drops.
    block?: BlockSel | null;
    // …and whether the view is following, which turns a click on the LIVE block into its pin (D3).
    following?: boolean;
  };
}): ClickAction[] {
  const { mode, pick: p, countryCc, current } = input;

  // Empty click on a drillable country: toggle its drill — the scene twin of the explorer
  // row. Mode-gated here TOO (the Engine only resolves countryCc in geo, but the table stays
  // safe on its own).
  if (!p) return mode === "geo" && countryCc ? countryToggleActions(countryCc, current) : [];

  // A hub click stands the view on its network (opens its context pane + frames it).
  if (p.kind === "meta") return [{ kind: "railNet", id: p.cfg.id }];

  // The ledger's snapshot bands: a scene band is never the strip's live tip — it pins, and
  // re-clicking the pinned tick's band deselects (the same tested toggle the explorer runs).
  if (p.kind === "snapshot")
    return snapshotSelectActions(p, false, {
      pinnedOrdinal: current.pinnedOrdinal ?? null,
      metaSnap: current.metaSnap ?? null,
      tickNet: current.tickNet,
      block: current.block,
    });

  // A block (the Blocks register): the block AND the tick that carries it, one builder for the
  // scene and the explorer's row alike.
  if (p.kind === "block")
    return blockSelectActions(p.sel, p.global, {
      block: current.block ?? null,
      pinnedOrdinal: current.pinnedOrdinal ?? null,
      metaSnap: current.metaSnap ?? null,
      tickNet: current.tickNet,
      following: current.following,
    }, p.snap ?? null);

  // A node, in a view whose ladder HAS a node rung (user, 2026-11-08: the Snapshots view lost its
  // node card and rung — a tray chip there previews on hover and commits nothing; the signer rows
  // are readings). No autoRotate action: geo disables the controls' rotation at mode entry and the
  // inspect subscription re-asserts it on the node flight.
  if (!is3D(mode) || !hasLevel(mode, "node")) return [];
  return nodeSelectActions(p, { mode, currentFilter: current.filter, compositionSel: input.compositionSel });
}
