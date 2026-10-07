// The FOCUS card's SIBLING SET — the pure resolver behind the pager/swipe on the materialized
// box (card redesign, 2026-08-08). Given the focus slot and the committed selection state, it
// answers: what are the OTHER subjects at this rung inside the same committed parent, where does
// the current subject sit among them, and what tested actions step to each one?
//
// Design rules (settled with the slab):
// - PURE data-in/data-out, sibling to railCards.ts — no store reads, no React. Every step's
//   actions come from the pickActions BUILDERS (one selection write path: the pager applies them
//   through applyClickActions, so a pager step and the equivalent explorer click can't drift).
// - The item at `index` is the CURRENT subject: its builder output is a DESELECT-toggle by
//   construction (every toggle builder deselects when handed the committed subject) — the pager
//   must never invoke it. Stepping to a DIFFERENT sibling always resolves to a select, and the
//   toggles' own drop-the-finer-rungs behaviour is exactly the wanted step semantics.
// - Sibling ORDER IS the explorer's: every rung reads its level from `src/data/ladderLevels.ts`
//   (one list per level, 2026-10-07), the picked figure included, so paging right walks the same
//   sequence the left rail lists. Two projections are declared where applied: time steps oldest →
//   newest, and the node pager steps nodes, not layer rows (`machinesOf`).
// - The GLOBAL snapshot's set is OPEN (user, 2026-08-09: "it should always have the swipe
//   left/right functionality only without 1/x count because it's ongoing"). Time has no parent and
//   no total, so the set carries `open: true` and the plank drops its position readout: two
//   chevrons that step one tick, nothing that claims to measure the chain. That is what keeps it
//   from rivalling the LiveStrip — the strip is the time INSTRUMENT (scale, window, cadence), the
//   card's plank is a nudge to the adjacent tick.
import type { Mode } from "@/src/store/store";
import { ledgerNetwork } from "@/src/engine/domain/tickNet";
import type { TickNetSel } from "@/src/data/types";
import type { CohortSel, CompositionSel } from "@/src/engine/domain/focusLadder";
import type {
  ChannelSnapRow,
  CountryStat,
  GlobalSnapshot,
  MetaInfo,
  MetaSnapSel,
  NodeRow,
  PickDescriptor,
} from "@/src/data/types";
import {
  type ClickAction,
  cohortToggleActions,
  compositionToggleActions,
  countryToggleActions,
  filterToggleActions,
  metaSnapSelectActions,
  tickNetSelectActions,
  nodeSelectActions,
  sameCohort,
  snapshotSelectActions,
} from "@/src/engine/domain/pickActions";
import { compositionGroups, type CompGroup } from "@/src/data/composition";
import { hoverKeyOf } from "@/src/data/hoverSubject";
import { snapshotSignerRows } from "@/src/data/network";
import { UNLISTED_ID } from "@/src/data/unlisted";
import type { RailCardKind } from "@/components/railCards";
import { rangeBuckets } from "@/src/data/trendWindow";
import { stampInstant } from "@/src/data/trendTimeline";
import { cohortsLevel, countriesLevel, countryNodes, machinesOf, networksLevel, nodeOrder, nodesByCountry, type Cohort, type TickNetwork, type TickSnap } from "@/src/data/ladderLevels";
import type { GeoMeasure } from "@/src/data/geoMeasure";
import type { HyperMeasure } from "@/src/data/hyperMeasure";

