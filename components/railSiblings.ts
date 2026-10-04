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
// - Sibling ORDER mirrors the explorer that browses the same rung (picker located-desc,
//   leaderboard count-desc, cohortsOf count-then-city, compositionGroups size-desc), so paging
//   right walks the same sequence the left rail lists.
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
import { UNLISTED_CFG, UNLISTED_ID } from "@/src/data/unlisted";
import type { RailCardKind } from "@/components/railCards";

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

// The geo cohort grouping, matching GeoExplore's cohortsOf exactly: `|| null` normalization on
// both fields (unresolved city/isp → null, which sameCohort's strict === needs), grouped by
// city|isp, sorted count-desc then city asc.
interface CohortGroup {
  city: string | null;
  isp: string | null;
  rows: NodeRow[];
}
function cohortsOf(rows: NodeRow[]): CohortGroup[] {
  const by = new Map<string, CohortGroup>();
  for (const r of rows) {
    const geo = "geo" in r.pick ? r.pick.geo : undefined;
    const city = r.city || null;
    const isp = geo?.isp || null;
    const key = `${city ?? ""}|${isp ?? ""}`;
    (by.get(key) ?? by.set(key, { city, isp, rows: [] }).get(key)!).rows.push(r);
  }
  return [...by.values()].sort(
    (a, b) => b.rows.length - a.rows.length || (a.city ?? "￿").localeCompare(b.city ?? "￿"),
  );
}

/** A provider cohort's one label — PROVIDER FIRST (user, 2026-09-29), with the unknowns NAMED
 *  rather than dropped. The rail's pager and the Geography explorer's crumb both read this, so a
 *  cohort can never be "Berlin" in one and "Unknown provider, Berlin" in the other. */
export const cohortLabel = (c: { city: string | null; isp: string | null }): string =>
  // A comma, not a mid-dot (user, 2026-10-03): a provider in a place reads as one name.
  `${c.isp ?? "Unknown provider"}, ${c.city ?? "Unlocated"}`;

// GeoExplore's within-country node order: city (falling back to label) then id.
const nodeSort = (a: NodeRow, b: NodeRow) =>
  (a.city || a.label).localeCompare(b.city || b.label, undefined, { sensitivity: "base" }) ||
  (a.id || "").localeCompare(b.id || "");

