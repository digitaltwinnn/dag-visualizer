import { ROLE_SHORT, roleKeyLabel } from "@/src/data/composition";
import { fact, gaugeChange, heldLevel, networksAnchored, observedLevel } from "@/src/data/noteFacts";
import { WHOLE_ACTIVITY_LABEL, activityFacts, lastWeekMean, weekStart } from "@/src/data/noteFactsActivity";
import { notableDays } from "@/src/data/notableDays";
import { WEEK_WORDS, countChange, eventChange, pickChanges } from "@/src/data/noteChanges";
import type { Fact, NoteChange } from "@/src/data/noteTypes";
import { anchorSeries, typeBands, withUnlisted } from "@/src/data/trendSeries";
import { trimNewestPartial, type TrendsWindowData } from "@/src/data/trendWindow";
import { LISTED_IDS, UNLISTED_ID } from "@/src/data/unlisted";

// HYPERGRAPH'S FACTS BUILDER — what the Hypergraph note's model is shown. Hyper answers WHO and
// WHAT, and the note leads with what CHANGED (user, 2026-10-27: a note that restates the breakdown
// the card already shows "just describes the raw data in words"). The default note (subject `all`)
// is the daily digest of the whole network — how many networks have nodes, which anchored lately
// and which were quiet, the biggest by nodes and the most active, the up-to-three MOVERS (the
// networks whose node count changed most over the span, start and end), anything that started or
// stopped, how the node count moved, and global snapshots per day last week against the weeks
// before. A network's note says who that network is (its catalog blurb, a non-numeric line),
// how its SHAPE CHANGED (the layers and node combinations whose count differs between the span's
// start and its end, both ends stated, plus how many layers changed — an exact 0 when the shape
// held), how its node count moved, how its activity compares with the weeks before, and how
// it ranks. A MAKE-UP'S note (a subject note: `{ net, type }`, the node-type card's selection) says
// how many of one network's nodes run that make-up over the span, beside the network's own level,
// the make-up's share of it and how many make-ups the network has. `noteFactsTrend.ts` is the
// reference builder and this one mirrors its idiom.
//
// It reads the STORED gauges, not a live fan-out: the sampler writes the same roster every hour,
// so a note costs no upstream read, and the span it states is the span the store measured.
//   · `fleet` is the span's week of the 1h tier (`f.nodes`, `f.nodes.<id>`, `f.layer.<id>.<role>`,
//     `f.type.<id>.<key>`) — gauges, so the newest hour is NOT trimmed;
//   · `daily` is the 1d tier with a 30-day LEAD-IN before the one-week `span` (`m.<id>.snaps`,
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
//     never a mover. A gauge whose start and end levels are equal is no mover either. A network's
//     start of 0 is read against its last whole day before the span (`throughEdgeOutage`): nodes
//     there make it an outage the span opened inside, never "its first nodes";
//   · the sampler writes layer and combination rows only for the roles / types PRESENT, and a failed
//     cluster fetch drops a role's row while `f.nodes.<id>` HOLDS (the lists merge by IP, so a
//     hybrid is still counted through its other layer). So each layer and combination is a HELD
//     LEVEL at each end, read exactly where `gaugeChange` reads the node count: the MEDIAN (an
//     observed sample, never a half node, R52; on an even count the middle nearer that edge, R61)
//     over the gauge's first (start) / last (end) six measured samples, of those whose
//     `f.nodes.<id>` is within 10% of the gauge's level at that end — one bad hour can neither make
//     nor hide a change, and the start never wanders mid-span. Fewer than three agreeing samples at
//     either end, or no change of node count to read (null, late start, either level 0): no shape
//     facts at all. At a sample a role with no row is a measured 0, unless the sample recorded no
//     role at all (unread); a combination band null at a sample (no type recorded) is unread; a
//     level read from fewer than three samples is unknown and states nothing. Only the layers and
//     combinations whose count DIFFERS are stated; an unchanged breakdown is the card's, not news;
//   · activity is the global snapshots a network WAS PART OF per day (`m.<id>.ticks` through
//     `anchorSeries`, which reads a pre-2026-10-08 zero as "not measured") over the last week of
//     COMPLETE days, at least 4 of them measured, else no last-week reading, comparison or rank;
//     "anchored" reads `m.<id>.snaps`. A network with no row is not ranked. "The
//     weeks before" is the mean over the 21 complete days before that week, measured days
//     only and at least 7 of them, else no fact; the ratio is stated only when both are above 0
//     and differ. The whole network's is `g.ticks` (one per global snapshot), covered days only,
//     under the same floors;
//   · THE VIEW'S OWN FACTS FIRST, THE COMMON READING LAST (user, 2026-10-29; R74): a note "starts
//     from its key view focus, then adds info about more app-common topics like snapshots". The
//     structure (nodes, layers, movers, started / stopped) is this view's; the activity facts are
//     the shared `noteFactsActivity.ts` and are appended after it, where the prompt asks for them;
//   · HOW MANY NETWORKS ANCHORED goes through `networksAnchored` on the folded series, so measured
//     unlisted activity makes the count a floor (", at least");
//   · "started" and "stopped" are Task 2's `first` / `last` read for every id, with the 30-day
//     lead-in marked via `from` so a network that merely resumed is not a start;
//   · A CHANGE IS A PAIR (R54): every start / end (node counts, movers, layers, combinations) and
//     every weeks-before / last-week reading carries `pair`, keyed by the quantity's label, so the
//     gate states an earlier figure only beside its own current one (R60);
//   · A MAKE-UP'S NOTE reads the make-up through `typeBands`, so a sample that recorded other types
//     but not this one is a measured 0 and a sample that recorded none is unread: the sampler stops
//     writing a make-up that emptied, and its last stored row is a stale count, never its end. Its
//     count goes through `gaugeFacts` (a pair, or only the end level when it began late); the
//     network's level and the make-up count are held levels, and the share is the make-up's end
//     level over the network's, stated only when it is one (the level above 0, the part within it).
//     Null when the make-up has no change to read (no sample, too few, or still moving at the end)
//     or ends at 0: a make-up the network no longer runs is no subject. No activity, rank or
//     common reading: the note is one card's, never the network's;
//   · null when the fleet has no measured sample (and, for a network, none of its own).
//
// Pure: no store values, react or I/O (the colocated test is the specification — rule 4).

