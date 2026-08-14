"use client";

import { useEffect, useState } from "react";

// The archive census, client side (user, 2026-08-14 — the node card's Archive fact). One fetch
// per page load shared by every card via a module-level cache: archival membership changes on
// operator timescales, and the route itself is cached for an hour. A failed fetch leaves the
// map absent and the card row simply doesn't render — absent data stays absent.

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

// Wall-clock reach of a window floor — days under two months, whole months beyond (the user
// read decimals as strange; the census states reach with "~" anyway).
export function fmtReach(floorTs: string, now = Date.now()): string | null {
  const t = Date.parse(floorTs);
  if (Number.isNaN(t)) return null;
  const days = (now - t) / 86_400_000;
  if (days < 1) return null; // a sub-day window would be a measurement artifact, not a fact
  if (days < 60) return `${Math.round(days)} days`;
  if (days < 700) return `${Math.round(days / 30.44)} months`;
  return `${Math.round(days / 365.25)} years`;
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

// The NETWORK-level reading for the dossier (user, 2026-08-14, settled over several passes):
// TWO facts, one claim each. "Node archives" states the deepest reach any of the network's
// own machines still serves, in the time register; "From genesis" is its own fact (user —
// "perhaps just a separate fact, like a checkmark"): a counted ratio, checked when at least
// one machine keeps the whole chain.
export interface ArchiveNetSummary {
  /** The deepest reach any machine serves — "~15 months", "back to Nov 2023", "~2.8 years". */
  reach: string;
  reachTitle: string;
  /** How many machines keep the chain back to ordinal 1. */
  genesisRatio: string;
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
  const genesisRatio = `${genesis.length} / ${total}`;
  const genesisAny = genesis.length > 0;
  const genesisTitle = genesisAny
    ? `${genesis.length} of the ${total} probed machines serve the chain's every snapshot, back to ordinal 1.`
    : `No probed machine serves the chain back to ordinal 1.`;
  if (genesisAny) {
    // The fleet's deepest reach IS the chain's whole age — the genesis floor's own date.
    const ts = genesis.find((e) => e.floorTs)?.floorTs;
    const reach = ts ? fmtReach(ts) : null;
    return {
      reach: reach ? `~${reach}` : "full chain",
      reachTitle: `The deepest archive holds the whole chain, back to ordinal 1.`,
      genesisRatio,
      genesisAny,
      genesisTitle,
      kept: genesis[0].latest,
    };
  }
  const deep = entries.filter((e) => e.kind === "deep").length;
  if (deep > 0) {
    return {
      reach: `back to ${c.since}`,
      reachTitle: `${deep} of ${total} machines keep deep history to the metagraph era (${c.since}), with some gaps.`,
      genesisRatio,
      genesisAny,
      genesisTitle,
    };
  }
  const best = entries.reduce((a, b) => (b.floor < a.floor ? b : a));
  const reach = best.floorTs ? fmtReach(best.floorTs) : null;
  return {
    reach: reach ? `~${reach}` : `~${fmtSnapCount(best.latest - best.floor)} snapshots`,
    reachTitle: `The deepest archive reaches back to ordinal ${best.floor.toLocaleString()}; the chain's first ${fmtSnapCount(best.floor)} snapshots are not served by any of the network's own machines (the explorer's index still lists their records).`,
    genesisRatio,
    genesisAny,
    genesisTitle,
    kept: best.latest - best.floor,
  };
}

let cached: ArchiveCensus | null = null;
let inflight: Promise<ArchiveCensus | null> | null = null;

async function load(): Promise<ArchiveCensus | null> {
  try {
    // The ?v rides the URL so a response-shape change can never be served from a browser
    // cache of the previous shape (the route is public, max-age 1h).
    const r = await fetch("/api/archive?v=2");
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
}
const spans = new Map<string, ChainSpan | null>();
const spanInflight = new Map<string, Promise<ChainSpan | null>>();
async function loadSpan(address: string): Promise<ChainSpan | null> {
  try {
    const r = await fetch(`/api/network/${address}/chain`);
    if (!r.ok) return null;
    const j = (await r.json()) as { genesisTs: string | null; latestOrdinal: number };
    return { genesisTs: j.genesisTs, latestOrdinal: j.latestOrdinal };
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

export function useArchive(): ArchiveCensus | null {
  const [census, setCensus] = useState(cached);
  useEffect(() => {
    if (cached) return;
    let dead = false;
    (inflight ??= load()).then((v) => {
      if (!dead && v) setCensus(v);
    });
    return () => {
      dead = true;
    };
  }, []);
  return census;
}
