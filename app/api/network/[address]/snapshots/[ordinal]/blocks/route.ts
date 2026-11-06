import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { NETWORKS, type NetworkId } from "@/src/engine/config";
import { isTracked } from "@/src/net/lineage";
import { netOf } from "@/src/net/request";
import { unlistedChains } from "../../../../unlistedChains";
import { decodeBlocks, pairHashes, recordBlockHashes } from "../../../../../snapshot/decodeBlocks";
import { cachedL0Url, getJson, latestMetaSnapshot } from "../../../../metaL0";

// ONE METAGRAPH SNAPSHOT'S BLOCKS AND TIPS, read from the metagraph's own L0 (`urls.l0` from the
// directory, as metagraphs/live.ts reads it) and decoded by the same `decodeBlocks` as the global
// read. Block hashes are the explorer record's, paired by index; where it lists fewer a block keeps
// `hash: ""`. Served for the same addresses the snapshots route serves (catalog + unlisted list).
// The snapshot is immutable, so the answer caches for a day.
//
// `latest` in place of the ordinal is the chain's FRONTIER (the Blocks register's open tips): its
// newest snapshot from the L0's `/snapshots/latest`, with the explorer record's block hashes and its
// timestamp (`ts`) where the indexer has reached it. It changes every snapshot, so it holds 25 s at
// the edge and is never immutable; a failed read is 503 `no-store` like the rest.

export const maxDuration = 15;

async function fetchBlocks(net: NetworkId, address: string, ordinal: number) {
  const l0 = await cachedL0Url(net, address);
  const snap = (await getJson(`${l0}/snapshots/${ordinal}`, 8000)) as { value?: unknown };
  if (snap.value == null) throw new Error("no value"); // an empty body is a failed read, not "no blocks"
  return { ordinal, ...decodeBlocks(snap.value) };
}

const cachedBlocks = (net: NetworkId, address: string, ordinal: number) =>
  unstable_cache(() => fetchBlocks(net, address, ordinal), ["metagraph-snap-blocks-v1", net, address, String(ordinal)], {
    revalidate: 86400,
  })();

// The hashes are read apart and cached only on success, so a record the indexer has not reached
// yet cannot pin empty hashes for a day inside the decoded answer; it throws, and the answer goes
// out with `hash: ""` (rule 10) until a later read finds the record.
async function fetchHashes(net: NetworkId, address: string, ordinal: number): Promise<string[]> {
  return recordBlockHashes(((await getJson(`${NETWORKS[net].be}/currency/${address}/snapshots/${ordinal}`, 6000)) as { data?: { blocks?: unknown } }).data);
}

const cachedHashes = (net: NetworkId, address: string, ordinal: number) =>
  unstable_cache(() => fetchHashes(net, address, ordinal), ["metagraph-snap-block-hashes-v1", net, address, String(ordinal)], {
    revalidate: 86400,
  })();

export async function GET(req: Request, ctx: { params: Promise<{ address: string; ordinal: string }> }) {
  const { address, ordinal: ordStr } = await ctx.params;
  const net = netOf(req);
  const latest = ordStr === "latest";
  const ordinal = Number(ordStr);
  if (!latest && (!Number.isInteger(ordinal) || ordinal < 0)) return NextResponse.json({ error: "bad ordinal" }, { status: 400 });
  if (!isTracked(net, address) && !(await unlistedChains(net).catch(() => [] as string[])).includes(address)) {
    return NextResponse.json({ error: "unknown network" }, { status: 404 });
  }
  if (latest) return latestAnswer(net, address);
  try {
    const read = await cachedBlocks(net, address, ordinal);
    const hashes = read.blocks.length ? await cachedHashes(net, address, ordinal).catch(() => [] as string[]) : [];
    const { blocks, complete } = pairHashes(read.blocks, hashes);
    return NextResponse.json({ ...read, blocks }, {
      // Unnamed blocks (`hash: ""`) get a short edge life so they are asked again soon, not kept a day.
      headers: { "Cache-Control": complete ? "public, max-age=86400, s-maxage=86400, immutable" : "public, max-age=0, s-maxage=30" },
    });
  } catch {
    return NextResponse.json({ error: "upstream unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

/** The explorer record of one snapshot: its block hashes and its timestamp. Not cached: the newest
 *  record may not be indexed yet, and a miss answers with neither (the read still stands). */
async function fetchRecord(net: NetworkId, address: string, ordinal: number): Promise<{ hashes: string[]; ts: string | null }> {
  const data = ((await getJson(`${NETWORKS[net].be}/currency/${address}/snapshots/${ordinal}`, 6000)) as { data?: { blocks?: unknown; timestamp?: unknown } }).data;
  return { hashes: recordBlockHashes(data), ts: typeof data?.timestamp === "string" ? data.timestamp : null };
}

async function latestAnswer(net: NetworkId, address: string) {
  try {
    const read = await latestMetaSnapshot(net, address);
    const rec = await fetchRecord(net, address, read.ordinal).catch(() => ({ hashes: [] as string[], ts: null }));
    const { blocks } = pairHashes(read.blocks, rec.hashes);
    return NextResponse.json({ ...read, blocks, ...(rec.ts ? { ts: rec.ts } : {}) }, { headers: { "Cache-Control": "public, s-maxage=25" } });
  } catch {
    return NextResponse.json({ error: "upstream unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
