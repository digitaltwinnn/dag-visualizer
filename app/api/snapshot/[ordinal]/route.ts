import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { CATALOG, type NetworkId } from "@/src/engine/config";
import { netOf } from "@/src/net/request";
import type { SnapshotExact, ChannelSnapRow } from "@/src/data/types";
import { decodeChannelContent } from "../decodeChannel";
import { fetchGlobalJson } from "../fetchGlobal";
import { withinServedWindow } from "../ordinalWindow";

// EXACT per-tick anchor totals, read straight from the raw L0 global snapshot. The block explorer
// only gives `metagraphSnapshotCount`; the L0 node's `stateChannelSnapshots` carries EVERY anchored
// metagraph snapshot with its own `value.fee`, so summing them yields the exact total fee + the
// precise per-metagraph breakdown — INCLUDING unlisted metagraphs (no directory needed). The raw
// payload is heavy (~2.5 MB on a big tick), so this runs server-side and returns a tiny JSON,
// cached per ordinal (ordinals are immutable) — one fetch is shared across every client/render.
// ⚠️ The LB's serving depth is a per-request lottery (see CLAUDE.md's payload-depth note), so
// the pull goes through fetchGlobal.ts, which falls back to known-archival nodes on a 404;
// ordinalWindow.ts still bounds the future, and a failure here leaves the client on the polled
// floor either way.

export const maxDuration = 60;

// Addresses we track (the public catalog, config.METAGRAPHS — the canonical list the
// Hypergraph hubs are built from) — used to split listed vs unlisted.

type StateChannelSnap = { value?: { fee?: number; content?: unknown[] } };

async function fetchExact(net: NetworkId, ordinal: number): Promise<SnapshotExact> {
  const LISTED = new Set(CATALOG[net].map((m) => m.id));
  // fetchGlobalJson throws on failure (LB and archival fallback both) so unstable_cache never
  // caches a miss — a momentarily unavailable tick is retried on the next request.
  const j = (await fetchGlobalJson(net, ordinal)) as { value?: Record<string, unknown>; proofs?: unknown } & Record<string, unknown>;
  const v = (j.value ?? j) as {
    stateChannelSnapshots?: Record<string, StateChannelSnap[]>;
    rewards?: unknown;
  };
  // The global snapshot is the SAME Signed[] shape as the metagraph snapshots it anchors —
  // `proofs` are its validator signatures (item 10, 2026-08-06). Count only; the ids are the
  // near-full validator set, so a list adds nothing a count doesn't.
  const signerCount = Array.isArray(j.proofs) ? j.proofs.length : 0;
  const sc = v.stateChannelSnapshots;
  if (!sc) throw new Error("no stateChannelSnapshots");

  // Rewards this snapshot distributes (each reward carries an `amount` in datum). Defensive: only
  // sum if it's an array of {amount}; anything else → 0 (never fabricate). Verified shape:
  // `value.rewards` is an array (type confirmed live), but empty on every sampled mainnet snapshot
  // (2026-07-02) — no reward transactions currently observed, so this consistently resolves to 0.
  const rawRewards = v.rewards;
  const rewardsDatum = Array.isArray(rawRewards)
    ? rawRewards.reduce(
        (s: number, r) => s + (typeof (r as { amount?: number })?.amount === "number" ? (r as { amount: number }).amount : 0),
        0,
      )
    : 0;

  let totalFee = 0,
    totalBytes = 0,
    listedFee = 0,
    unlistedFee = 0,
    anchored = 0,
    listedCount = 0,
    unlistedCount = 0;
  const perMeta: Record<string, { count: number; fee: number; bytes: number }> = {};
  const rows: ChannelSnapRow[] = [];
  for (const [addr, snaps] of Object.entries(sc)) {
    const listed = LISTED.has(addr);
    let count = 0,
      fee = 0,
      metaBytes = 0;
    for (const s of snaps) {
      const f = s?.value?.fee ?? 0;
      // Actual serialized size — `content` is the snapshot's content as a byte array, so its
      // length is the real byte count anchored. NOT derived from the fee (the fee is computed by
      // Constellation's own non-trivial fee logic — don't assume a formula).
      const bytes = Array.isArray(s?.value?.content) ? s.value!.content!.length : 0;
      count++;
      fee += f;
      metaBytes += bytes;
      totalBytes += bytes;
      anchored++;
      totalFee += f;
      if (listed) listedFee += f;
      else unlistedFee += f;

      const decoded = await decodeChannelContent(s?.value?.content);
      rows.push({
        metaId: addr,
        ordinal: decoded?.ordinal ?? 0,
        decoded: !!decoded,
        fee: f,
        bytes,
        signers: decoded?.signers ?? [],
        blocks: decoded?.blocks ?? 0,
        hasState: decoded?.hasState ?? false,
        stateBytes: decoded?.stateBytes ?? 0,
        stateProof: decoded?.stateProof ?? null,
        dataBytes: decoded?.dataBytes ?? 0,
      });
    }
    // Per-metagraph size (bytes) alongside count + fee — the snapshot card reveals it as KB on the
    // selected/expanded row. Measured from content byte length, same as the total (not fee-derived).
    perMeta[addr] = { count, fee, bytes: metaBytes };
    if (listed) listedCount += count;
    else unlistedCount += count;
  }
  return {
    ordinal,
    anchored,
    channels: Object.keys(sc).length,
    totalFee,
    totalSizeKB: totalBytes / 1024, // measured from content byte length, not the fee
    rewardsDatum,
    listedFee,
    unlistedFee,
    listedCount,
    unlistedCount,
    signerCount,
    perMeta,
    rows,
  };
}

const cachedExact = (net: NetworkId, ordinal: number) =>
  // The cache key is versioned WITH the payload shape (v3: rows carry dataBytes, 2026-08-13;
  // v2: signerCount) — entries cached under an old key would otherwise miss fields for a day.
  unstable_cache(() => fetchExact(net, ordinal), ["snapshot-exact-v3", net, String(ordinal)], {
    revalidate: 86400, // ordinals are immutable; a day is plenty (success is cached, misses throw)
  })();

export async function GET(req: Request, ctx: { params: Promise<{ ordinal: string }> }) {
  const { ordinal } = await ctx.params;
  const net = netOf(req);
  const n = Number(ordinal);
  if (!Number.isFinite(n) || n < 0) {
    return NextResponse.json({ error: "bad ordinal" }, { status: 400 });
  }
  if (!(await withinServedWindow(net, n))) {
    // Outside the window this app can ever ask about (ordinalWindow.ts) — refuse without
    // touching the upstream, so the route isn't an anonymous walk over ~6.7M ordinals.
    return NextResponse.json({ available: false, ordinal: n }, { status: 404 });
  }
  try {
    const data = await cachedExact(net, n);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=86400, immutable" },
    });
  } catch {
    // Transiently unavailable (not yet finalized / upstream blip) — client keeps the polled floor.
    return NextResponse.json({ available: false, ordinal: n }, { status: 404 });
  }
}

