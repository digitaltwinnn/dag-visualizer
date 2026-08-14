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

// The Archive fact's value, structured so the card can weight it: TIME is the register that
// matters, so it is the primary; the kept-snapshot count rides as a muted detail beside it
// (user, 2026-08-14 — "drop 'Last'... say ~15 months and say 893k snapshots more subtle").
// "From genesis" claims the whole chain, so its detail is the chain's own size; the global
// deep archives claim only their floor era — they have holes, so never a count.
export interface ArchiveDisplay {
  primary: string;
  detail?: string;
}
export function archiveDisplay(e: ArchiveEntry, since: string): ArchiveDisplay {
  if (e.kind === "genesis") return { primary: "From genesis", detail: `${fmtSnapCount(e.latest)} snapshots` };
  if (e.kind === "deep") return { primary: `Back to ${since}` };
  const count = `${fmtSnapCount(e.latest - e.floor)} snapshots`;
  const reach = e.floorTs ? fmtReach(e.floorTs) : null;
  return reach ? { primary: `~${reach}`, detail: count } : { primary: `~${count}` };
}

// The NETWORK-level reading for the dossier (user, 2026-08-14 — "how many have genesis?
// if not, that's useful information to know about a network"): does this chain's history
// survive on its own machines, and on how many of them? The RATIO is bold at the right —
// it counts nodes, so it aligns under the Online nodes total (user, same day) — and the
// muted qualifier in front says what the ratio is OF ("from genesis") plus, for a fleet
// with no genesis keeper, the deepest reach that survives ("~15 months"), which must never
// drop out of the value.
export function archiveSummary(c: ArchiveCensus, chain: string): { ratio: string; qualifier: string; title: string } | null {
  const entries = [...c.entries.values()].filter((e) => e.chain === chain);
  if (!entries.length) return null;
  const total = entries.length;
  const genesis = entries.filter((e) => e.kind === "genesis").length;
  if (genesis > 0) {
    return {
      ratio: `${genesis} / ${total}`,
      qualifier: "from genesis",
      title: `${genesis} of the ${total} probed machines serve the chain's every snapshot, back to ordinal 1.`,
    };
  }
  const deep = entries.filter((e) => e.kind === "deep").length;
  if (deep > 0) {
    return {
      ratio: `${deep} / ${total}`,
      qualifier: `back to ${c.since}`,
      title: `No machine serves the chain back to genesis; ${deep} of ${total} keep deep history to the metagraph era (${c.since}), with some gaps.`,
    };
  }
  // A window-only fleet: the deepest reach any machine serves is the whole qualifier — one
  // register, not two (user, 2026-08-14: "choose, either from genesis or x months"); the zero
  // ratio still reads against the label, and the title says "from genesis" in full.
  const best = entries.reduce((a, b) => (b.floor < a.floor ? b : a));
  const reach = best.floorTs ? fmtReach(best.floorTs) : null;
  return {
    ratio: `0 / ${total}`,
    qualifier: reach ? `~${reach}` : `~${fmtSnapCount(best.latest - best.floor)} snapshots`,
    title: `No machine serves the chain back to genesis — the deepest archive reaches back to ordinal ${best.floor.toLocaleString()}; the chain's first ${fmtSnapCount(best.floor)} snapshots are not served by any of them (the explorer's index still lists their records).`,
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
