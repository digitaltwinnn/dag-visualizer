import { ROLE_SHORT, roleKeyLabel } from "@/src/data/composition";
import { fact, gaugeChange, networksAnchored } from "@/src/data/noteFacts";
import { notableDays } from "@/src/data/notableDays";
import type { Fact } from "@/src/data/noteTypes";
import { anchorSeries, lastMeasured, typeBands, withUnlisted } from "@/src/data/trendSeries";
import { trimNewestPartial, type TrendsWindowData } from "@/src/data/trendWindow";
import { LISTED_IDS, UNLISTED_ID } from "@/src/data/unlisted";

// HYPERGRAPH'S FACTS BUILDER — what the Hypergraph note's model is shown. Hyper answers WHO and
// WHAT: the default note (subject `all`) is the daily digest of the whole network — how many
// networks have nodes, which anchored lately and which were quiet, the biggest by nodes and the
// most active, anything that started or stopped, how the node count moved. A network's note says
// who that network is (its catalog blurb, a non-numeric line), its shape (nodes per layer and per
// node combination), how its node count moved and how it ranks. `noteFactsTrend.ts` is the
// reference builder and this one mirrors its idiom.
//
// It reads the STORED gauges, not a live fan-out: the sampler writes the same roster every hour,
// so a note costs no upstream read, and the span it states is the span the store measured.
//   · `fleet` is 30 days of the 1h tier (`f.nodes`, `f.nodes.<id>`, `f.layer.<id>.<role>`,
//     `f.type.<id>.<key>`) — gauges, so the newest hour is NOT trimmed;
//   · `daily` is the 1d tier with a 30-day LEAD-IN before the 30-day `span` (`m.<id>.snaps`,
//     `m.<id>.ticks`, `g.ticks`). Both are the STORE's payload, UNFOLDED.
//
// THE GATE'S INTERFACE (`noteHonesty.ts`): a ratio belongs to a network only by its display name in
// the fact's LABEL. The ratio of the whole network names none; a network's names it. `names` is the
// FULL catalog list. Labels carry no digits of their own ("last week", not "last 7 days"), so the
// model is not invited to write a figure no fact holds.
//
// HONESTY (rule 10):
//   · "networks" are the catalog's, the DAG's own core included (the unified node model): a network
//     has nodes when its count at the fleet's newest sample is above 0; one with no value at that
//     sample is not counted, not read as 0;
//   · node counts go through `gaugeChange`; a gauge that began after the span did (`firstIndex`
//     beyond 10% of the buckets) states only its current level, never a start of the span's;
//   · the layer and combination tallies are written only for the roles / types PRESENT, so they are
//     read at the newest sample that recorded any, with an absent one a measured 0 there (a stale
//     older count of a role that has since gone is never reported as current);
//   · activity is the global snapshots a network WAS PART OF per day (`m.<id>.ticks` through
//     `anchorSeries`, which reads a pre-2026-10-08 zero as "not measured") over the last week of
//     COMPLETE days; "anchored" reads `m.<id>.snaps`. A network with no row is not ranked;
//   · HOW MANY NETWORKS ANCHORED goes through `networksAnchored` on the folded series, so measured
//     unlisted activity makes the count a floor (", at least");
//   · "started" and "stopped" are Task 2's `first` / `last` read for every id, with the 30-day
//     lead-in marked via `from` so a network that merely resumed is not a start;
//   · null when the fleet has no measured sample (and, for a network, none of its own).
//
// Pure: no store values, react or I/O (the colocated test is the specification — rule 4).

export interface HyperFactsInput {
  subject: "all" | "dag" | string; // "all" = the digest; "dag" and a network id = that network
  fleet: TrendsWindowData; // 30 days of the 1h tier (store, unfolded)
  /** Daily tier: a 30-day lead-in before `span`, through its end (store, unfolded). */
  daily: TrendsWindowData;
  /** The 30-day span the note describes; its start marks the end of the daily lead-in. */
  span: { fromMs: number; toMs: number };
  names: Record<string, string>; // catalog id → display name
  blurbs: Record<string, string>; // catalog id → `blurb` (config.METAGRAPHS)
}

export interface HyperFacts {
  facts: Fact[];
  /** EVERY catalog display name (the gate strips and scopes by these), plus any other proper name a fact mentions. */
  names: string[];
  /** "<name> is: <blurb>" lines for the networks the facts name. */
  blurbs: string[];
  /** On `all` only: the sorted ids of the networks with nodes, comma-joined. The generator stores
   *  it so the warmer can re-write the digest when the set of networks changes. */
  setKey?: string;
}

