import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { NETWORKS, type NetworkId } from "@/src/engine/config";
import { lineageIds } from "@/src/net/lineage";
import { netOf } from "@/src/net/request";
import type { SnapshotExact, ChannelSnapRow } from "@/src/data/types";
import { decodeBlocks, pairHashes, recordBlockHashes } from "../decodeBlocks";
import { dataUpdatesOf } from "@/src/data/ledgerMeasure";
import { exactRowOf, type StateChannelSnap } from "../exactRow";
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

async function fetchExact(net: NetworkId, ordinal: number): Promise<SnapshotExact> {
  const LISTED = new Set(lineageIds(net));
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
  const perMeta: SnapshotExact["perMeta"] = {};
  const rows: ChannelSnapRow[] = [];
  for (const [addr, snaps] of Object.entries(sc)) {
    const listed = LISTED.has(addr);
    let count = 0,
      fee = 0,
      metaBytes = 0;
    const own: ChannelSnapRow[] = [];
    for (const s of snaps) {
      // The row (`exactRow.ts`): the fee, the byte length anchored, the decoded facts and the data
      // updates its data blocks carry.
      const row = await exactRowOf(addr, s);
      rows.push(row);
      own.push(row);
      count++;
      fee += row.fee;
      metaBytes += row.bytes;
      totalBytes += row.bytes;
      anchored++;
      totalFee += row.fee;
      if (listed) listedFee += row.fee;
      else unlistedFee += row.fee;
    }
    // Per-metagraph size (bytes) alongside count + fee — the snapshot card reveals it as KB on the
    // selected/expanded row. Measured from content byte length, same as the total (not fee-derived).
    // `dataTxCount`: its snapshots' data updates summed — absent (unknown, never zero) when any of
    // them could not be decoded (`dataUpdatesOf`).
    const dataTx = dataUpdatesOf(own);
    perMeta[addr] = { count, fee, bytes: metaBytes, ...(dataTx != null ? { dataTxCount: dataTx } : {}) };
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
    ...decodeBlocks(v),
  };
}

// The block HASHES are the explorer's, not the snapshot's (a hash is not a field of what it
// hashes). Read apart from the exact fetch and cached only on success: a tick the indexer has not
// reached yet must not pin empty hashes for a day inside the exact answer — it throws here, and the
// answer goes out with `hash: ""` (rule 10) until a later read finds the record.
async function fetchBlockHashes(net: NetworkId, ordinal: number): Promise<string[]> {
  const r = await fetch(`${NETWORKS[net].be}/global-snapshots/${ordinal}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  if (!r.ok) throw new Error(`be ${r.status}`);
  return recordBlockHashes(((await r.json()) as { data?: { blocks?: unknown } }).data);
}

const cachedBlockHashes = (net: NetworkId, ordinal: number) =>
  unstable_cache(() => fetchBlockHashes(net, ordinal), ["snapshot-block-hashes-v1", net, String(ordinal)], {
    revalidate: 86400,
  })();

const cachedExact = (net: NetworkId, ordinal: number) =>
  // The cache key is versioned WITH the payload shape (v7: rows and perMeta carry the data updates,
  // D6 2026-11-07; v6: no tips, 2026-11-07; v5: each block's
  // transfers; v4: blocks + tips; v3: rows carry dataBytes, 2026-08-13; v2: signerCount) — entries
  // cached under an old key would otherwise carry a shape the client no longer reads for a day.
  unstable_cache(() => fetchExact(net, ordinal), ["snapshot-exact-v8", net, String(ordinal)], {
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
    let complete = true;
    if (data.blocks?.length) {
      const hashes = await cachedBlockHashes(net, n).catch(() => [] as string[]);
      ({ blocks: data.blocks, complete } = pairHashes(data.blocks, hashes));
    }
    return NextResponse.json(data, {
      // `s-maxage` too (2026-10-18): the live tip and the cold-load backfill ask every visitor for
      // the SAME ordinals, and with `max-age` alone only each browser kept them — the CDN missed
      // 96% of the week's 5,233 calls and every one reached the load balancer. An ordinal is
      // immutable, so the edge may keep it as long as the browser does; a 404 carries no header.
      // Blocks the explorer has not named yet carry `hash: ""`: a short edge life, so the CDN and the
      // browser ask again soon rather than keeping the hashless answer for a day.
      headers: { "Cache-Control": complete ? "public, max-age=86400, s-maxage=86400, immutable" : "public, max-age=0, s-maxage=30" },
    });
  } catch {
    // Transiently unavailable (not yet finalized / upstream blip) — client keeps the polled floor.
    return NextResponse.json({ available: false, ordinal: n }, { status: 404 });
  }
}