export interface HyperFactsInput {
  /** "all" = the digest; "dag" and a network id = that network; `{ net, type }` = that network's
   *  make-up, `type` a `roleKey` (a subject note). */
  subject: "all" | "dag" | string | { net: string; type: string };
  fleet: TrendsWindowData; // the span's week of the 1h tier (store, unfolded)
  /** Daily tier: a 30-day lead-in before `span`, through its end (store, unfolded). */
  daily: TrendsWindowData;
  /** The span the note describes — ONE WEEK (user, 2026-10-29: the same range Geography reads its
   *  changes over); its start marks the end of the daily lead-in. */
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
  /** On `all` only: each network's held node count, and `all` for the whole network, as strings.
   *  The warm pass compares them with what a note was written under (`planPass`), so a note follows
   *  its numbers. Held levels, so a bad hour moves none. */
  driftKeys?: Record<string, string>;
  /** On a view note: what moved over the span, as the card's clickable rows (`noteChanges.ts`). */
  changes?: NoteChange[];
}

const TOP = 3;
/** A gauge whose first measured sample falls later than this fraction of the span's buckets began after the span did. */
const LATE_START = 0.1;
/** A sample's node count agrees with a level (the span's start or end) within this fraction. */
const SHAPE_TOLERANCE = 0.1;
/** A level at either end (a shape's, or the whole network's restored start) is read from the
 *  gauge's first / last this-many measured samples (`gaugeChange`'s own LEVEL_SAMPLES); a shape
 *  needs at least SHAPE_MIN_SAMPLES of them to agree. */
const SHAPE_SAMPLES = 6;
const SHAPE_MIN_SAMPLES = 3;
const RANK_WORD = ["", "second ", "third "] as const;

type Points = readonly (number | null)[];

type GaugeChange = NonNullable<ReturnType<typeof gaugeChange>>;

