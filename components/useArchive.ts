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

// The Archive fact's one-line value. Reach states time AND kept-snapshot count for a window
// ("Last ~3 months · 241k snapshots"); "From genesis" claims the whole chain; the global deep
// archives claim only their floor era ("Back to Nov 2023") — they have holes, so no count.
export function archiveValue(e: ArchiveEntry, since: string): string {
  if (e.kind === "genesis") return "From genesis";
  if (e.kind === "deep") return `Back to ${since}`;
  const count = fmtSnapCount(e.latest - e.floor);
  const reach = e.floorTs ? fmtReach(e.floorTs) : null;
  return reach ? `Last ~${reach} · ${count} snapshots` : `Last ~${count} snapshots`;
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
