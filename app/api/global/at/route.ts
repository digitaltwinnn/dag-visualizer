import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";

// TIMESTAMP → GLOBAL ORDINAL, exactly (user, 2026-08-14 — the history rows' ANCHORED INTO
// join). The explorer stamps every metagraph snapshot with its anchoring global's OWN timestamp
// (the join is equality — verified live, 0 orphans), so resolving a history row's global needs
// no decompression: global timestamps are MONOTONIC in ordinal, so a binary search over the
// explorer's ~320-byte per-ordinal records finds the equal-timestamp global in ~23 tiny reads —
// each cached immutably, so searches warm each other and a page's rows share most probes.
//
// A miss (no global carries the exact timestamp) answers 404: the join rule says equality, and
// a nearest-neighbour guess would label a row with a tick it provably did not anchor into.

export const maxDuration = 20;

const BE = "https://be-mainnet.constellationnetwork.io";

interface GlobalRec {
  ordinal: number;
  timestamp: string;
  hash: string;
}

async function fetchGlobal(ordinal: number): Promise<GlobalRec> {
  const r = await fetch(`${BE}/global-snapshots/${ordinal}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  if (!r.ok) throw new Error(`be ${r.status}`);
  const j = (await r.json()) as { data?: { ordinal?: number; timestamp?: string; hash?: string } };
  const d = j.data;
  if (!d || typeof d.ordinal !== "number" || typeof d.timestamp !== "string") throw new Error("bad shape");
  return { ordinal: d.ordinal, timestamp: d.timestamp, hash: d.hash ?? "" };
}

// Ordinals are immutable — each probe caches for a day, shared across searches.
const cachedGlobal = (ordinal: number) =>
  unstable_cache(() => fetchGlobal(ordinal), ["be-global-v1", String(ordinal)], { revalidate: 86400 })();

async function latestOrdinal(): Promise<number> {
  const r = await fetch(`${BE}/global-snapshots/latest`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  if (!r.ok) throw new Error(`be ${r.status}`);
  const j = (await r.json()) as { data?: { ordinal?: number } };
  if (typeof j.data?.ordinal !== "number") throw new Error("bad shape");
  return j.data.ordinal;
}

async function resolve(ts: string): Promise<GlobalRec | null> {
  let lo = 1;
  let hi = await latestOrdinal();
  // ISO-8601 Zulu strings compare lexicographically; both sides come from the same indexer.
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const g = await cachedGlobal(mid);
    if (g.timestamp === ts) return g;
    if (g.timestamp < ts) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}

// The RESULT is immutable too (a timestamp's global never changes) — cache the whole search.
const cachedResolve = (ts: string) =>
  unstable_cache(() => resolve(ts), ["global-at-v1", ts], { revalidate: 86400 })();

export async function GET(req: Request) {
  const ts = new URL(req.url).searchParams.get("ts");
  // The explorer's own stamp format — reject anything else before it reaches upstream.
  if (!ts || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(ts)) {
    return NextResponse.json({ error: "bad ts" }, { status: 400 });
  }
  try {
    const g = await cachedResolve(ts);
    if (!g) return NextResponse.json({ available: false, ts }, { status: 404 });
    return NextResponse.json(g, { headers: { "Cache-Control": "public, max-age=86400, immutable" } });
  } catch {
    return NextResponse.json({ error: "upstream unavailable" }, { status: 503 });
  }
}
