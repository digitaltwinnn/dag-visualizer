import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { NETWORKS, type NetworkId } from "@/src/engine/config";
import { netOf } from "@/src/net/request";

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

interface GlobalRec {
  ordinal: number;
  timestamp: string;
  hash: string;
  /** ⚠️ CARRIED, NOT DROPPED. The explorer serves `lastSnapshotHash` on every global snapshot and
   *  this route used to discard it, which is how the Global snapshot card came to show a Previous
   *  hash in WINDOW mode and none in HISTORY mode (user, 2026-09-01: "why does only the metagraph
   *  have a previous hash and the global snapshot not"). The two modes reach the same card by
   *  different roads — the live buffer keeps the explorer's whole record, this road rebuilt a
   *  three-field subset — so a field missing here reads as a fact the chain does not have. */
  lastSnapshotHash?: string;
}

async function fetchGlobal(net: NetworkId, ordinal: number): Promise<GlobalRec> {
  const r = await fetch(`${NETWORKS[net].be}/global-snapshots/${ordinal}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  if (!r.ok) throw new Error(`be ${r.status}`);
  const j = (await r.json()) as {
    data?: { ordinal?: number; timestamp?: string; hash?: string; lastSnapshotHash?: string };
  };
  const d = j.data;
  if (!d || typeof d.ordinal !== "number" || typeof d.timestamp !== "string") throw new Error("bad shape");
  return {
    ordinal: d.ordinal,
    timestamp: d.timestamp,
    hash: d.hash ?? "",
    // Absent stays ABSENT rather than becoming "": the card gates on presence, and an empty string
    // would render an empty Previous hash row instead of omitting it.
    ...(typeof d.lastSnapshotHash === "string" && d.lastSnapshotHash ? { lastSnapshotHash: d.lastSnapshotHash } : {}),
  };
}

// Ordinals are immutable — each probe caches for a day, shared across searches.
const cachedGlobal = (net: NetworkId, ordinal: number) =>
  unstable_cache(() => fetchGlobal(net, ordinal), ["be-global-v1", net, String(ordinal)], { revalidate: 86400 })();

async function latestOrdinal(net: NetworkId): Promise<number> {
  const r = await fetch(`${NETWORKS[net].be}/global-snapshots/latest`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  if (!r.ok) throw new Error(`be ${r.status}`);
  const j = (await r.json()) as { data?: { ordinal?: number } };
  if (typeof j.data?.ordinal !== "number") throw new Error("bad shape");
  return j.data.ordinal;
}

async function resolve(net: NetworkId, ts: string): Promise<GlobalRec | null> {
  let lo = 1;
  let hi = await latestOrdinal(net);
  // ISO-8601 Zulu strings compare lexicographically; both sides come from the same indexer.
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const g = await cachedGlobal(net, mid);
    if (g.timestamp === ts) return g;
    if (g.timestamp < ts) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}

// The RESULT is immutable too (a timestamp's global never changes) — cache the whole search.
const cachedResolve = (net: NetworkId, ts: string) =>
  unstable_cache(() => resolve(net, ts), ["global-at-v1", net, ts], { revalidate: 86400 })();

export async function GET(req: Request) {
  const ts = new URL(req.url).searchParams.get("ts");
  // The explorer's own stamp format — reject anything else before it reaches upstream.
  if (!ts || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(ts)) {
    return NextResponse.json({ error: "bad ts" }, { status: 400 });
  }
  try {
    const g = await cachedResolve(netOf(req), ts);
    if (!g) return NextResponse.json({ available: false, ts }, { status: 404 });
    return NextResponse.json(g, { headers: { "Cache-Control": "public, max-age=86400, immutable" } });
  } catch {
    return NextResponse.json({ error: "upstream unavailable" }, { status: 503 });
  }
}
