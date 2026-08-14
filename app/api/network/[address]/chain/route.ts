import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";

// A CHAIN'S SPAN — genesis date and newest ordinal — for ANY currency address, the catalog and
// the uncataloged alike (user, 2026-08-14: the unlisted card states real chain facts about a
// "secretive metagraph" — its machines are unknowable, but the explorer indexes every anchoring
// chain's records). Two ~330 B explorer reads, cached briefly; deliberately NOT catalog-gated,
// which is the whole point — the address-shape check is the only gate.

export const maxDuration = 15;

const BE = "https://be-mainnet.constellationnetwork.io";
const ADDRESS = /^DAG[A-Za-z0-9]{30,45}$/;

interface BeSnap {
  ordinal?: number;
  timestamp?: string;
  ownerAddress?: string;
}

async function readSnap(url: string): Promise<BeSnap | null> {
  const r = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`be ${r.status}`);
  const j = (await r.json()) as { data?: BeSnap | BeSnap[] };
  const d = Array.isArray(j.data) ? j.data[0] : j.data;
  return d ?? null;
}

async function fetchSpan(address: string) {
  const [genesis, latest] = await Promise.all([
    readSnap(`${BE}/currency/${address}/snapshots/1`),
    readSnap(`${BE}/currency/${address}/snapshots?limit=1`),
  ]);
  // A chain the explorer doesn't index at all is a deterministic miss for now — but "now"
  // changes as chains launch, so it rides the same short cache as a success.
  if (!latest) return { available: false as const };
  return {
    available: true as const,
    genesisTs: genesis?.timestamp ?? null,
    latestOrdinal: latest.ordinal ?? 0,
    latestTs: latest.timestamp ?? null,
    // The owner address, straight off the newest record (user, 2026-08-14): the address that
    // registered and controls the metagraph. (The staking address stays OFF this response —
    // it is fee-model collateral, homed in the future Staking view.)
    owner: latest.ownerAddress ?? null,
  };
}

const cachedSpan = (address: string) =>
  unstable_cache(() => fetchSpan(address), ["network-chain-span-v3", address], { revalidate: 300 })();

export async function GET(_req: Request, ctx: { params: Promise<{ address: string }> }) {
  const { address } = await ctx.params;
  if (!ADDRESS.test(address)) {
    return NextResponse.json({ error: "bad address" }, { status: 400 });
  }
  try {
    const span = await cachedSpan(address);
    if (!span.available) return NextResponse.json({ available: false }, { status: 404 });
    return NextResponse.json(span, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch {
    return NextResponse.json({ error: "upstream unavailable" }, { status: 503 });
  }
}
