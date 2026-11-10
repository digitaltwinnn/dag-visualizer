import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { HOSTS } from "@/src/engine/config";
import { isTracked } from "@/src/net/lineage";
import { unlistedChains } from "../../../../unlistedChains";
import { decodeBlocks, pairHashes, recordBlockHashes } from "../../../../../snapshot/decodeBlocks";
import { cachedL0Url, getJson } from "../../../../metaL0";

// ONE METAGRAPH SNAPSHOT'S BLOCKS, read from the metagraph's own L0 (`urls.l0` from the
// directory, as metagraphs/live.ts reads it) and decoded by the same `decodeBlocks` as the global
// read. Block hashes are the explorer record's, paired by index; where it lists fewer a block keeps
// `hash: ""`. Served for the same addresses the snapshots route serves (catalog + unlisted list).
// The snapshot is immutable, so the answer caches for a day.

// Above the reads' own timeouts in sequence — the L0 URL (6 s), the snapshot (8 s), the explorer's
// block hashes (6 s) — so a slow chain answers the route's own 503, never a platform 504 (review M7).
export const maxDuration = 25;

async function fetchBlocks(address: string, ordinal: number) {
  const l0 = await cachedL0Url(address);
  const snap = (await getJson(`${l0}/snapshots/${ordinal}`, 8000)) as { value?: unknown };
  if (snap.value == null) throw new Error("no value"); // an empty body is a failed read, not "no blocks"
  return { ordinal, ...decodeBlocks(snap.value) };
}

const cachedBlocks = (address: string, ordinal: number) =>
  unstable_cache(() => fetchBlocks(address, ordinal), ["metagraph-snap-blocks-v3", address, String(ordinal)], {
    revalidate: 86400,
  })();

// The hashes are read apart and cached only on success, so a record the indexer has not reached
// yet cannot pin empty hashes for a day inside the decoded answer; it throws, and the answer goes
// out with `hash: ""` (rule 10) until a later read finds the record.
async function fetchHashes(address: string, ordinal: number): Promise<string[]> {
  return recordBlockHashes(((await getJson(`${HOSTS.be}/currency/${address}/snapshots/${ordinal}`, 6000)) as { data?: { blocks?: unknown } }).data);
}

const cachedHashes = (address: string, ordinal: number) =>
  unstable_cache(() => fetchHashes(address, ordinal), ["metagraph-snap-block-hashes-v1", address, String(ordinal)], {
    revalidate: 86400,
  })();

export async function GET(_req: Request, ctx: { params: Promise<{ address: string; ordinal: string }> }) {
  const { address, ordinal: ordStr } = await ctx.params;
  const ordinal = Number(ordStr);
  if (ordStr === "" || !Number.isInteger(ordinal) || ordinal < 0) return NextResponse.json({ error: "bad ordinal" }, { status: 400 });
  if (!isTracked(address) && !(await unlistedChains().catch(() => [] as string[])).includes(address)) {
    return NextResponse.json({ error: "unknown network" }, { status: 404 });
  }
  try {
    const read = await cachedBlocks(address, ordinal);
    const hashes = read.blocks.length ? await cachedHashes(address, ordinal).catch(() => [] as string[]) : [];
    const { blocks, complete } = pairHashes(read.blocks, hashes);
    return NextResponse.json({ ...read, blocks }, {
      // Unnamed blocks (`hash: ""`) get a short edge life so they are asked again soon, not kept a day.
      headers: { "Cache-Control": complete ? "public, max-age=86400, s-maxage=86400, immutable" : "public, max-age=0, s-maxage=30" },
    });
  } catch {
    return NextResponse.json({ error: "upstream unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
