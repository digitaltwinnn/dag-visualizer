import { unstable_cache } from "next/cache";
import { NETWORKS, type NetworkId } from "@/src/engine/config";
import type { BlockRead, TipRead } from "@/src/engine/domain/blockBraid";
import { decodeBlocks } from "../snapshot/decodeBlocks";

// A METAGRAPH'S OWN L0 — the reads of a chain's snapshots straight from its L0 (`urls.l0` from the
// directory, as metagraphs/live.ts reads it), shared by the blocks route
// (`[address]/snapshots/[ordinal]/blocks`) and the block DAG's note (`notes/blockFrontier.ts`). Its
// L0 URL is cached 5 minutes; nothing else here is cached, so each caller states its own window.

export async function getJson(url: string, ms: number): Promise<unknown> {
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

export const cachedL0Url = (net: NetworkId, address: string) =>
  unstable_cache(() => fetchL0Url(net, address), ["metagraph-l0-url-v1", net, address], { revalidate: 300 })();

/** A CHAIN'S FRONTIER: its NEWEST snapshot from its L0 (`/snapshots/latest`), decoded — the ordinal
 *  it is at and the tips it holds open. It changes every snapshot, so it is never cached here. An
 *  empty body or an ordinal it does not carry is a failed read, never "no tips" (rule 10). */
export async function latestMetaSnapshot(net: NetworkId, address: string): Promise<{ ordinal: number; blocks: BlockRead[]; tips: TipRead | null }> {
  const l0 = await cachedL0Url(net, address);
  const snap = (await getJson(`${l0}/snapshots/latest`, 8000)) as { value?: { ordinal?: unknown } };
  const ordinal = snap.value?.ordinal;
  if (snap.value == null || typeof ordinal !== "number" || !Number.isInteger(ordinal)) throw new Error("no value");
  return { ordinal, ...decodeBlocks(snap.value) };
}