/** Everything the resolver needs, read from the store BY THE CALLER (this module stays pure). */
export interface SiblingState {
  mode: Mode;
  filter: string;
  country: string | null;
  cohort: CohortSel | null;
  composition: CompositionSel | null;
  inspect: PickDescriptor | null;
  snap: Extract<PickDescriptor, { kind: "snapshot" }> | null;
  /** The network committed inside the pinned tick (ledger) — see `domain/tickNet.ts`. */
  tickNet: TickNetSel | null;
  metaSnap: MetaSnapSel | null;
  selNodes: NodeRow[];
  metaList: MetaInfo[];
  /** Is this channel a CATALOGUED network? The caller's answer (the app catalog — `LISTED_IDS`),
   *  because `metaList` is the server route's list and can name a channel the catalog does not:
   *  found live 2026-10-02, where the unlisted card got no pager because its address was "known".
   *  Absent (tests), membership in `metaList` stands in. */
  isListed?: (metaId: string) => boolean;
  /** store.leaderboard?.countries ?? [] — already count-desc, the geo explorer's own order. */
  countries: CountryStat[];
  /** The selected tick's exact-read rows (store.snapshotExact[globalOrdinal]?.rows ?? null). */
  exactRows: ChannelSnapRow[] | null;
  /** store.following — a followed chain has no pin, which is what `pinnedOrdinal` must say. */
  following: boolean;
  /** The retained global tick window, OLDEST→NEWEST (the LiveStrip's own buffer and order), each
   *  row carrying the two live reads the snapshot builder needs — resolved BY THE CALLER, since
   *  both come from the network singleton and this module stays pure. `inStory` is
   *  ledgerStory.tickInStory: whether the committed network anchored into that tick, with
   *  `undefined` meaning NO VERDICT (settling or unmeasured) — passed through untouched, because
   *  the story rule's own contract is to never release a filter on lag. */
  ticks: { data: GlobalSnapshot; isLiveTip: boolean; inStory: boolean | undefined }[];
  /** The explorers' picked figures — a level's ORDER follows them (one list per level, 2026-10-07). */
  geoMeasure: GeoMeasure;
  hyperMeasure: HyperMeasure;
  /** The whole fleet — Hypergraph's networks level counts over it, not the selection. */
  allNodes: NodeRow[];
  /** The shown global snapshot's networks (`tickNetworksLevel`), filled by the caller because the
   *  polled half lives in the network singleton. Null outside the ledger or with no tick shown. */
  tickNets: TickNetwork[] | null;
  /** History's brushed range and time cursor — the Range card and the Moment under it. */
  trendRange: { fromMs: number; toMs: number } | null;
  trendCursorMs: number | null;
}

export interface SiblingStep {
  key: string;
  label: string;
  actions: ClickAction[];
}

export interface SiblingSet {
  slot: RailCardKind;
  items: SiblingStep[];
  /** Position of the CURRENT subject in `items` — the one step the pager must never invoke. */
  index: number;
  /** The committed parent scope the set steps within — the pager's caption. */
  parentLabel: string;
  /** An ONGOING sequence rather than a set under a parent (the global chain): the pager steps but
   *  shows no `n / N`, because the window is a slice of something unbounded, not a total. */
  open?: true;
}

// ---------------------------------------------------------------------------

const networkLabel = (s: SiblingState): string =>
  s.filter === "all" ? "All networks" : (s.metaList.find((m) => m.id === s.filter)?.name ?? s.filter);

/** A provider cohort's one label — PROVIDER FIRST (user, 2026-09-29), with the unknowns NAMED
 *  rather than dropped. The rail's pager and the Geography explorer's crumb both read this, so a
 *  cohort can never be "Berlin" in one and "Unknown provider, Berlin" in the other. */
export const cohortLabel = (c: { city: string | null; isp: string | null }): string =>
  // A comma, not a mid-dot (user, 2026-10-03): a provider in a place reads as one name.
  `${c.isp ?? "Unknown provider"}, ${c.city ?? "Unlocated"}`;

// A finished set — or null when a pager would be useless (nothing to step to) or the current
// subject can't be located among its own siblings (stale state; a pager pointing nowhere lies).
function finish(
  slot: RailCardKind,
  items: SiblingStep[],
  index: number,
  parentLabel: string,
  open?: true,
): SiblingSet | null {
  if (items.length < 2 || index < 0) return null;
  return open ? { slot, items, index, parentLabel, open } : { slot, items, index, parentLabel };
}

// ---------------------------------------------------------------------------
// ONE item builder per rung, shared by that rung's sibling set and its parent's childStep —
// the two surfaces commit the same subject through the same pickActions builder, so the shape
// lives once (review fix, 2026-09-11: the pair had already begun to drift — the node key's
// fallback differed between the two copies).