/** A gauge's change over the span, or null when it has none or began after the span did. */
function spanChange(points: Points): { from: number; to: number; firstIndex: number } | null {
  const ch = gaugeChange(points);
  return ch && ch.firstIndex <= LATE_START * points.length ? ch : null;
}

/** A START READ INSIDE AN OUTAGE (user, 2026-11-04: "Upside gained 3 nodes? Why?"). The median
 *  reads through an outage inside the span, but one the span OPENS in fills the start's samples,
 *  so a network that held its nodes all along reads 0 at the start and "gained its first nodes"
 *  by the end. A start of 0 for a network with nodes now is therefore read against `before`, its
 *  level on the last whole day before the span: nodes there make the 0 an outage and `before` the
 *  start. No reading there, or 0, and the 0 stands: a first is a first. */
function throughEdgeOutage<T extends { from: number; to: number }>(ch: T | null, before: number | null): T | null {
  return ch && ch.from === 0 && ch.to > 0 && before != null && before > 0 ? { ...ch, from: before } : ch;
}

/** "L0", "L0 and cL1", "L0, cL1 and dL1". */
function codeList(codes: readonly string[]): string {
  return codes.length < 2 ? (codes[0] ?? "") : `${codes.slice(0, -1).join(", ")} and ${codes[codes.length - 1]}`;
}

/** A node combination in words: one code is a dedicated node, several a hybrid, none a node that
 *  states no layer. A make-up note's label is built from it too, so its facts and its label agree. */
export function comboWords(key: string): string {
  const { codes } = roleKeyLabel(key);
  if (codes.length === 0) return "with no stated layer";
  return codes.length === 1 ? `running only ${codes[0]}` : `running ${codeList(codes)}`;
}

