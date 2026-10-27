import { ROLE_SHORT, roleKeyLabel } from "@/src/data/composition";
import { fact, gaugeChange, heldLevel, networksAnchored } from "@/src/data/noteFacts";
import { notableDays } from "@/src/data/notableDays";
import type { Fact } from "@/src/data/noteTypes";
import { anchorSeries, typeBands, withUnlisted } from "@/src/data/trendSeries";
import { trimNewestPartial, type TrendsWindowData } from "@/src/data/trendWindow";
import { LISTED_IDS, UNLISTED_ID } from "@/src/data/unlisted";

// HYPERGRAPH'S FACTS BUILDER — what the Hypergraph note's model is shown. Hyper answers WHO and
// WHAT, and the note leads with what CHANGED (user, 2026-10-27: a note that restates the breakdown
// the card already shows "just describes the raw data in words"). The default note (subject `all`)
// is the daily digest of the whole network — how many networks have nodes, which anchored lately
// and which were quiet, the biggest by nodes and the most active, the up-to-three MOVERS (the
// networks whose node count changed most over the span, start and end), anything that started or
// stopped, how the node count moved, and global snapshots per day last week against the three
// weeks before. A network's note says who that network is (its catalog blurb, a non-numeric line),
// how its SHAPE CHANGED (the layers and node combinations whose count differs between the span's
// start and its end, both ends stated, plus how many layers changed — an exact 0 when the shape
// held), how its node count moved, how its activity compares with the weeks before, and how
// it ranks. `noteFactsTrend.ts` is the reference builder and this one mirrors its idiom.
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
// model is not invited to write a figure no fact holds — number WORDS included: the gate reads
// "three" as 3, so the comparison window is "the weeks before", never "the three weeks before"
// (R46: a note echoing that label was rejected).
//
// HONESTY (rule 10):
//   · "networks" are the catalog's, the DAG's own core included (the unified node model). A network's
//     node count NOW is its HELD LEVEL (`heldLevel`: the median of its last six measured
//     `f.nodes.<id>` samples, the same reading as `gaugeChange`'s end), because the sampler stores a
//     failed fetch as 0 or a partial count and one bad hour must not move a network in or out of
//     "has nodes", the ranks, the biggest list or `setKey`. It has nodes when that level is above 0;
//     every count in one facts object comes from it, so they agree;
//   · node counts go through `gaugeChange`; a gauge that began after the span did (`firstIndex`
//     beyond 10% of the buckets) states only its current level, never a start of the span's, and is
//     never a mover. A gauge whose start and end levels are equal is no mover either;
//   · the sampler writes layer and combination rows only for the roles / types PRESENT, so the
//     shape's END is read at the NEWEST sample whose `f.nodes.<id>` was measured and within 10% of
//     `gaugeChange`'s end level, and its START at the OLDEST sample within 10% of its start level
//     (a sample from a partial outage is skipped, never read as a change of shape). No change of
//     node count to read (null, late start, either level 0) or no agreeing sample at either end:
//     no shape facts at all. At a sample a role with no row is a measured 0, unless the sample
//     recorded no role at all (no reading: no layer facts, no changed-layers count); a combination
//     band null at a sample (no type recorded) is unknown and states nothing. Only the layers and
//     combinations whose count DIFFERS are stated; an unchanged breakdown is the card's, not news;
//   · activity is the global snapshots a network WAS PART OF per day (`m.<id>.ticks` through
//     `anchorSeries`, which reads a pre-2026-10-08 zero as "not measured") over the last week of
//     COMPLETE days; "anchored" reads `m.<id>.snaps`. A network with no row is not ranked. "The
//     weeks before" is the mean over the 21 complete days before that week, measured days
//     only and at least 7 of them, else no fact; the ratio is stated only when both are above 0
//     and differ. The whole network's is `g.ticks` (one per global snapshot), covered days only;
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
/** A sample's node count agrees with a level (the span's start or end) within this fraction. */
const SHAPE_TOLERANCE = 0.1;
const WEEK_DAYS = 7;
/** "The weeks before": the complete days before the last week, back to four weeks. */
const PRIOR_DAYS = 21;
/** The fewest measured days the weeks before are read from at all. */
const PRIOR_MIN_DAYS = 7;
const RANK_WORD = ["", "second ", "third "] as const;

