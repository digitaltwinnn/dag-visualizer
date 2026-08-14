"use client";

import { useEffect, useState } from "react";

// The archive census, client side (user, 2026-08-14 — the node card's Archive fact). One fetch
// per page load shared by every card via a module-level cache: archival membership changes on
// operator timescales, and the route itself is cached for an hour. A failed fetch leaves the
// map absent and the card row simply doesn't render — absent data stays absent.

export interface ArchiveCensus {
  /** ip → whether that DAG L0 validator serves deep history or a rolling recent window. */
  status: Map<string, "archival" | "pruned">;
  /** What "full history" reaches back to (the metagraph-era launch) — copy from the server. */
  since: string;
  archivalCount: number;
  total: number;
}

let cached: ArchiveCensus | null = null;
let inflight: Promise<ArchiveCensus | null> | null = null;

async function load(): Promise<ArchiveCensus | null> {
  try {
    const r = await fetch("/api/archive");
    if (!r.ok) return null;
    const j = (await r.json()) as { archival: string[]; pruned: string[]; total: number; since: string };
    const status = new Map<string, "archival" | "pruned">();
    for (const ip of j.archival) status.set(ip, "archival");
    for (const ip of j.pruned) status.set(ip, "pruned");
    cached = { status, since: j.since, archivalCount: j.archival.length, total: j.total };
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
