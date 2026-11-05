import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { NETWORKS, type NetworkId } from "@/src/engine/config";
import { isTracked } from "@/src/net/lineage";
import { netOf } from "@/src/net/request";
import { unlistedChains } from "../../../../unlistedChains";
import { decodeBlocks } from "../../../../../snapshot/decodeBlocks";

// ONE METAGRAPH SNAPSHOT'S BLOCKS AND TIPS, read from the metagraph's own L0 (`urls.l0` from the
// directory, as metagraphs/live.ts reads it) and decoded by the same `decodeBlocks` as the global
// read. Block hashes are the explorer record's, paired by index; where it lists fewer a block keeps
// `hash: ""`. Served for the same addresses the snapshots route serves (catalog + unlisted list).
// The snapshot is immutable, so the answer caches for a day.

export const maxDuration = 15;

async function getJson(url: string, ms: number): Promise<unknown> {
  const r = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

async function fetchL0Url(net: NetworkId, address: string): Promise<string> {
  const j = (await getJson(`${NETWORKS[net].directory}/metagraphs/${address}?v=v2`, 6000)) as { data?: { urls?: { l0?: string } } };
  const l0 = j.data?.urls?.l0;
  if (!l0) throw new Error("no l0 url");
  return l0.replace(/\/$/, "");
}

const cachedL0Url = (net: NetworkId, address: string) =>
  unstable_cache(() => fetchL0Url(net, address), ["metagraph-l0-url-v1", net, address], { revalidate: 300 })();

async function fetchBlocks(net: NetworkId, address: string, ordinal: number) {
  const l0 = await cachedL0Url(net, address);
  const snap = (await getJson(`${l0}/snapshots/${ordinal}`, 8000)) as { value?: unknown };
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
  const d = ((await getJson(`${NETWORKS[net].be}/currency/${address}/snapshots/${ordinal}`, 6000)) as { data?: { blocks?: unknown } }).data;
  if (!d || !Array.isArray(d.blocks)) throw new Error("no record");
  return d.blocks.filter((h): h is string => typeof h === "string");
}

const cachedHashes = (net: NetworkId, address: string, ordinal: number) =>
  unstable_cache(() => fetchHashes(net, address, ordinal), ["metagraph-snap-block-hashes-v1", net, address, String(ordinal)], {
    revalidate: 86400,
  })();

export async function GET(req: Request, ctx: { params: Promise<{ address: string; ordinal: string }> }) {
  const { address, ordinal: ordStr } = await ctx.params;
  const net = netOf(req);
  const ordinal = Number(ordStr);
  if (!Number.isInteger(ordinal) || ordinal < 0) return NextResponse.json({ error: "bad ordinal" }, { status: 400 });
  if (!isTracked(net, address) && !(await unlistedChains(net).catch(() => [] as string[])).includes(address)) {
    return NextResponse.json({ error: "unknown network" }, { status: 404 });
  }
  try {
    const read = await cachedBlocks(net, address, ordinal);
    const hashes = read.blocks.length ? await cachedHashes(net, address, ordinal).catch(() => [] as string[]) : [];
    const body = { ...read, blocks: read.blocks.map((b, i) => ({ ...b, hash: hashes[i] ?? "" })) };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable" },
    });
  } catch {
    return NextResponse.json({ error: "upstream unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
