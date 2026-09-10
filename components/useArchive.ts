"use client";

import { ageWords } from "@/src/util/relativeAge";
import { netUrl } from "@/src/net/current";
import { useEffect, useState } from "react";

// The archive census, client side (user, 2026-08-14 — the node card's Archive fact). One fetch
// per page load shared by every card via a module-level cache: archival membership changes on
// operator timescales, and the route itself is cached for an hour. The hook reports whether the
// fetch has SETTLED, so a card can hold the row with an acquiring state instead of popping it
// in (user, 2026-08-15); a failed fetch settles with no census and the node card states
// "Unmeasured" — never a hang, and the next mount asks again.

export interface ArchiveEntry {
  ip: string;
  /** "global" for the DAG's own chain; a metagraph id for its currency chain. */
  chain: string;
  kind: "genesis" | "deep" | "window";
  floor: number;
  latest: number;
  floorTs: string | null;
}

export interface ArchiveCensus {
  /** ip → what depth of its own chain that node serves. */
  entries: Map<string, ArchiveEntry>;
  /** What the global chain's "deep" reaches back to — copy from the server. */
  since: string;
  archivalCount: number;
  total: number;
}

// ~241,000 → "241k", 27,227,707 → "27M" — the count register the card value uses.
export function fmtSnapCount(n: number): string {
  if (n >= 1e6) return `${n >= 1e7 ? Math.round(n / 1e6) : (n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(Math.max(0, Math.round(n)));
}

// Wall-clock reach of a window floor. The TIERS moved to `ageWords` (src/util/relativeAge.ts,
// 2026-09-01) — it is the app's one long-form span now, shared with the vitals' idle card, so a
// reach and an idle age can never be phrased differently. What stays here is the rule that is this
// census's alone: a sub-day window is a measurement artifact, not a fact, and reports nothing.
export function fmtReach(floorTs: string, now = Date.now()): string | null {
  const t = Date.parse(floorTs);
  if (Number.isNaN(t)) return null;
  const ms = now - t;
  if (ms < 86_400_000) return null;
  return ageWords(ms);
}

// The NODE card's Archive value, in the same stacked grammar the dossier settled on (user,
// 2026-08-14 — "in the node card follow the same thinking"): a Yes/No main line against the
// "From genesis" label, the machine's own reach as the first underline, its kept-snapshot
// count as the second. The holed global deep archives still carry no count.
export interface ArchiveNodeDisplay {
  genesis: boolean;
  reach?: string;
  count?: string;
}
export function archiveDisplay(e: ArchiveEntry, since: string): ArchiveNodeDisplay {
  if (e.kind === "genesis") {
    // No "whole chain" prefix (user, 2026-08-14 — "let the number speak"): Yes already says
    // completeness, so the underline is just the chain's age.
    const age = e.floorTs ? fmtReach(e.floorTs) : null;
    return {
      genesis: true,
      reach: age ? `~${age}` : undefined,
      count: `${fmtSnapCount(e.latest)} snapshots`,
    };
  }
  if (e.kind === "deep") return { genesis: false, reach: `back to ${since}` };
  const reach = e.floorTs ? fmtReach(e.floorTs) : null;
  return {
    genesis: false,
    reach: reach ? `~${reach}` : undefined,
    count: `${fmtSnapCount(e.latest - e.floor)} snapshots`,
  };
}

// The node card's Full archive ROW, decided as pure data (user, 2026-08-15 — a separately-loaded
// fact holds its row rather than popping in once loaded). "na" is immediate — roles are local
// knowledge, and a machine with no L0 process serves no chain whatever the census says about
// others; "acquiring" only ever shows while the census is genuinely in flight, because "settled"
// covers failure too, so the give-up path is the same "unmeasured" a probe gap gets. A census
// entry wins over roles: the reading is the data, roles only predict it.
export type ArchiveFactState =
  | { kind: "value"; display: ArchiveNodeDisplay }
  | { kind: "na" }
  | { kind: "acquiring" }
  | { kind: "unmeasured" }
  | { kind: "none" };
export function archiveFactState(
  entry: ArchiveEntry | undefined,
  since: string | undefined,
  settled: boolean,
  roles: string[],
): ArchiveFactState {
  if (entry && since != null) return { kind: "value", display: archiveDisplay(entry, since) };
  if (roles.length === 0) return { kind: "none" };
  if (!roles.includes("l0")) return { kind: "na" };
  return settled ? { kind: "unmeasured" } : { kind: "acquiring" };
}

// The NETWORK-level reading for the dossier (user, 2026-08-14, settled over several passes):
// TWO facts, one claim each. "Node archives" states the deepest reach any of the network's
// own machines still serves, in the time register; "From genesis" is its own fact (user —
// "perhaps just a separate fact, like a checkmark"): a bare count, checked when at least
// one machine keeps the whole chain.
// The count is BARE — `1`, not `1 / 12` (user, 2026-08-18). It is one of two breakdowns of the
// same total, and Online nodes states that total two rows up in the same block, so the
// denominator restated it. Which total it counts against still lives in `genesisTitle`.
export interface ArchiveNetSummary {
  /** The deepest reach any machine serves — "~15 months", "back to Nov 2023", "~2.8 years". */
  reach: string;
  reachTitle: string;
  /** How many machines keep the chain back to ordinal 1 — a bare count against the total
   *  Online nodes states (see above). */
  genesisCount: string;
  /** True when any machine keeps the whole chain — the row's checkmark. */
  genesisAny: boolean;
  genesisTitle: string;
  /** Snapshots the deepest archive keeps — absent for the holed global deep archives. */
  kept?: number;
}
export function archiveSummary(c: ArchiveCensus, chain: string): ArchiveNetSummary | null {
  const entries = [...c.entries.values()].filter((e) => e.chain === chain);
  if (!entries.length) return null;
  const total = entries.length;
  const genesis = entries.filter((e) => e.kind === "genesis");
  const genesisCount = `${genesis.length}`;
  const genesisAny = genesis.length > 0;
  const genesisTitle = genesisAny
    ? `${genesis.length} of the ${total} probed nodes serve the chain's every snapshot, back to ordinal 1.`
    : `No probed node serves the chain back to ordinal 1.`;
  if (genesisAny) {
    // The fleet's deepest reach IS the chain's whole age — the genesis floor's own date.
    const ts = genesis.find((e) => e.floorTs)?.floorTs;
    const reach = ts ? fmtReach(ts) : null;
    return {
      reach: reach ? `~${reach}` : "full chain",
      reachTitle: `The deepest archive holds the whole chain, back to ordinal 1.`,
      genesisCount,
      genesisAny,
      genesisTitle,
      kept: genesis[0].latest,
    };
  }
  const deep = entries.filter((e) => e.kind === "deep").length;
  if (deep > 0) {
    return {
      reach: `back to ${c.since}`,
      reachTitle: `${deep} of ${total} nodes keep deep history to the metagraph era (${c.since}), with some gaps.`,
      genesisCount,
      genesisAny,
      genesisTitle,
    };
  }
  const best = entries.reduce((a, b) => (b.floor < a.floor ? b : a));
  const reach = best.floorTs ? fmtReach(best.floorTs) : null;
  return {
    reach: reach ? `~${reach}` : `~${fmtSnapCount(best.latest - best.floor)} snapshots`,
    reachTitle: `The deepest archive reaches back to ordinal ${best.floor.toLocaleString()}; the chain's first ${fmtSnapCount(best.floor)} snapshots are not served by any of the network's own nodes (the explorer's index still lists their records).`,
    genesisCount,
    genesisAny,
    genesisTitle,
    kept: best.latest - best.floor,
  };
}

