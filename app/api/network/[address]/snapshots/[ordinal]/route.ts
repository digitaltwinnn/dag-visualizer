import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { NETWORKS, type NetworkId } from "@/src/engine/config";
import { netOf } from "@/src/net/request";

// ONE snapshot record of ANY currency chain — catalog or uncataloged alike (user, 2026-08-14:
// an unlisted metagraph snapshot's card had no hash to show, because a hash is not a field of
// the thing it hashes — the envelope in the global carries the snapshot's content, and the
// digest is computed by the indexer. The explorer indexes every anchoring chain, so this
// ~330 B read closes the gap). Address-shape is the only gate; the record is immutable, so it
// caches for a day.

export const maxDuration = 15;

const ADDRESS = /^DAG[A-Za-z0-9]{30,45}$/;

interface BeSnap {
  hash?: string;
  ordinal?: number;
  lastSnapshotHash?: string;
  timestamp?: string;
  fee?: number;
  sizeInKB?: number;
  ownerAddress?: string;
  stakingAddress?: string;
}

async function fetchRecord(net: NetworkId, address: string, ordinal: number) {
  const r = await fetch(`${NETWORKS[net].be}/currency/${address}/snapshots/${ordinal}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  if (r.status === 404) return { available: false as const };
  if (!r.ok) throw new Error(`be ${r.status}`);
  const d = ((await r.json()) as { data?: BeSnap }).data;
  if (!d) return { available: false as const };
  return {
    available: true as const,
    ordinal: d.ordinal ?? ordinal,
    hash: d.hash ?? "",
    parent: d.lastSnapshotHash ?? "",
    ts: d.timestamp ?? "",
    fee: d.fee ?? 0,
    sizeInKB: d.sizeInKB ?? 0,
    owner: d.ownerAddress ?? "",
    staking: d.stakingAddress ?? "",
  };
}

const cachedRecord = (net: NetworkId, address: string, ordinal: number) =>
  unstable_cache(() => fetchRecord(net, address, ordinal), ["network-snap-record-v1", net, address, String(ordinal)], {
    revalidate: 86400,
  })();

export async function GET(req: Request, ctx: { params: Promise<{ address: string; ordinal: string }> }) {
  const { address, ordinal: ordStr } = await ctx.params;
  const ordinal = Number(ordStr);
  if (!ADDRESS.test(address) || !Number.isInteger(ordinal) || ordinal < 1) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  try {
    const rec = await cachedRecord(netOf(req), address, ordinal);
    if (!rec.available) return NextResponse.json({ available: false }, { status: 404 });
    return NextResponse.json(rec, { headers: { "Cache-Control": "public, max-age=86400, immutable" } });
  } catch {
    return NextResponse.json({ error: "upstream unavailable" }, { status: 503 });
  }
}