const countryItem = (c: CountryStat, s: SiblingState): SiblingStep => ({
  key: c.cc,
  label: c.country,
  actions: countryToggleActions(c.cc, { country: s.country, hasInspect: !!s.inspect, cohort: s.cohort }),
});

const cohortItem = (cc: string, g: Cohort, s: SiblingState): SiblingStep => ({
  key: `${cc}|${g.city}|${g.isp}`,
  label: cohortLabel(g),
  actions: cohortToggleActions(
    { cc, city: g.city, isp: g.isp },
    { cohort: s.cohort, hasInspect: !!s.inspect },
  ),
});

const compositionItem = (g: CompGroup, s: SiblingState): SiblingStep => ({
  key: g.key,
  label: g.label,
  actions: compositionToggleActions(
    { netId: s.filter, key: g.key },
    { composition: s.composition, hasInspect: !!s.inspect, filter: s.filter },
  ),
});

// A row without a hover key isn't steppable/pairable; its label is only a React-key fallback.
const nodeItem = (r: NodeRow, s: SiblingState, compositionSel?: CompositionSel | null): SiblingStep => ({
  key: hoverKeyOf(r.pick) ?? r.label,
  label: r.label,
  actions: nodeSelectActions(r.pick, {
    mode: s.mode,
    currentFilter: s.filter,
    deselect: false,
    compositionSel: compositionSel ?? undefined,
  }),
});

// A level's snapshot as a MetaSnapSel + its bare ordinal label — the undecoded-ordinal contract is
// load-bearing (sameMetaSnap keys on metaId+ordinal; the route reports an undecodable payload as
// ordinal 0), so both live once. `hash` is the polled row's where it had one, "" off the exact read.
const metaSnapSelOf = (r: TickSnap, globalOrdinal: number): MetaSnapSel => ({
  metaId: r.metaId,
  ordinal: r.ordinal,
  hash: r.hash,
  globalOrdinal,
  ts: r.ts,
});
const ordinalLabel = (r: { ordinal: number }): string =>
  r.ordinal > 0 ? r.ordinal.toLocaleString() : "undecoded";

// ---------------------------------------------------------------------------

/** A channel's NETWORK KEY against the networks this state knows: its own id, else the unlisted
 *  set's (the pager's twin of the click table's own key rule, read off `metaList` so it stays pure). */
const keyOf = (s: SiblingState, metaId: string): string =>
  ((s.isListed ? s.isListed(metaId) : s.metaList.some((m) => m.id === metaId)) ? metaId : UNLISTED_ID);

/** The network a ledger card stands on: the one committed inside the pinned tick, else the app
 *  filter (`domain/tickNet.ledgerNetwork`). Outside the ledger it is the filter. */
const netOf = (s: SiblingState): string =>
  s.mode === "ledger" ? ledgerNetwork({ filter: s.filter, tickNet: s.tickNet, snapOrdinal: s.snap?.data.ordinal ?? null }) : s.filter;

// The explorer's own lists (src/data/ladderLevels.ts) — so a step, a ghost and a row agree.
const byCountryOf = (s: SiblingState) => nodesByCountry(s.selNodes);
const countriesOf = (s: SiblingState) => countriesLevel(s.countries, byCountryOf(s), s.geoMeasure).map((x) => x.c);
const cohortsIn = (s: SiblingState, cc: string) => cohortsLevel(countryNodes(cc, s.countries, byCountryOf(s)));

