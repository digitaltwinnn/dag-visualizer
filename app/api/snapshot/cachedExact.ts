import { unstable_cache } from "next/cache";
import { NETWORKS, type NetworkId } from "@/src/engine/config";
import { lineageIds } from "@/src/net/lineage";
import type { SnapshotExact, ChannelSnapRow } from "@/src/data/types";
import { decodeBlocks, recordBlockHashes } from "./decodeBlocks";
import { dataUpdatesOf } from "@/src/data/ledgerMeasure";
import { exactRowOf, type StateChannelSnap } from "./exactRow";
import { fetchGlobalJson } from "./fetchGlobal";

// THE EXACT READ, as a module (2026-11-07): the per-ordinal route's fetcher and its day-long cache,
// importable by the server's other readers — the Data blocks note (`app/api/notes/dataWindow.ts`)
// reads the newest window of ticks through the SAME cache the route fills, so a visitor's reads and
// the note's are one read per ordinal. The route file stays route exports only.

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

export const cachedBlockHashes = (net: NetworkId, ordinal: number) =>
  unstable_cache(() => fetchBlockHashes(net, ordinal), ["snapshot-block-hashes-v1", net, String(ordinal)], {
    revalidate: 86400,
  })();

export const cachedExact = (net: NetworkId, ordinal: number) =>
  // The cache key is versioned WITH the payload shape (v11: an unreadable data block is `unread` and
  // its snapshot's data updates unknown, review M3 2026-11-09; v10: one summary per data block; v9:
  // the state's shape and the dL1 signers; v8: an undecodable row's data updates unknown rather than
  // 0; v7: rows and perMeta carry the data updates,
  // D6 2026-11-07; v6: no tips, 2026-11-07; v5: each block's
  // transfers; v4: blocks + tips; v3: rows carry dataBytes, 2026-08-13; v2: signerCount) — entries
  // cached under an old key would otherwise carry a shape the client no longer reads for a day.
  unstable_cache(() => fetchExact(net, ordinal), ["snapshot-exact-v11", net, String(ordinal)], {
    revalidate: 86400, // ordinals are immutable; a day is plenty (success is cached, misses throw)
  })();

