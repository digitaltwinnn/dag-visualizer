import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import metagraphsBaked from "@/data/metagraphs.json";
import type { SnapshotExact } from "@/src/data/types";

// EXACT per-tick anchor totals, read straight from the raw L0 global snapshot. The block explorer
// only gives `metagraphSnapshotCount`; the L0 node's `stateChannelSnapshots` carries EVERY anchored
// metagraph snapshot with its own `value.fee`, so summing them yields the exact total fee + the
// precise per-metagraph breakdown — INCLUDING unlisted metagraphs (no directory needed). The raw
// payload is heavy (~2.5 MB on a big tick), so this runs server-side and returns a tiny JSON,
// cached per ordinal (ordinals are immutable) — one fetch is shared across every client/render.
// Only recent ticks are available (the node prunes old ones); a 404 lets the client fall back to
// the polled floor.

export const maxDuration = 30;

const L0 = "https://l0-lb-mainnet.constellationnetwork.io";

// Addresses we track (the public catalog) — used to split listed vs unlisted.
const rawList = metagraphsBaked as unknown;
const LISTED = new Set(
  ((Array.isArray(rawList) ? rawList : (rawList as { metagraphs?: unknown[] }).metagraphs) ?? []
  ).map((m) => (m as { id: string }).id),
);

type StateChannelSnap = { value?: { fee?: number; content?: unknown[] } };

async function fetchExact(ordinal: number): Promise<SnapshotExact> {
  const r = await fetch(`${L0}/global-snapshots/${ordinal}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  // Throw (don't return a sentinel) so unstable_cache never caches a miss — a momentarily
  // unavailable recent tick is retried on the next request.
  if (!r.ok) throw new Error(`l0 ${r.status}`);
  const j = (await r.json()) as { value?: Record<string, unknown> } & Record<string, unknown>;
  const v = (j.value ?? j) as { stateChannelSnapshots?: Record<string, StateChannelSnap[]> };
  const sc = v.stateChannelSnapshots;
  if (!sc) throw new Error("no stateChannelSnapshots");

  let totalFee = 0,
    totalBytes = 0,
    listedFee = 0,
    unlistedFee = 0,
    anchored = 0,
    listedCount = 0,
    unlistedCount = 0;
  const perMeta: Record<string, { count: number; fee: number }> = {};
  for (const [addr, snaps] of Object.entries(sc)) {
    const listed = LISTED.has(addr);
    let count = 0,
      fee = 0;
    for (const s of snaps) {
      const f = s?.value?.fee ?? 0;
      // Actual serialized size — `content` is the snapshot's content as a byte array, so its
      // length is the real byte count anchored. NOT derived from the fee (the fee is computed by
      // Constellation's own non-trivial fee logic — don't assume a formula).
      const bytes = Array.isArray(s?.value?.content) ? s.value!.content!.length : 0;
      count++;
      fee += f;
      totalBytes += bytes;
      anchored++;
      totalFee += f;
      if (listed) listedFee += f;
      else unlistedFee += f;
    }
    perMeta[addr] = { count, fee };
    if (listed) listedCount += count;
    else unlistedCount += count;
  }
  return {
    ordinal,
    anchored,
    channels: Object.keys(sc).length,
    totalFee,
    totalSizeKB: totalBytes / 1024, // measured from content byte length, not the fee
    listedFee,
    unlistedFee,
    listedCount,
    unlistedCount,
    perMeta,
  };
}

const cachedExact = (ordinal: number) =>
  unstable_cache(() => fetchExact(ordinal), ["snapshot-exact", String(ordinal)], {
    revalidate: 86400, // ordinals are immutable; a day is plenty (success is cached, misses throw)
  })();

export async function GET(_req: Request, ctx: { params: Promise<{ ordinal: string }> }) {
  const { ordinal } = await ctx.params;
  const n = Number(ordinal);
  if (!Number.isFinite(n) || n < 0) {
    return NextResponse.json({ error: "bad ordinal" }, { status: 400 });
  }
  try {
    const data = await cachedExact(n);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=86400, immutable" },
    });
  } catch {
    // Pruned / not yet available — client keeps the polled floor for this tick.
    return NextResponse.json({ available: false, ordinal: n }, { status: 404 });
  }
}