export function siblingSet(slot: RailCardKind, s: SiblingState): SiblingSet | null {
  switch (slot) {
    case "context": {
      // The card's subject: the app filter — or, in the ledger, the network the chamber resolves
      // against (the tick-local commit wins inside its tick).
      const net = netOf(s);
      if (net === "all") return null;
      // UNDER A LEDGER TICK the metagraph card is the tick's CHILD, so it steps the tick's own
      // networks (`tickNets` — the explorer's own list, the set the tick's ghost opens the first of),
      // never the catalog;
      // and a pinned tick stays pinned, since a filter commit in the ledger otherwise re-enters
      // live (the executor's rule) and a swipe would move the PARENT. Live stays live.
      // ⚠️ The DAG's own card has NO siblings here, deliberately: the base ledger is what the
      // tick IS, not one of the networks that anchored into it, so it is never in that set and
      // stepping from it to a metagraph would change the parent's meaning, not its child.
      if (s.mode === "ledger") {
        const nets = s.tickNets;
        if (!nets?.length) return null;
        // ⚠️ A STEP IS ALWAYS THE TICK-LOCAL COMMIT (2026-10-02, twice the same day): first for a
        // card opened from the tick, then for one standing on the top bar's filter too — "a filter
        // should not be changed from the explorer", and a pager is the same kind of gesture. The
        // step pins the tick and commits the neighbour INSIDE it; the filter is the reader's lens
        // and stays what they set.
        const items = nets.map((m) => ({ key: m.id, label: m.name, actions: tickNetSelectActions(m.id, s.snap!, { metaSnap: s.metaSnap, hasInspect: s.inspect != null, net }) }));
        return finish(slot, items, nets.findIndex((m) => m.id === net), `Global ${s.snap!.data.ordinal.toLocaleString()}`);
      }
      // Hypergraph steps its explorer's network list, in the picked figure's order (one list per
      // level, 2026-10-07); elsewhere the Metagraph card has no explorer level above it and keeps the
      // filter strip's located order (0-located rows stay steppable, as the strip keeps them clickable).
      const nets =
        s.mode === "hyper"
          ? networksLevel(s.metaList, s.allNodes, s.hyperMeasure).map((x) => x.m)
          : [...s.metaList].sort((a, b) => (b.located ?? 0) - (a.located ?? 0));
      const items = nets.map((m) => ({
        key: m.id,
        label: m.name,
        actions: filterToggleActions(m.id, s.filter),
      }));
      return finish(slot, items, nets.findIndex((m) => m.id === s.filter), "Networks");
    }

    case "country": {
      if (!s.country) return null;
      const cs = countriesOf(s);
      const items = cs.map((c) => countryItem(c, s));
      return finish(slot, items, cs.findIndex((c) => c.cc === s.country), networkLabel(s));
    }

    case "cohort": {
      if (!s.cohort) return null;
      const cc = s.cohort.cc;
      const groups = cohortsIn(s, cc);
      const items = groups.map((g) => cohortItem(cc, g, s));
      const index = groups.findIndex((g) => sameCohort(s.cohort, { cc, city: g.city, isp: g.isp }));
      const parent = s.countries.find((c) => c.cc === cc)?.country ?? cc;
      return finish(slot, items, index, parent);
    }

    case "composition": {
      if (!s.composition) return null;
      const groups = compositionGroups(s.selNodes);
      const items = groups.map((g) => compositionItem(g, s));
      return finish(slot, items, groups.findIndex((g) => g.key === s.composition!.key), networkLabel(s));
    }

    case "node": {
      const curKey = hoverKeyOf(s.inspect);
      if (!curKey) return null;

      // Scope = the FINEST committed parent (cohort > country > composition > network) — the
      // same containment the ancestry rules commit, so the pager steps inside the lit group.
      let rows: NodeRow[];
      let parent: string;
      let groupOf: ((r: NodeRow) => CompositionSel | null) | null = null;
      if (s.cohort) {
        const c = s.cohort;
        rows = machinesOf(cohortsIn(s, c.cc).find((g) => sameCohort(c, { cc: c.cc, city: g.city, isp: g.isp }))?.rows ?? []);
        parent = cohortLabel(c);
      } else if (s.country) {
        rows = machinesOf(countryNodes(s.country, s.countries, byCountryOf(s)));
        parent = s.countries.find((c) => c.cc === s.country)?.country ?? s.country;
      } else if (s.mode === "hyper") {
        // Hyper steps the explorer's own sequence — composition groups in size order, each row
        // carrying ITS group as ancestry (exactly what a click on that explorer row commits).
        const groups = compositionGroups(s.selNodes);
        const scoped = s.composition ? groups.filter((g) => g.key === s.composition!.key) : groups;
        rows = scoped.flatMap((g) => g.rows);
        const byKey = new Map(scoped.flatMap((g) => g.rows.map((r) => [r, g.key] as const)));
        groupOf = (r) => ({ netId: s.filter, key: byKey.get(r)! });
        parent = s.composition
          ? (scoped[0]?.label ?? networkLabel(s))
          : networkLabel(s);
      } else if (
        s.mode === "ledger" &&
        s.metaSnap &&
        snapshotSignerRows(s.selNodes, s.exactRows, s.metaSnap).some((r) => hoverKeyOf(r.pick) === curKey)
      ) {
        // UNDER A METAGRAPH SNAPSHOT the node's parent is that snapshot, so the pager steps the
        // nodes that SIGNED it (user, 2026-09-29: "filtered based who actually was the validators,
        // like explorer shows") — `snapshotSignerRows`, the explorer's own list, in its order.
        // Only when this node IS one of them: a tray node that did not sign is still committable,
        // and for it the snapshot is not its parent — it pages its network, as it always did.
        rows = snapshotSignerRows(s.selNodes, s.exactRows, s.metaSnap);
        parent = "Validators that signed";
      } else {
        // A network-wide node list has no explorer level; today's order is kept.
        rows = machinesOf([...s.selNodes].sort(nodeOrder));
        parent = networkLabel(s);
      }

      const items = rows.map((r) => nodeItem(r, s, groupOf ? groupOf(r) : undefined));
      return finish(slot, items, items.findIndex((it) => it.key === curKey), parent);
    }

    case "metaSnap": {
      const cur = s.metaSnap;
      if (!cur) return null;
      // The step re-pins the same global, so the resolver needs the pinned global pick — and it
      // must BE that tick (whenever a metaSnap is committed the executor pinned its global, so a
      // mismatch is stale state, not a case to paper over).
      if (!s.snap || s.snap.data.ordinal !== cur.globalOrdinal) return null;
      // The parent scope here is the PAIR — this metagraph × this tick (user, 2026-08-09) — so the
      // set is the SUBJECT'S OWN channel rows, not every network's. A cross-network step would move
      // a COARSER rung (metaSnapSelectActions filter-firsts), i.e. a swipe would silently
      // re-commit the network. The explorer still browses every contributor under a tick, because
      // there the network is a deliberate click of its own with its own chamber hover preview;
      // the pager stays inside the committed story.
      //
      // ⚠️ OLDEST → NEWEST, so `›` MEANS FORWARD IN TIME (user, 2026-09-01: "forward swipe goes to
      // the parent, which is earlier on the timeline of the chain — that's inverse logic"). It was
      // ordinal-DESC, mirroring the explorer's leaves, and that put the two snapshot pagers in this
      // same rail on OPPOSITE headings: the global one steps the window oldest→newest so `›` walks
      // the way the bars do, while this one walked backwards down the chain. `lastSnapshotHash`
      // makes the direction concrete rather than a matter of taste — these rows are consecutive
      // links (verified live: within one tick each snapshot's parent IS the previous one's hash),
      // so `‹` now follows the parent links back and `›` follows them forward.
      //
      // The explorer's LIST keeps its newest-first order, which is right for a list and not in
      // conflict: a log reads back from now, a stepper advances.
      // Under the UNLISTED network the parent is "unlisted × this tick", which can hold several
      // addresses — so the set is the unlisted level's every row.
      // THE ONE LIST, REVERSED: the explorer lists newest first, the pager steps OLDEST → NEWEST so
      // `›` means forward in time — a declared projection, not a second order (2026-10-07).
      const tn = s.tickNets?.find((x) => x.id === keyOf(s, cur.metaId));
      if (!tn) return null;
      const rows = [...tn.snaps].reverse();
      const meta = s.metaList.find((m) => m.id === cur.metaId);
      const who = meta?.symbol || meta?.name || `${cur.metaId.slice(0, 6)}…`;
      const items = rows.map((r, i) => ({
        // ordinal 0 marks an undecodable payload — several can share it, so the position
        // disambiguates the React key without inventing an identity.
        key: `${r.metaId}:${r.ordinal}:${i}`,
        // The group names the metagraph, so an item is its ordinal alone — bare, like every
        // other rendered ordinal — and an undecodable payload says so rather than claiming 0
        // (the route's contract).
        label: ordinalLabel(r),
        actions: metaSnapSelectActions(metaSnapSelOf(r, cur.globalOrdinal), s.snap!, { metaSnap: cur, inspect: s.inspect }),
      }));
      const index = rows.findIndex((r) => r.metaId === cur.metaId && r.ordinal === cur.ordinal);
      return finish(slot, items, index, `${who} in global ${cur.globalOrdinal.toLocaleString()}`);
    }

    // The GLOBAL snapshot — the one OPEN set: time, stepped one tick at a time. The window is the
    // LiveStrip's own buffer in the strip's own order (oldest→newest), so `›` walks the same way
    // the bars do and the two controls can't disagree about direction. Every step runs the SAME
    // snapshotSelectActions a bar click runs, including its two rules: reaching the live tip
    // RE-FOLLOWS the heartbeat, and stepping onto a tick the committed network never anchored into
    // releases the filter (a filter is a story). While following there is no pin, which is exactly
    // what `pinnedOrdinal: null` says — so stepping back from the live front pins the tick before it.
    case "snap": {
      const cur = s.snap;
      if (!cur) return null;
      const items = s.ticks.map((t) => ({
        key: String(t.data.ordinal),
        label: t.data.ordinal.toLocaleString(),
        actions: snapshotSelectActions(
          { kind: "snapshot", title: `Global snapshot #${t.data.ordinal}`, data: t.data },
          t.isLiveTip,
          {
            pinnedOrdinal: s.following ? null : cur.data.ordinal,
            metaSnap: s.metaSnap,
            tickNet: s.tickNet,
          },
        ),
      }));
      // A pin that has aged out of the retained window can't be located, so it gets no pager
      // rather than a plank whose "adjacent" tick would be a guess (finish's index rule).
      return finish(slot, items, s.ticks.findIndex((t) => t.data.ordinal === cur.data.ordinal), "Snapshot stream", true);
    }

    // THE MOMENTS OF THE RANGE (user, 2026-10-07): under a brushed range the Moment card steps its
    // buckets, oldest → newest. No range, or a cursor outside it, is no set — the Moment then has
    // no committed parent to step within.
    case "instant": {
      if (!s.trendRange || s.trendCursorMs == null) return null;
      const { buckets, stepMs } = rangeBuckets(s.trendRange);
      const cur = s.trendCursorMs;
      return finish(slot, momentItems(buckets, stepMs), buckets.findIndex((b) => cur >= b && cur < b + stepMs), "Range");
    }

    // About and the tool card never focus, so they never page.
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------

/** The plank's DOWN step where nothing finer is committed: the FIRST child of the boxed rung,
 *  in the explorer's own order (user, 2026-09-11 — "I do like to be able to open a finer rung,
 *  can just pick the 1st one"). Pure like siblingSet, and every step's actions come from the
 *  pickActions builders, so the button and the equivalent explorer click can't drift (rule 2).
 *  Null where a rung has no first child to open — no children in the data, or no child
 *  vocabulary at all (a node, a metagraph snapshot, the ledger's network — whose finer
 *  subjects belong to the tick axis) — and the plank DIMS the ∨ (the inactive-at-the-edge
 *  rule; only a card with no ladder step in EITHER direction shows no pair at all — see
 *  RailPager). A finer COMMITTED rung never reaches here: the caller steps the pile instead. */
/** ONE child step: the first candidate at the slot directly BELOW this one in the view's lane.
 *
 *  ⚠️ EACH ENTRY DECLARES WHERE IT GOES (`to`), and `railLadderBoundary.test.ts` checks that it is
 *  the next slot in `DISPLAY_LANE` for that view. That is the whole point of writing this as a
 *  table: "a ∨ commits a finer subject, never a coarser one" has been the rule all along, and it
 *  has been enforced by comments and by whoever remembered it — the ledger's tick used to reach two
 *  levels down and drag the filter with it, which is that rule broken twice over. Declared, a step
 *  that skips a rung or reaches back up fails a test.
 *
 *  The step FUNCTIONS stay small and named, and they keep using this file's shared item builders,
 *  so a rung's sibling set and its parent's child step still commit the same subject through the
 *  same pickActions builder. */
/** A rung's CHILDREN in the explorer's own order — the first `n` of them. The pager's old ∨ took the
 *  first, and so does the NEXT GHOST card that replaced it (user, 2026-10-07 — a click on it opens
 *  the first child, as ∨ did; the 2026-10-04 quick-pick list is retired). */
interface ChildEntry { to: RailCardKind; steps: (s: SiblingState, n: number) => SiblingStep[] }

/** The moments of a range as steps: each one moves the cursor into that bucket (one builder for
 *  the Moment's pager and the Range's next ghost). */
function momentItems(buckets: readonly number[], stepMs: number): SiblingStep[] {
  return buckets.map((b) => ({ key: String(b), label: stampInstant(b, stepMs), actions: [{ kind: "trendCursor", ms: b }] }));
}

/** trend: the range's first moment. */
const momentOfRangeChildren = (s: SiblingState, n: number): SiblingStep[] => {
  if (!s.trendRange) return [];
  const { buckets, stepMs } = rangeBuckets(s.trendRange);
  return momentItems(buckets.slice(0, n), stepMs);
};

// geo: the explorer's own first rows, in the picked figure's order. Like every child-of-the-dossier step
// it states its own precondition — the dossier only exists under a committed network, so at "all"
// there is no card to open anything FROM (the same shape `cohortChildren` asserts with `s.country`).
const countryChildren = (s: SiblingState, n: number): SiblingStep[] => {
  if (s.filter === "all") return [];
  return countriesOf(s).slice(0, n).map((c) => countryItem(c, s));
};
// geo: the committed country's cohorts.
const cohortChildren = (s: SiblingState, n: number): SiblingStep[] => {
  if (!s.country) return [];
  const cc = s.country;
  return cohortsIn(s, cc).slice(0, n).map((g) => cohortItem(cc, g, s));
};
// geo: the committed cohort's machines.
const nodeOfCohortChildren = (s: SiblingState, n: number): SiblingStep[] => {
  const c = s.cohort;
  if (!c) return [];
  const g = cohortsIn(s, c.cc).find((x) => sameCohort(c, { cc: c.cc, city: x.city, isp: x.isp }));
  return g ? machinesOf(g.rows).slice(0, n).map((r) => nodeItem(r, s)) : [];
};
// hyper: the explorer leads with the composition groups, size-desc (same dossier precondition).
const compositionChildren = (s: SiblingState, n: number): SiblingStep[] => {
  if (s.filter === "all") return [];
  return compositionGroups(s.selNodes).slice(0, n).map((g) => compositionItem(g, s));
};
// hyper: the committed group's own row order — the same sequence the node pager steps.
const nodeOfCompositionChildren = (s: SiblingState, n: number): SiblingStep[] => {
  if (!s.composition) return [];
  const g = compositionGroups(s.selNodes).find((x) => x.key === s.composition!.key);
  return g ? machinesOf(g.rows).slice(0, n).map((r) => nodeItem(r, s, { netId: s.filter, key: g.key })) : [];
};
/** ledger: the networks that anchored into this tick, in the explorer's own order (`tickNets` —
 *  busiest first, the unlisted set last). Opening the Metagraph card under a tick commits that network INSIDE the tick
 *  (`tickNetSelectActions`), never the app filter (user, 2026-10-02 — reversing 2026-09-15's "the
 *  filter IS the step": a card's pager re-scoped the whole app, and it dropped the pin on the way
 *  because a filter commit in the ledger re-enters live). An UNLISTED channel names no network,
 *  so there is nothing to commit. */
const anchoringNetworkChildren = (s: SiblingState, n: number): SiblingStep[] => {
  if (!s.snap) return [];
  // A network already stands under the tick — unless it is the FILTER's and this tick holds nothing
  // of it, where its card has stood down (`ledgerCardNetwork`) and the step goes into the tick's
  // own networks instead of going dead.
  const stoodDown = s.tickNet == null && s.ticks.find((t) => t.data.ordinal === s.snap!.data.ordinal)?.inStory === false;
  if (netOf(s) !== "all" && !stoodDown) return [];
  const snap = s.snap;
  return (s.tickNets ?? []).slice(0, n).map((meta) => ({
    key: meta.id,
    label: meta.name,
    actions: tickNetSelectActions(meta.id, snap, { metaSnap: s.metaSnap, hasInspect: s.inspect != null, net: null }),
  }));
};
/** ledger: the committed network's OWN snapshots in the shown tick — never the tick's first rows,
 *  which would re-commit the filter to whichever network leads the exact read and release the
 *  committed story (review find, 2026-09-11). None → the network did not anchor here, which is
 *  the honest answer. */
const metaSnapOfTickChildren = (s: SiblingState, n: number): SiblingStep[] => {
  const net = netOf(s);
  if (net === "all" || !s.snap) return [];
  const snap = s.snap;
  // The explorer's own list for this network in this tick, NEWEST first — the ghost opens its top
  // row. By network KEY: the unlisted set's snapshots carry their own raw addresses.
  const tn = s.tickNets?.find((x) => x.id === net);
  if (!tn) return [];
  return tn.snaps.slice(0, n).map((r) => ({
    key: `${r.metaId}:${r.ordinal}`,
    label: ordinalLabel(r),
    actions: metaSnapSelectActions(metaSnapSelOf(r, snap.data.ordinal), snap, { metaSnap: s.metaSnap, inspect: s.inspect }),
  }));
};

/** ledger: a metagraph snapshot's validators (user, 2026-09-29 — "from the metagraph snapshot …
 *  go to its validators"). The same list and order as the explorer's signer level
 *  (`snapshotSignerRows`); a signature no known node carries has nothing to open, so only KNOWN
 *  ones are offered. */
const signerOfMetaSnapChildren = (s: SiblingState, n: number): SiblingStep[] => {
  if (!s.metaSnap) return [];
  return snapshotSignerRows(s.selNodes, s.exactRows, s.metaSnap).slice(0, n).map((r) => nodeItem(r, s));
};

export const CHILD_OF: Partial<Record<Mode, Partial<Record<RailCardKind, ChildEntry>>>> = {
  geo: {
    context: { to: "country", steps: countryChildren },
    country: { to: "cohort", steps: cohortChildren },
    cohort: { to: "node", steps: nodeOfCohortChildren },
  },
  hyper: {
    context: { to: "composition", steps: compositionChildren },
    composition: { to: "node", steps: nodeOfCompositionChildren },
  },
  ledger: {
    snap: { to: "context", steps: anchoringNetworkChildren },
    context: { to: "metaSnap", steps: metaSnapOfTickChildren },
    metaSnap: { to: "node", steps: signerOfMetaSnapChildren },
  },
  trend: {
    range: { to: "instant", steps: momentOfRangeChildren },
  },
};

/** The rung's first child, or null when there is nothing finer to open.
 *  A node and a metagraph snapshot are leaves; About and the tool card never focus. */
export function childStep(slot: RailCardKind, s: SiblingState): SiblingStep | null {
  return CHILD_OF[s.mode]?.[slot]?.steps(s, 1)[0] ?? null;
}

/** Which of a sibling set's position marks the pager draws (user, 2026-10-04 — every card's pager
 *  draws its position; none writes "n of N"). A set of at most `max` draws them all. A longer one
 *  draws a `max`-wide window that keeps `index` in view — centred where it can be, clamped at
 *  either end — and an end of the window with more marks beyond it is drawn small (`fadeStart` /
 *  `fadeEnd`), which is how the strip says "this continues" without a number. The window's width
 *  never changes, so stepping through a long set never re-composes the plank. */
export function positionMarks(
  index: number,
  n: number,
  max: number,
): { start: number; end: number; fadeStart: boolean; fadeEnd: boolean } {
  if (n <= max) return { start: 0, end: n, fadeStart: false, fadeEnd: false };
  const start = Math.min(Math.max(0, index - Math.floor(max / 2)), n - max);
  const end = start + max;
  return { start, end, fadeStart: start > 0, fadeEnd: end < n };
}