type Points = readonly (number | null)[];

const mean = (xs: readonly number[]): number => xs.reduce((a, v) => a + v, 0) / xs.length;

/** A gauge's change over the span, or null when it has none or began after the span did. */
function spanChange(points: Points): { from: number; to: number; firstIndex: number } | null {
  const ch = gaugeChange(points);
  return ch && ch.firstIndex <= LATE_START * points.length ? ch : null;
}

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

  // Nodes per network NOW: the held level, outage-robust. No measured sample is not a count.
  const levelOf = (id: string): number | null => heldLevel(fleet.series[`f.nodes.${id}`] ?? []);
  const withNodes = ids.filter((id) => (levelOf(id) ?? 0) > 0);
  const byNodes = withNodes.slice().sort((a, b) => levelOf(b)! - levelOf(a)! || a.localeCompare(b));

  // THE DAILY TIER, folded, the still-filling newest day cut.
  const isListed = (id: string) => LISTED_IDS.has(id) || id in catalog;
  const d = trimNewestPartial({ ...input.daily, series: withUnlisted(input.daily.series, isListed, UNLISTED_ID) });
  const n = d.buckets.length;
  const covered = d.series["g.ticks"] ?? [];
  const weekFrom = Math.max(0, n - WEEK_DAYS);
  const priorFrom = Math.max(0, weekFrom - PRIOR_DAYS);
  const coveredFrom = (lo: number) => covered.slice(lo).some((v) => v != null);
  /** The per-day mean of a daily series over the weeks before the last week, measured days
   *  only; null under PRIOR_MIN_DAYS of them. */
  const priorMean = (points: Points): number | null => {
    const vals = points.slice(priorFrom, weekFrom).filter((v): v is number => v != null);
    return vals.length >= PRIOR_MIN_DAYS ? mean(vals) : null;
  };

  /** Activity per network over the last week: global snapshots it was part of, per day. */
  const activity = new Map<string, number>();
  for (const id of ids) {
    const vals = anchorSeries(id, d.series).slice(weekFrom).filter((v): v is number => v != null);
    if (vals.length) activity.set(id, mean(vals));
  }
  const byActivity = [...activity].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const facts: Fact[] = [];

  /** A gauge's start, end and ratio, or only its current level where it began late. */
  const gaugeFacts = (label: string, points: Points): void => {
    const ch = gaugeChange(points);
    if (!ch) return;
    if (!spanChange(points)) {
      facts.push(fact(`${label} at the end of the span`, ch.to, "count"));
      return;
    }
    facts.push(fact(`${label} at the start of the span`, ch.from, "count"));
    facts.push(fact(`${label} at the end of the span`, ch.to, "count"));
    if (ch.from > 0 && ch.to !== ch.from) facts.push(fact(`${label}, ratio end to start`, ch.to / ch.from, "ratio"));
  };

  /** A per-day reading over the last week beside the weeks before, and their ratio when both
   *  are above 0 and differ. `lastWeek` null states nothing; the prior needs its measured days. */
  const activityChange = (label: string, lastWeek: number | null, points: Points): void => {
    if (lastWeek == null) return;
    facts.push(fact(`${label}, last week`, lastWeek, "count"));
    const before = priorMean(points);
    if (before == null) return;
    facts.push(fact(`${label}, the weeks before`, before, "count"));
    if (lastWeek > 0 && before > 0 && lastWeek !== before)
      facts.push(fact(`${label}, ratio last week to the weeks before`, lastWeek / before, "ratio"));
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
      facts.push(fact(`${mention(id)}, nodes (${RANK_WORD[i]}biggest network)`, levelOf(id)!, "count"));
    });
    byActivity.slice(0, TOP).forEach(([id, v], i) => {
      named.push(id);
      facts.push(fact(`${mention(id)}, global snapshots it was part of per day, last week (${RANK_WORD[i]}most active network)`, v, "count"));
    });

    // THE MOVERS: the networks whose node count changed most over the span, by how many nodes.
    ids
      .map((id) => ({ id, ch: spanChange(fleet.series[`f.nodes.${id}`] ?? []) }))
      .filter((m): m is { id: string; ch: NonNullable<typeof m.ch> } => !!m.ch && m.ch.to !== m.ch.from)
      .sort((a, b) => Math.abs(b.ch.to - b.ch.from) - Math.abs(a.ch.to - a.ch.from) || a.id.localeCompare(b.id))
      .slice(0, TOP)
      .forEach(({ id, ch }) => {
        named.push(id);
        const name = mention(id);
        facts.push(fact(`${name} nodes at the start of the span`, ch.from, "count"));
        facts.push(fact(`${name} nodes at the end of the span`, ch.to, "count"));
      });

    gaugeFacts("Nodes across all networks", total);

    // THE WHOLE NETWORK'S ACTIVITY: global snapshots per day (`g.ticks` counts them, one per
    // global snapshot), covered days only — an uncovered day is null.
    const lastWeek = covered.slice(weekFrom).filter((v): v is number => v != null);
    activityChange("Global snapshots per day", lastWeek.length ? mean(lastWeek) : null, covered);

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
    const nodePoints = fleet.series[`f.nodes.${subject}`] ?? [];
    gaugeFacts(`${name} nodes`, nodePoints);

    // THE CHANGE OF SHAPE: nodes per layer and per combination at the span's start and its end,
    // each read at a sample whose own node count agrees with the gauge's level there (see the
    // header). Only what changed is stated, beside how many layers changed.
    const ch = spanChange(nodePoints);
    if (ch && ch.from > 0 && ch.to > 0) {
      const agrees = (i: number, level: number) => {
        const v = nodePoints[i];
        return v != null && Math.abs(v - level) <= SHAPE_TOLERANCE * level;
      };
      let end = -1;
      for (let i = nodePoints.length - 1; i >= 0 && end < 0; i--) if (agrees(i, ch.to)) end = i;
      const start = nodePoints.findIndex((_, i) => agrees(i, ch.from));
      if (start >= 0 && end > start) {
        const roles = Object.keys(ROLE_SHORT);
        // The layers at a sample: a role with no row is a measured 0 — unless the sample recorded
        // no role at all, which is no reading.
        const layersAt = (i: number): number[] | null => {
          const rows = roles.map((role) => fleet.series[`f.layer.${subject}.${role}`]?.[i] ?? null);
          return rows.some((v) => v != null) ? rows.map((v) => v ?? 0) : null;
        };
        const was = layersAt(start);
        const is = layersAt(end);
        if (was && is) {
          const moved = roles.filter((_, k) => was[k] !== is[k]);
          facts.push(fact(`${name} layers whose node count changed over the span`, moved.length, "count"));
          for (const role of moved) {
            const k = roles.indexOf(role);
            facts.push(fact(`${name} nodes on the ${ROLE_SHORT[role]} layer at the start of the span`, was[k]!, "count"));
            facts.push(fact(`${name} nodes on the ${ROLE_SHORT[role]} layer at the end of the span`, is[k]!, "count"));
          }
        }
        for (const band of typeBands(subject, fleet.series)) {
          const from = band.points[start]; // null: no type was recorded at that sample
          const to = band.points[end];
          if (from == null || to == null || from === to) continue;
          facts.push(fact(`${name} nodes ${comboWords(band.key)} at the start of the span`, from, "count"));
          facts.push(fact(`${name} nodes ${comboWords(band.key)} at the end of the span`, to, "count"));
        }
      }
    }

    // THE RANKS, among the networks that have the thing being ranked.
    const own = levelOf(subject);
    if (own != null && own > 0) {
      facts.push(fact(`${name} rank by nodes`, 1 + byNodes.filter((id) => levelOf(id)! > own).length, "count"));
      facts.push(fact("Networks with nodes", withNodes.length, "count"));
    }
    const mine = activity.get(subject);
    activityChange(`${name} global snapshots it was part of per day`, mine ?? null, anchorSeries(subject, d.series));
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