// THE ARCHIVAL SCHEDULE (user, 2026-09-10, four rounds — the dossier's accounting form:
// "by archival", dynamic reach ranges, then the DAG's 152-node census turning the exact-reach
// rows into a ~25-row histogram: "too many rows for DAG, use 3-5 rows max and do some smart
// grouping based on the counts"). Three kinds, three treatments:
// - FULL nodes are ALWAYS their own leading row, never combined with partial copies (user,
//   round 4) — the row's count column carries how many, so the tag is the bare "full node".
//   Kept = the chain itself (the latest ordinal); label = the chain's age.
// - DEEP archives stay one row ("back to Nov 2023") with a null kept — the holed global
//   archives, where any count would overclaim (rule 10).
// - WINDOW nodes bucket by exact reach in the age grammar; when the distinct reaches
//   overflow the remaining row budget (MAX_SCHED_ROWS total) they cluster into contiguous
//   COUNT-BALANCED groups, labeled as a span ("3 – 6 months", "up to 18 days"). Kept is the
//   deepest single copy in the group — a per-node fact that never sums the chain against
//   itself (the DED double-count, round 3).
// The fleet's remainder stays "unmeasured" (an absent entry means the probe read nothing).
export interface ArchiveScheduleRow { label: string; count: number; kept: number | null; fullCount: number }
const MAX_SCHED_ROWS = 5;