// Dedupe a node list to MACHINES by the shared hover key (a hybrid's layer-shells are one
// machine — the same rule hoverKeyOf encodes for pairing); rows without a key aren't steppable.
function machineRows(rows: NodeRow[]): NodeRow[] {
  const seen = new Set<string>();
  const out: NodeRow[] = [];
  for (const r of rows) {
    const k = hoverKeyOf(r.pick);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

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

const cohortItem = (cc: string, g: CohortGroup, s: SiblingState): SiblingStep => ({
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

// The exact read's row as a MetaSnapSel + its bare ordinal label — the hash-empty convention
// and the undecoded-ordinal contract are load-bearing (sameMetaSnap keys on metaId+ordinal;
// the route reports an undecodable payload as ordinal 0), so both live once.
const metaSnapSelOf = (r: ChannelSnapRow, globalOrdinal: number, ts: string): MetaSnapSel => ({
  metaId: r.metaId,
  ordinal: r.ordinal,
  hash: "", // the exact read carries no hash; sameMetaSnap keys on metaId+ordinal
  globalOrdinal,
  ts,
});
const ordinalLabel = (r: ChannelSnapRow): string =>
  r.ordinal > 0 ? r.ordinal.toLocaleString() : "undecoded";

// ---------------------------------------------------------------------------

/** THE CHILDREN OF A LEDGER TICK (2026-09-29) — the networks that anchored into the shown global
 *  snapshot, busiest first (the order the tick card prints its anchors in). The ONE answer, read by
 *  the metagraph card's pager and the tick's ∨ step alike, so the two can't disagree about what is
 *  under a tick (they did: the pager walked the whole catalog). Null without a tick or its exact
 *  read — no pager then, rather than a guess.
 *  ⚠️ THE UNLISTED SET IS ONE OF THEM (user, 2026-10-02: an unregistered metagraph had "no
 *  corresponding details card", so stepping down "jumps straight to node"). Uncatalogued channels
 *  were filtered out here because they named no FILTER; the rung is tick-local now and the unlisted
 *  dossier exists, so every uncatalogued channel in the tick counts toward one `unlisted` entry. */
/** A channel's NETWORK KEY against the networks this state knows: its own id, else the unlisted
 *  set's (the pager's twin of the click table's own key rule, read off `metaList` so it stays pure). */
const keyOf = (s: SiblingState, metaId: string): string =>
  ((s.isListed ? s.isListed(metaId) : s.metaList.some((m) => m.id === metaId)) ? metaId : UNLISTED_ID);

function tickNetworks(s: SiblingState): { id: string; name: string }[] | null {
  if (!s.snap || !s.exactRows?.length) return null;
  const counts = new Map<string, number>();
  for (const r of s.exactRows) {
    const k = keyOf(s, r.metaId);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const nets = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => (id === UNLISTED_ID ? { id, name: UNLISTED_CFG.name } : s.metaList.find((m) => m.id === id)))
    .filter((m): m is { id: string; name: string } => m != null);
  return nets.length ? nets : null;
}

/** The network a ledger card stands on: the one committed inside the pinned tick, else the app
 *  filter (`domain/tickNet.ledgerNetwork`). Outside the ledger it is the filter. */
const netOf = (s: SiblingState): string =>
  s.mode === "ledger" ? ledgerNetwork({ filter: s.filter, tickNet: s.tickNet, snapOrdinal: s.snap?.data.ordinal ?? null }) : s.filter;

export function siblingSet(slot: RailCardKind, s: SiblingState): SiblingSet | null {
  switch (slot) {
    case "context": {
      // The card's subject: the app filter — or, in the ledger, the network the chamber resolves
      // against (the tick-local commit wins inside its tick).
      const net = netOf(s);
      if (net === "all") return null;
      // UNDER A LEDGER TICK the metagraph card is the tick's CHILD, so it steps the tick's own
      // networks (`tickNetworks` — the set the tick's ∨ opens the first of), never the catalog;
      // and a pinned tick stays pinned, since a filter commit in the ledger otherwise re-enters
      // live (the executor's rule) and a swipe would move the PARENT. Live stays live.
      // ⚠️ The DAG's own card has NO siblings here, deliberately: the base ledger is what the
      // tick IS, not one of the networks that anchored into it, so it is never in that set and
      // stepping from it to a metagraph would change the parent's meaning, not its child.
      if (s.mode === "ledger") {
        const nets = tickNetworks(s);
        if (!nets) return null;
        // ⚠️ A STEP IS ALWAYS THE TICK-LOCAL COMMIT (2026-10-02, twice the same day): first for a
        // card opened from the tick, then for one standing on the top bar's filter too — "a filter
        // should not be changed from the explorer", and a pager is the same kind of gesture. The
        // step pins the tick and commits the neighbour INSIDE it; the filter is the reader's lens
        // and stays what they set.
        const items = nets.map((m) => ({ key: m.id, label: m.name, actions: tickNetSelectActions(m.id, s.snap!, { metaSnap: s.metaSnap, hasInspect: s.inspect != null, net }) }));
        return finish(slot, items, nets.findIndex((m) => m.id === net), `Global ${s.snap!.data.ordinal.toLocaleString()}`);
      }
      // The filter picker's own order: located-desc (0-located rows stay steppable, like the
      // picker keeps them clickable).
      const nets = [...s.metaList].sort((a, b) => (b.located ?? 0) - (a.located ?? 0));
      const items = nets.map((m) => ({
        key: m.id,
        label: m.name,
        actions: filterToggleActions(m.id, s.filter),
      }));
      return finish(slot, items, nets.findIndex((m) => m.id === s.filter), "Networks");
    }

    case "country": {
      if (!s.country) return null;
      const items = s.countries.map((c) => countryItem(c, s));
      return finish(slot, items, s.countries.findIndex((c) => c.cc === s.country), networkLabel(s));
    }

    case "cohort": {
      if (!s.cohort) return null;
      const cc = s.cohort.cc;
      const groups = cohortsOf(s.selNodes.filter((r) => r.cc === cc));
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
        rows = cohortsOf(s.selNodes.filter((r) => r.cc === c.cc)).find((g) => sameCohort(c, { cc: c.cc, city: g.city, isp: g.isp }))?.rows ?? [];
        rows = machineRows(rows).sort(nodeSort);
        parent = cohortLabel(c);
      } else if (s.country) {
        rows = machineRows(s.selNodes.filter((r) => r.cc === s.country)).sort(nodeSort);
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
        rows = machineRows(s.selNodes).sort(nodeSort);
        parent = networkLabel(s);
      }

      const items = rows.map((r) => nodeItem(r, s, groupOf ? groupOf(r) : undefined));
      return finish(slot, items, items.findIndex((it) => it.key === curKey), parent);
    }

    case "metaSnap": {
      const cur = s.metaSnap;
      if (!cur || !s.exactRows) return null;
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
      // addresses — so the set is every uncatalogued row, grouped by address then ordinal.
      const unlisted = keyOf(s, cur.metaId) === UNLISTED_ID;
      const rows = s.exactRows
        .filter((r) => (unlisted ? keyOf(s, r.metaId) === UNLISTED_ID : r.metaId === cur.metaId))
        .sort((a, b) => (a.metaId === b.metaId ? a.ordinal - b.ordinal : a.metaId < b.metaId ? -1 : 1));
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
        actions: metaSnapSelectActions(metaSnapSelOf(r, cur.globalOrdinal, cur.ts), s.snap!, { metaSnap: cur, inspect: s.inspect }),
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
interface ChildEntry { to: RailCardKind; step: (s: SiblingState) => SiblingStep | null }

// geo: the explorer's own first row, countries count-desc. Like every child-of-the-dossier step
// it states its own precondition — the dossier only exists under a committed network, so at "all"
// there is no card to open anything FROM (the same shape `firstCohort` asserts with `s.country`).
const firstCountry = (s: SiblingState): SiblingStep | null => {
  if (s.filter === "all") return null;
  const c = s.countries[0];
  return c ? countryItem(c, s) : null;
};
// geo: the committed country's first cohort.
const firstCohort = (s: SiblingState): SiblingStep | null => {
  if (!s.country) return null;
  const g = cohortsOf(s.selNodes.filter((r) => r.cc === s.country))[0];
  return g ? cohortItem(s.country, g, s) : null;
};
// geo: the committed cohort's first machine.
const firstNodeOfCohort = (s: SiblingState): SiblingStep | null => {
  const c = s.cohort;
  if (!c) return null;
  const g = cohortsOf(s.selNodes.filter((r) => r.cc === c.cc)).find((x) =>
    sameCohort(c, { cc: c.cc, city: x.city, isp: x.isp }),
  );
  const r = g ? machineRows(g.rows).sort(nodeSort)[0] : undefined;
  return r ? nodeItem(r, s) : null;
};
// hyper: the explorer leads with the composition groups, size-desc (same dossier precondition).
const firstComposition = (s: SiblingState): SiblingStep | null => {
  if (s.filter === "all") return null;
  const g = compositionGroups(s.selNodes)[0];
  return g ? compositionItem(g, s) : null;
};
// hyper: the committed group's own row order — the same sequence the node pager steps.
const firstNodeOfComposition = (s: SiblingState): SiblingStep | null => {
  if (!s.composition) return null;
  const g = compositionGroups(s.selNodes).find((x) => x.key === s.composition!.key);
  const r = g ? machineRows(g.rows)[0] : undefined;
  return r && g ? nodeItem(r, s, { netId: s.filter, key: g.key }) : null;
};
/** ledger: the network that anchored MOST into this tick — the order the tick card prints its
 *  anchors in. Opening the Metagraph card under a tick commits that network INSIDE the tick
 *  (`tickNetSelectActions`), never the app filter (user, 2026-10-02 — reversing 2026-09-15's "the
 *  filter IS the step": a card's pager re-scoped the whole app, and it dropped the pin on the way
 *  because a filter commit in the ledger re-enters live). An UNLISTED channel names no network,
 *  so there is nothing to commit and the control dims. */
const firstAnchoringNetwork = (s: SiblingState): SiblingStep | null => {
  if (!s.snap) return null;
  // A network already stands under the tick — unless it is the FILTER's and this tick holds nothing
  // of it, where its card has stood down (`ledgerCardNetwork`) and ∨ steps into the tick's own
  // first network instead of going dead.
  const stoodDown = s.tickNet == null && s.ticks.find((t) => t.data.ordinal === s.snap!.data.ordinal)?.inStory === false;
  if (netOf(s) !== "all" && !stoodDown) return null;
  const meta = tickNetworks(s)?.[0];
  return meta ? { key: meta.id, label: meta.name, actions: tickNetSelectActions(meta.id, s.snap, { metaSnap: s.metaSnap, hasInspect: s.inspect != null, net: null }) } : null;
};
/** ledger: the committed network's OWN snapshot in the shown tick — never the tick's first row,
 *  which would re-commit the filter to whichever network leads the exact read and release the
 *  committed story (review find, 2026-09-11). No row → the network did not anchor here, which is
 *  the honest answer, and the control dims. */
const firstMetaSnapOfTick = (s: SiblingState): SiblingStep | null => {
  const net = netOf(s);
  if (net === "all" || !s.snap || !s.exactRows) return null;
  // By network KEY: the unlisted network's snapshots carry their own raw addresses.
  const r = s.exactRows.find((x) => keyOf(s, x.metaId) === net);
  if (!r) return null;
  const sel = metaSnapSelOf(r, s.snap.data.ordinal, s.snap.data.timestamp);
  return {
    key: `${r.metaId}:${r.ordinal}`,
    label: ordinalLabel(r),
    actions: metaSnapSelectActions(sel, s.snap, { metaSnap: s.metaSnap, inspect: s.inspect }),
  };
};

/** ledger: a metagraph snapshot's FIRST validator (user, 2026-09-29 — "from the metagraph snapshot
 *  … click the down button and go to its validators"). The same list and order as the explorer's
 *  signer level (`snapshotSignerRows`); a signature no known node carries has nothing to open, so
 *  the step takes the first KNOWN one, and none known dims the control. */
const firstSignerOfMetaSnap = (s: SiblingState): SiblingStep | null => {
  if (!s.metaSnap) return null;
  const r = snapshotSignerRows(s.selNodes, s.exactRows, s.metaSnap)[0];
  return r ? nodeItem(r, s) : null;
};

export const CHILD_OF: Partial<Record<Mode, Partial<Record<RailCardKind, ChildEntry>>>> = {
  geo: {
    context: { to: "country", step: firstCountry },
    country: { to: "cohort", step: firstCohort },
    cohort: { to: "node", step: firstNodeOfCohort },
  },
  hyper: {
    context: { to: "composition", step: firstComposition },
    composition: { to: "node", step: firstNodeOfComposition },
  },
  ledger: {
    snap: { to: "context", step: firstAnchoringNetwork },
    context: { to: "metaSnap", step: firstMetaSnapOfTick },
    metaSnap: { to: "node", step: firstSignerOfMetaSnap },
  },
};

/** The rung's first child, or null when there is nothing finer to open (the control dims).
 *  A node and a metagraph snapshot are leaves; About and the tool card never focus. */
export function childStep(slot: RailCardKind, s: SiblingState): SiblingStep | null {
  return CHILD_OF[s.mode]?.[slot]?.step(s) ?? null;
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