const TOP = 3;
/** A gauge whose first measured sample falls later than this fraction of the span's buckets began after the span did. */
const LATE_START = 0.1;
const WEEK_DAYS = 7;
const RANK_WORD = ["", "second ", "third "] as const;

type Points = readonly (number | null)[];

/** "L0", "L0 and cL1", "L0, cL1 and dL1". */
function codeList(codes: readonly string[]): string {
  return codes.length < 2 ? (codes[0] ?? "") : `${codes.slice(0, -1).join(", ")} and ${codes[codes.length - 1]}`;
}

/** A node combination in words: one code is a dedicated node, several a hybrid, none a node that
 *  states no layer. */
function comboWords(key: string): string {
  const { codes } = roleKeyLabel(key);
  if (codes.length === 0) return "with no stated layer";
  return codes.length === 1 ? `running only ${codes[0]}` : `running ${codeList(codes)}`;
}

export function hyperFacts(input: HyperFactsInput): HyperFacts | null {
  const { subject, fleet, span, names: catalog, blurbs: blurbOf } = input;
  const all = subject === "all";
  const nameOf = (id: string) => catalog[id] ?? id;
  const ids = Object.keys(catalog);

  // THE FLEET'S NEWEST SAMPLE. Without one there is nothing to describe.
  const total = fleet.series["f.nodes"] ?? [];
  const latest = total.reduce<number>((acc, v, i) => (v != null ? i : acc), -1);
  if (latest < 0) return null;
  if (!all && !(fleet.series[`f.nodes.${subject}`] ?? []).some((v) => v != null)) return null;

  const mentioned = new Set<string>();
  const mention = (id: string): string => {
    const n = nameOf(id);
    mentioned.add(n);
    return n;
  };
  const named: string[] = []; // ids in the order the facts name them, for the blurbs

  // Nodes per network at the newest fleet sample; an absent value is not a count.
  const nodesAt = (id: string): number | null => fleet.series[`f.nodes.${id}`]?.[latest] ?? null;
  const withNodes = ids.filter((id) => (nodesAt(id) ?? 0) > 0);
  const byNodes = withNodes.slice().sort((a, b) => nodesAt(b)! - nodesAt(a)! || a.localeCompare(b));

  // THE DAILY TIER, folded, the still-filling newest day cut.
  const isListed = (id: string) => LISTED_IDS.has(id) || id in catalog;
  const d = trimNewestPartial({ ...input.daily, series: withUnlisted(input.daily.series, isListed, UNLISTED_ID) });
  const n = d.buckets.length;
  const covered = d.series["g.ticks"] ?? [];
  const weekFrom = Math.max(0, n - WEEK_DAYS);
  const coveredFrom = (lo: number) => covered.slice(lo).some((v) => v != null);

  /** Activity per network over the last week: global snapshots it was part of, per day. */
  const activity = new Map<string, number>();
  for (const id of ids) {
    const vals = anchorSeries(id, d.series).slice(weekFrom).filter((v): v is number => v != null);
    if (vals.length) activity.set(id, vals.reduce((a, v) => a + v, 0) / vals.length);
  }
  const byActivity = [...activity].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const facts: Fact[] = [];

  /** A gauge's start, end and ratio, or only its current level where it began late. */
  const gaugeFacts = (label: string, points: Points): void => {
    const ch = gaugeChange(points);
    if (!ch) return;
    if (ch.firstIndex > LATE_START * points.length) {
      facts.push(fact(`${label} at the end of the span`, ch.to, "count"));
      return;
    }
    facts.push(fact(`${label} at the start of the span`, ch.from, "count"));
    facts.push(fact(`${label} at the end of the span`, ch.to, "count"));
    if (ch.from > 0 && ch.to !== ch.from) facts.push(fact(`${label}, ratio end to start`, ch.to / ch.from, "ratio"));
  };

  if (all) {
    facts.push(fact("Networks with nodes", withNodes.length, "count"));

    // WHO ANCHORED. The window is already trimmed of its partial edge, and `networksAnchored` trims
    // the counter edges again, so its one series is padded with an unmeasured bucket at each end.
    for (const [word, lo] of [["day", Math.max(0, n - 1)], ["week", weekFrom]] as const) {
      if (!n || !coveredFrom(lo)) continue;
      const listed = ids.filter((id) => (d.series[`m.${id}.snaps`] ?? []).slice(lo).some((v) => (v ?? 0) > 0)).length;
      const padded = { [`m.${UNLISTED_ID}.snaps`]: [null, ...(d.series[`m.${UNLISTED_ID}.snaps`] ?? []).slice(lo), null] };
      const anchored = networksAnchored(listed, padded, d.stepMs);
      facts.push(fact(`Networks that anchored snapshots in the last ${word}${anchored.atLeast ? ", at least" : ""}`, anchored.count, "count"));
    }
    if (n && coveredFrom(weekFrom)) {
      const quiet = withNodes.filter((id) => {
        const wk = (d.series[`m.${id}.snaps`] ?? []).slice(weekFrom).filter((v): v is number => v != null);
        return wk.length > 0 && wk.every((v) => v === 0);
      });
      facts.push(fact("Networks with nodes that anchored nothing in the last week", quiet.length, "count"));
    }

    byNodes.slice(0, TOP).forEach((id, i) => {
      named.push(id);
      facts.push(fact(`${mention(id)}, nodes (${RANK_WORD[i]}biggest network)`, nodesAt(id)!, "count"));
    });
    byActivity.slice(0, TOP).forEach(([id, v], i) => {
      named.push(id);
      facts.push(fact(`${mention(id)}, global snapshots it was part of per day, last week (${RANK_WORD[i]}most active network)`, v, "count"));
    });

    gaugeFacts("Nodes across all networks", total);

    // STARTED AND STOPPED: Task 2's first / last for every id, the 30-day lead-in before the span
    // marked via `from` so a network that began earlier, or merely resumed, is not a start.
    if (n) {
      const from = d.buckets.findIndex((b) => b >= span.fromMs);
      const days = notableDays({
        days: d.buckets,
        covered,
        series: d.series,
        subject: "dag",
        ids,
        cap: ids.length * 2, // a network has at most one first and one last
        from: from < 0 ? n : from,
      }).filter((day) => (day.kind === "first" || day.kind === "last") && day.networkId);
      for (const day of days) {
        const id = day.networkId!;
        named.push(id);
        facts.push(fact(`${mention(id)} ${day.kind === "first" ? "started anchoring, first day" : "stopped anchoring, last day"}`, day.dayMs, "date"));
      }
    }
  } else {
    const name = mention(subject);
    named.push(subject);
    gaugeFacts(`${name} nodes`, fleet.series[`f.nodes.${subject}`] ?? []);

    // THE SHAPE: nodes per layer and per combination, at the newest sample that recorded any.
    const layerRows = Object.keys(ROLE_SHORT).map((role) => ({ role, points: fleet.series[`f.layer.${subject}.${role}`] ?? [] }));
    const at = layerRows.reduce<number>((acc, { points }) => points.reduce<number>((a, v, i) => (v != null ? Math.max(a, i) : a), acc), -1);
    if (at >= 0) {
      for (const { role, points } of layerRows) {
        const count = points[at] ?? 0;
        if (count > 0) facts.push(fact(`${name} nodes on the ${ROLE_SHORT[role]} layer`, count, "count"));
      }
    }
    for (const band of typeBands(subject, fleet.series)) {
      const count = lastMeasured(band.points) ?? 0;
      if (count > 0) facts.push(fact(`${name} nodes ${comboWords(band.key)}`, count, "count"));
    }

    // THE RANKS, among the networks that have the thing being ranked.
    const own = nodesAt(subject);
    if (own != null && own > 0) {
      facts.push(fact(`${name} rank by nodes`, 1 + byNodes.filter((id) => nodesAt(id)! > own).length, "count"));
      facts.push(fact("Networks with nodes", withNodes.length, "count"));
    }
    const mine = activity.get(subject);
    if (mine != null) facts.push(fact(`${name} global snapshots it was part of per day, last week`, mine, "count"));
    if (mine != null && mine > 0) {
      facts.push(fact(`${name} rank by global snapshots it was part of`, 1 + byActivity.filter(([, v]) => v > mine).length, "count"));
      facts.push(fact("Networks that were part of global snapshots in the last week", byActivity.length, "count"));
    }
  }

  const blurbs: string[] = [];
  for (const id of named) {
    const line = blurbOf[id] ? `${nameOf(id)} is: ${blurbOf[id]}` : "";
    if (line && !blurbs.includes(line)) blurbs.push(line);
  }

  const result: HyperFacts = { facts, names: [...new Set([...Object.values(catalog), ...mentioned])], blurbs };
  if (all) result.setKey = withNodes.slice().sort().join(",");
  return result;
}