// A merged group's label: one reach stays itself; a span reads shallow → deep, collapsing a
// shared unit ("3 – 6 months", not "3 months – 6 months"); a group whose shallow end is the
// sub-day "recent window" has no lower age claim, so it reads "up to <deep>".
function spanLabel(shallow: string, deep: string): string {
  if (shallow === deep) return deep;
  if (shallow === "recent window") return `up to ${deep}`;
  const s = shallow.split(" ");
  const d = deep.split(" ");
  if (s.length === 2 && d.length === 2 && s[1].replace(/s$/, "") === d[1].replace(/s$/, ""))
    return `${s[0]} – ${deep}`;
  return `${shallow} – ${deep}`;
}

export function archiveSchedule(
  c: ArchiveCensus, chain: string, fleetTotal: number, now = Date.now(),
): { rows: ArchiveScheduleRow[]; unmeasured: number } | null {
  const entries = [...c.entries.values()].filter((e) => e.chain === chain);
  if (!entries.length) return null;
  const rows: ArchiveScheduleRow[] = [];
  const full = entries.filter((e) => e.kind === "genesis");
  if (full.length) {
    const ts = full.find((e) => e.floorTs)?.floorTs;
    rows.push({
      label: (ts && fmtReach(ts, now)) || "full chain",
      count: full.length,
      kept: Math.max(...full.map((e) => e.latest)),
      fullCount: full.length,
    });
  }
  const deep = entries.filter((e) => e.kind === "deep");
  if (deep.length) rows.push({ label: `back to ${c.since}`, count: deep.length, kept: null, fullCount: 0 });
  const win = entries.filter((e) => e.kind === "window");
  if (win.length) {
    // Exact-reach buckets first, deepest leading — small fleets never see a span.
    const buckets = new Map<string, { label: string; count: number; kept: number; ms: number }>();
    for (const e of win) {
      const t = e.floorTs ? Date.parse(e.floorTs) : NaN;
      const ms = Number.isNaN(t) ? 0 : now - t;
      const label = (e.floorTs && fmtReach(e.floorTs, now)) || "recent window";
      const kept = e.latest - e.floor;
      const b = buckets.get(label);
      if (b) {
        b.count += 1;
        b.kept = Math.max(b.kept, kept);
        b.ms = Math.max(b.ms, ms);
      } else buckets.set(label, { label, count: 1, kept, ms });
    }
    const ordered = [...buckets.values()].sort((a, b) => b.ms - a.ms);
    const slots = Math.max(1, MAX_SCHED_ROWS - rows.length);
    if (ordered.length <= slots) {
      for (const b of ordered) rows.push({ label: b.label, count: b.count, kept: b.kept, fullCount: 0 });
    } else {
      // Greedy contiguous partition balancing NODE counts across the slots (the "smart
      // grouping based on the counts"): each group fills toward an even share of what
      // remains, always keeping one bucket per unfilled slot.
      let i = 0;
      let rem = win.length;
      for (let s = 0; s < slots; s++) {
        const start = i;
        let gc = 0;
        if (s === slots - 1) {
          for (; i < ordered.length; i++) gc += ordered[i].count;
        } else {
          const target = rem / (slots - s);
          do {
            gc += ordered[i].count;
            i += 1;
          } while (i < ordered.length - (slots - s - 1) && gc < target);
        }
        rem -= gc;
        const group = ordered.slice(start, i);
        rows.push({
          label: spanLabel(group[group.length - 1].label, group[0].label),
          count: gc,
          kept: Math.max(...group.map((b) => b.kept)),
          fullCount: 0,
        });
      }
    }
  }
  return { rows, unmeasured: Math.max(0, fleetTotal - entries.length) };
}

let cached: ArchiveCensus | null = null;
let inflight: Promise<ArchiveCensus | null> | null = null;

