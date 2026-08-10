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
  nodeSelectActions,
  sameCohort,
  sameMetaSnap,
  snapshotSelectActions,
} from "@/src/engine/domain/pickActions";
import { compositionGroups } from "@/src/data/composition";
import { hoverKeyOf } from "@/src/data/hoverSubject";
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
  metaSnap: MetaSnapSel | null;
  selNodes: NodeRow[];
  metaList: MetaInfo[];
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

const cohortLabel = (c: { city: string | null; isp: string | null }): string =>
  [c.city, c.isp].filter(Boolean).join(" · ") || "Unknown";

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

export function siblingSet(slot: RailCardKind, s: SiblingState): SiblingSet | null {
  switch (slot) {
    case "context": {
      if (s.filter === "all") return null;
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
      const items = s.countries.map((c) => ({
        key: c.cc,
        label: c.country,
        actions: countryToggleActions(c.cc, { country: s.country, hasInspect: !!s.inspect, cohort: s.cohort }),
      }));
      return finish(slot, items, s.countries.findIndex((c) => c.cc === s.country), networkLabel(s));
    }

    case "cohort": {
      if (!s.cohort) return null;
      const cc = s.cohort.cc;
      const groups = cohortsOf(s.selNodes.filter((r) => r.cc === cc));
      const items = groups.map((g) => ({
        key: `${cc}|${g.city}|${g.isp}`,
        label: cohortLabel(g),
        actions: cohortToggleActions(
          { cc, city: g.city, isp: g.isp },
          { cohort: s.cohort, hasInspect: !!s.inspect },
        ),
      }));
      const index = groups.findIndex((g) => sameCohort(s.cohort, { cc, city: g.city, isp: g.isp }));
      const parent = s.countries.find((c) => c.cc === cc)?.country ?? cc;
      return finish(slot, items, index, parent);
    }

    case "composition": {
      if (!s.composition) return null;
      const groups = compositionGroups(s.selNodes);
      const items = groups.map((g) => ({
        key: g.key,
        label: g.label,
        actions: compositionToggleActions(
          { netId: s.filter, key: g.key },
          { composition: s.composition, hasInspect: !!s.inspect, filter: s.filter },
        ),
      }));
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
      } else {
        rows = machineRows(s.selNodes).sort(nodeSort);
        parent = networkLabel(s);
      }

      const items = rows.map((r) => ({
        key: hoverKeyOf(r.pick)!,
        label: r.label,
        actions: nodeSelectActions(r.pick, {
          mode: s.mode,
          currentFilter: s.filter,
          deselect: false,
          compositionSel: groupOf ? groupOf(r) : undefined,
        }),
      }));
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
      // the pager stays inside the committed story. Order mirrors the explorer's leaves: ordinal
      // desc within the tick (anchorLog's own rule).
      const rows = s.exactRows
        .filter((r) => r.metaId === cur.metaId)
        .sort((a, b) => b.ordinal - a.ordinal);
      const meta = s.metaList.find((m) => m.id === cur.metaId);
      const who = meta?.symbol || meta?.name || `${cur.metaId.slice(0, 6)}…`;
      const items = rows.map((r, i) => {
        const sel: MetaSnapSel = {
          metaId: r.metaId,
          ordinal: r.ordinal,
          hash: "", // the exact read carries no hash; sameMetaSnap keys on metaId+ordinal
          globalOrdinal: cur.globalOrdinal,
          ts: cur.ts,
        };
        return {
          // ordinal 0 marks an undecodable payload — several can share it, so the position
          // disambiguates the React key without inventing an identity.
          key: `${r.metaId}:${r.ordinal}:${i}`,
          // The group names the metagraph, so an item is its ordinal alone — bare, like every
          // other rendered ordinal — and an undecodable payload says so rather than claiming 0
          // (the route's contract).
          label: r.ordinal > 0 ? r.ordinal.toLocaleString() : "undecoded",
          actions: metaSnapSelectActions(sel, s.snap!, { filter: s.filter, metaSnap: cur }),
        };
      });
      const index = rows.findIndex((r) => sameMetaSnap(cur, { ...cur, ordinal: r.ordinal }));
      return finish(slot, items, index, `${who} · Global ${cur.globalOrdinal.toLocaleString()}`);
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
            filter: s.filter,
            tickHasFilter: t.inStory,
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