export function hyperFacts(input: HyperFactsInput): HyperFacts | null {
  const { subject, fleet, span, names: catalog, blurbs: blurbOf } = input;
  const all = subject === "all";
  /** The network the facts are about: a make-up's own network, else the subject. */
  const netId = typeof subject === "object" ? subject.net : subject;
  const nameOf = (id: string) => catalog[id] ?? id;
  const ids = Object.keys(catalog);

  // THE FLEET'S NEWEST SAMPLE. Without one there is nothing to describe.
  const total = fleet.series["f.nodes"] ?? [];
  const latest = total.reduce<number>((acc, v, i) => (v != null ? i : acc), -1);
  if (latest < 0) return null;
  if (!all && !(fleet.series[`f.nodes.${netId}`] ?? []).some((v) => v != null)) return null;

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
  const weekFrom = weekStart(n);
  const coveredFrom = (lo: number) => covered.slice(lo).some((v) => v != null);

  /** A network's nodes on the last WHOLE day before the span (`throughEdgeOutage`): a daily gauge
   *  is the day's last hourly reading, so the day the span opens on reads past its start. */
  const nodesBefore = (id: string): number | null => {
    const pts = d.series[`f.nodes.${id}`] ?? [];
    for (let i = n - 1; i >= 0; i--) if (d.buckets[i]! + d.stepMs <= span.fromMs && pts[i] != null) return pts[i]!;
    return null;
  };

  /** Activity per network over the last week: global snapshots it was part of, per day — the
   *  COMMON reading (`noteFactsActivity.ts`), so the rank and the change fact read one figure. */
  const activity = new Map<string, number>();
  for (const id of ids) {
    const v = lastWeekMean(anchorSeries(id, d.series));
    if (v != null) activity.set(id, v);
  }
  const byActivity = [...activity].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const facts: Fact[] = [];
  /** The card's rows, per kind of move (`pickChanges`): what started or stopped, then the counts. */
  let events: NoteChange[] = [];
  /** A line for the model: what this note has no start for. */
  let unread: string | null = null;
  let counts: NoteChange[] = [];

  /** A gauge's start, end and ratio, or only its current level where it began late. `start` reads
   *  the start again where an edge outage hid part of it (`throughEdgeOutage`). */
  const gaugeFacts = (label: string, points: Points, start: (ch: GaugeChange) => GaugeChange = (ch) => ch): void => {
    const read = gaugeChange(points);
    const ch = read && start(read);
    if (!ch) return;
    if (!spanChange(points)) {
      facts.push(fact(`${label} ${WEEK_WORDS.end}`, ch.to, "count"));
      return;
    }
    facts.push(fact(`${label} ${WEEK_WORDS.start}`, ch.from, "count", undefined, { key: label, end: "from" }));
    facts.push(fact(`${label} ${WEEK_WORDS.end}`, ch.to, "count", undefined, { key: label, end: "to" }));
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
      facts.push(fact(`Networks that anchored metagraph snapshots in the last ${word}${anchored.atLeast ? ", at least" : ""}`, anchored.count, "count"));
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
    // HOW MANY MOVED is stated even at 0 (user, 2026-10-30: a quiet week is SAID, "no changes in
    // composition", rather than left to the node count): the question asks for it by name.
    const reads = ids.map((id) => {
      const raw = spanChange(fleet.series[`f.nodes.${id}`] ?? []);
      return { id, raw, ch: throughEdgeOutage(raw, nodesBefore(id)) };
    });
    /** The networks whose start was read through an edge outage, with the level put back. */
    const restored = reads.filter((m) => m.ch !== m.raw).map(({ id, ch }) => ({ id, from: ch!.from }));
    const movers = reads
      .filter((m): m is typeof m & { ch: GaugeChange } => !!m.ch && m.ch.to !== m.ch.from)
      .sort((a, b) => Math.abs(b.ch.to - b.ch.from) - Math.abs(a.ch.to - a.ch.from) || a.id.localeCompare(b.id));
    facts.push(fact(`Networks whose node count changed in ${WEEK_WORDS.range}`, movers.length, "count"));
    counts = movers.flatMap(({ id, ch }) => countChange(nameOf(id), ch.from, ch.to, { kind: "network", id }, null, WEEK_WORDS) ?? []);
    movers
      .slice(0, TOP)
      .forEach(({ id, ch }) => {
        named.push(id);
        const name = mention(id);
        const key = `${name} nodes`;
        facts.push(fact(`${key} ${WEEK_WORDS.start}`, ch.from, "count", undefined, { key, end: "from" }));
        facts.push(fact(`${key} ${WEEK_WORDS.end}`, ch.to, "count", undefined, { key, end: "to" }));
      });

    // THE WHOLE NETWORK'S START, with each restored network's nodes put back: the rest of the
    // network read where `gaugeChange` reads it (its opening six measured samples, those networks
    // taken out), plus their restored levels. Their outage is in the total's samples too.
    gaugeFacts("Nodes across all networks", total, (ch) => {
      if (!restored.length) return ch;
      const rows = restored.map(({ id }) => fleet.series[`f.nodes.${id}`] ?? []);
      const rest = total.flatMap((v, i) => (v != null ? [v - rows.reduce((a, r) => a + (r[i] ?? 0), 0)] : []));
      if (rest.length < SHAPE_SAMPLES) return ch;
      return { ...ch, from: observedLevel(rest.slice(0, SHAPE_SAMPLES), "start") + restored.reduce((a, r) => a + r.from, 0) };
    });

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
      facts.push(fact(`Networks that became active or went quiet in ${WEEK_WORDS.range}`, days.length, "count"));
      events = days.map((day) => eventChange(nameOf(day.networkId!), day.kind === "first" ? "active" : "quiet", { kind: "network", id: day.networkId! }, WEEK_WORDS));
      for (const day of days) {
        const id = day.networkId!;
        named.push(id);
        facts.push(fact(`${mention(id)} ${day.kind === "first" ? "started anchoring, first day" : "stopped anchoring, last day"}`, day.dayMs, "date"));
      }
    }

    // THE COMMON READING, LAST (R74): the whole network's global snapshots per day (`g.ticks`
    // counts them, one per global snapshot), covered days only — an uncovered day is null.
    facts.push(...activityFacts(WHOLE_ACTIVITY_LABEL, covered));
  } else if (typeof subject === "object") {
    // ONE LAYER GROUP OF ONE NETWORK ("layer group" in every label a reader meets, never the code's
    // "make-up" — user, 2026-10-30: "not understandable for a human"; the rail's ghost hint already
    // says "a layer group"): its count over the span, read where the shape facts read it
    // (`typeBands`: absent beside other types is 0, so an emptied make-up never keeps its last count).
    const { net, type } = subject;
    const bands = typeBands(net, fleet.series);
    const points = bands.find((b) => b.key === type)?.points ?? [];
    const ch = gaugeChange(points);
    if (!ch || ch.to === 0) return null;
    const name = mention(net);
    named.push(net);
    const words = comboWords(type);
    gaugeFacts(`${name} nodes ${words}`, points);
    const level = levelOf(net)!; // measured: the network's own samples were checked above
    facts.push(fact(`${name} nodes ${WEEK_WORDS.end}`, level, "count"));
    const held = bands.map((b) => heldLevel(b.points) ?? 0);
    const groups = held.filter((v) => v > 0).length;
    // A share is a part of a whole: a make-up read above the network's level (a partial hour at
    // one end) states none, and neither does the only group, which has nothing to rank against.
    if (groups > 1 && level > 0 && ch.to <= level) facts.push(fact(`${name}, share of its nodes ${words}`, ch.to / level, "share"));
    facts.push(fact(`Layer groups in ${name}`, groups, "count"));
    // Its place among them, read as a country's or a provider's rank is (`noteFactsGeo.ts`): the
    // held levels, so a partial hour at one end cannot move it (user, 2026-10-30: the note is to
    // say how the subject relates to the rung's distribution, and "how it stands" was parroted).
    const own = heldLevel(points) ?? ch.to;
    if (groups > 1) facts.push(fact(`${name}, rank among its layer groups by nodes`, 1 + held.filter((v) => v > own).length, "count"));
    // A group whose series began inside the week has no start of the span's to move from.
    const moved = spanChange(points);
    if (moved) counts = [countChange(`${roleKeyLabel(type).label} group`, moved.from, moved.to, { kind: "self" }, null, WEEK_WORDS)].filter((c) => c != null);
    else unread = `${name} nodes ${words} has no reading from ${WEEK_WORDS.start}: say nothing about whether it moved or held.`;
  } else {
    const name = mention(subject);
    named.push(subject);
    const nodePoints = fleet.series[`f.nodes.${subject}`] ?? [];
    gaugeFacts(`${name} nodes`, nodePoints, (ch) => throughEdgeOutage(ch, nodesBefore(subject))!);

    // THE CHANGE OF SHAPE: nodes per layer and per combination at the span's start and its end,
    // each a HELD level like the node count's own (see the header). Only what changed is stated,
    // beside how many layers changed. A start read through an edge outage has too few agreeing
    // opening samples to read a shape from, so it states none.
    const ch = throughEdgeOutage(spanChange(nodePoints), nodesBefore(subject));
    if (ch && ch.from > 0 && ch.to > 0) {
      const agrees = (i: number, level: number) => Math.abs(nodePoints[i]! - level) <= SHAPE_TOLERANCE * level;
      const measured = nodePoints.flatMap((v, i) => (v != null ? [i] : []));
      // The samples each end is read from: the gauge's own opening / closing samples, those that
      // agree with its level there (a partial-outage hour is left out).
      const startAt = measured.slice(0, SHAPE_SAMPLES).filter((i) => agrees(i, ch.from));
      const endAt = measured.slice(-SHAPE_SAMPLES).filter((i) => agrees(i, ch.to));
      if (startAt.length >= SHAPE_MIN_SAMPLES && endAt.length >= SHAPE_MIN_SAMPLES && startAt[startAt.length - 1]! < endAt[0]!) {
        /** The observed median (`observedLevel`, R52: a whole count, the split read toward `edge`,
         *  R61) of a reading over an end's samples, the unread (null) ones left out; null when
         *  fewer than SHAPE_MIN_SAMPLES were read. */
        const held = (at: readonly number[], edge: "start" | "end", read: (i: number) => number | null): number | null => {
          const xs = at.map(read).filter((v): v is number => v != null);
          return xs.length >= SHAPE_MIN_SAMPLES ? observedLevel(xs, edge) : null;
        };
        const roles = Object.keys(ROLE_SHORT);
        const rows = roles.map((role) => fleet.series[`f.layer.${subject}.${role}`] ?? []);
        // A role with no row at a sample is a measured 0 — unless the sample recorded no role at
        // all, which is no reading.
        const layerAt = (k: number) => (i: number) => (rows.some((r) => r[i] != null) ? (rows[k]![i] ?? 0) : null);
        const was = roles.map((_, k) => held(startAt, "start", layerAt(k)));
        const is = roles.map((_, k) => held(endAt, "end", layerAt(k)));
        if (was.every((v) => v != null) && is.every((v) => v != null)) {
          const moved = roles.filter((_, k) => was[k] !== is[k]);
          facts.push(fact(`${name} layers whose node count changed in ${WEEK_WORDS.range}`, moved.length, "count"));
          for (const role of moved) {
            const k = roles.indexOf(role);
            const key = `${name} nodes on the ${ROLE_SHORT[role]} layer`;
            facts.push(fact(`${key} ${WEEK_WORDS.start}`, was[k]!, "count", undefined, { key, end: "from" }));
            facts.push(fact(`${key} ${WEEK_WORDS.end}`, is[k]!, "count", undefined, { key, end: "to" }));
          }
        }
        // The make-ups read at both ends, and how many of them changed, stated even at 0 so a quiet
        // week can be SAID (user, 2026-10-30); a band unread at either end is neither.
        const bands = typeBands(subject, fleet.series)
          .map((band) => ({
            key: band.key,
            from: held(startAt, "start", (i) => band.points[i] ?? null), // null: no type recorded at that sample
            to: held(endAt, "end", (i) => band.points[i] ?? null),
          }))
          .filter((b): b is { key: string; from: number; to: number } => b.from != null && b.to != null);
        const changedBands = bands.filter((b) => b.from !== b.to);
        facts.push(fact(`${name} layer groups whose node count changed in ${WEEK_WORDS.range}`, changedBands.length, "count"));
        counts = changedBands.flatMap(({ key: type, from, to }) =>
          countChange(`${roleKeyLabel(type).label} group`, from, to, { kind: "type", netId: subject, type }, null, WEEK_WORDS) ?? [],
        );
        for (const { key: type, from, to } of changedBands) {
          const key = `${name} nodes ${comboWords(type)}`;
          facts.push(fact(`${key} ${WEEK_WORDS.start}`, from, "count", undefined, { key, end: "from" }));
          facts.push(fact(`${key} ${WEEK_WORDS.end}`, to, "count", undefined, { key, end: "to" }));
        }
      }
    }

    // THE RANKS, among the networks that have the thing being ranked.
    const own = levelOf(subject);
    if (own != null && own > 0) {
      facts.push(fact(`${name} rank by nodes`, 1 + byNodes.filter((id) => levelOf(id)! > own).length, "count"));
      facts.push(fact("Networks with nodes", withNodes.length, "count"));
    }
    // THE COMMON READING, LAST (R74): its activity, the same facts Geography appends.
    const mine = activity.get(subject);
    facts.push(...activityFacts(`${name} global snapshots it was part of per day`, anchorSeries(subject, d.series)));
    if (mine != null && mine > 0) {
      facts.push(fact(`${name} rank by global snapshots it was part of`, 1 + byActivity.filter(([, v]) => v > mine).length, "count"));
      facts.push(fact("Networks that were part of global snapshots in the last week", byActivity.length, "count"));
    }
  }

  const blurbs: string[] = unread ? [unread] : [];
  for (const id of named) {
    const line = blurbOf[id] ? `${nameOf(id)} is: ${blurbOf[id]}` : "";
    if (line && !blurbs.includes(line)) blurbs.push(line);
  }

  const result: HyperFacts = { facts, names: [...new Set([...Object.values(catalog), ...mentioned])], blurbs };
  const changes = pickChanges(events, counts);
  if (changes.length) result.changes = changes;
  if (all) {
    result.setKey = withNodes.slice().sort().join(",");
    const levels = ids.flatMap((id): [string, string][] => {
      const level = levelOf(id);
      return level == null ? [] : [[id, String(level)]];
    });
    result.driftKeys = { ...Object.fromEntries(levels), all: levels.map(([id, v]) => `${id}:${v}`).sort().join(",") };
  }
  return result;
}