async function load(): Promise<ArchiveCensus | null> {
  try {
    // The ?v rides the URL so a response-shape change can never be served from a browser
    // cache of the previous shape (the route is public, max-age 1h).
    const r = await fetch(netUrl("/api/archive?v=2"));
    if (!r.ok) return null;
    const j = (await r.json()) as { entries: ArchiveEntry[]; total: number; archivalCount: number; since: string };
    const entries = new Map<string, ArchiveEntry>();
    for (const e of j.entries) entries.set(e.ip, e);
    cached = { entries, since: j.since, archivalCount: j.archivalCount, total: j.total };
    return cached;
  } catch {
    return null;
  } finally {
    // A failure must not pin null for the session — the next mount asks again.
    if (!cached) inflight = null;
  }
}

// A single chain's span — genesis date + newest ordinal — for the unlisted card's per-address
// blocks (user, 2026-08-14). Cached per address for the session; a miss caches too (the
// explorer answered; asking again next session is soon enough).
export interface ChainSpan {
  genesisTs: string | null;
  latestOrdinal: number;
  /** The channel's owner address off its newest record — the closest thing to an operator
   *  identity an uncataloged chain publishes. */
  owner: string | null;
}
const spans = new Map<string, ChainSpan | null>();
const spanInflight = new Map<string, Promise<ChainSpan | null>>();
async function loadSpan(address: string): Promise<ChainSpan | null> {
  try {
    // ?v busts any browser-cached previous response shape (the route is public, max-age 5m).
    const r = await fetch(netUrl(`/api/network/${address}/chain?v=3`));
    if (!r.ok) return null;
    const j = (await r.json()) as { genesisTs: string | null; latestOrdinal: number; owner: string | null };
    return { genesisTs: j.genesisTs, latestOrdinal: j.latestOrdinal, owner: j.owner ?? null };
  } catch {
    return null;
  }
}
export function useChainSpan(address: string | null): ChainSpan | null {
  const [span, setSpan] = useState(address ? (spans.get(address) ?? null) : null);
  useEffect(() => {
    if (!address || spans.has(address)) {
      setSpan(address ? (spans.get(address) ?? null) : null);
      return;
    }
    let dead = false;
    let p = spanInflight.get(address);
    if (!p) {
      p = loadSpan(address).then((v) => {
        spans.set(address, v);
        spanInflight.delete(address);
        return v;
      });
      spanInflight.set(address, p);
    }
    p.then((v) => {
      if (!dead) setSpan(v);
    });
    return () => {
      dead = true;
    };
  }, [address]);
  return span;
}

// One snapshot RECORD of any currency chain — the explorer's ~330 B per-ordinal read, used
// where the polled buffers can't answer (an unlisted snapshot's hash and parent; the polls
// track only the catalog). Immutable upstream, so cached for the session.
export interface SnapRecord {
  hash: string;
  parent: string;
}
const records = new Map<string, SnapRecord | null>();
export function useSnapRecord(metaId: string | null, ordinal: number, skip: boolean): SnapRecord | null {
  const key = metaId && ordinal >= 1 ? `${metaId}:${ordinal}` : null;
  const [rec, setRec] = useState(key ? (records.get(key) ?? null) : null);
  useEffect(() => {
    if (!key || skip) {
      setRec(null);
      return;
    }
    if (records.has(key)) {
      setRec(records.get(key) ?? null);
      return;
    }
    let dead = false;
    (async () => {
      try {
        const r = await fetch(netUrl(`/api/network/${metaId}/snapshots/${ordinal}`));
        const v = r.ok ? ((await r.json()) as { hash?: string; parent?: string }) : null;
        const rec = v ? { hash: v.hash ?? "", parent: v.parent ?? "" } : null;
        records.set(key, rec);
        if (!dead) setRec(rec);
      } catch {
        /* transient — next mount retries (nothing cached) */
      }
    })();
    return () => {
      dead = true;
    };
  }, [key, metaId, ordinal, skip]);
  return key && !skip ? rec : null;
}

// The census plus whether its one fetch has resolved — success OR failure — so a consumer can
// distinguish "a reading is coming" from "no reading came".
export interface ArchiveState {
  census: ArchiveCensus | null;
  settled: boolean;
}
export function useArchive(): ArchiveState {
  const [state, setState] = useState<ArchiveState>(() => ({ census: cached, settled: cached != null }));
  useEffect(() => {
    if (cached) return;
    let dead = false;
    (inflight ??= load()).then((v) => {
      if (!dead) setState({ census: v, settled: true });
    });
    return () => {
      dead = true;
    };
  }, []);
  return state;
}
