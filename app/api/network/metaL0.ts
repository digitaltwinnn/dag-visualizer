import { unstable_cache } from "next/cache";
import { NETWORKS, type NetworkId } from "@/src/engine/config";

// A METAGRAPH'S OWN L0 — the reads of a chain's snapshots straight from its L0 (`urls.l0` from the
// directory, as metagraphs/live.ts reads it), for the blocks route
// (`[address]/snapshots/[ordinal]/blocks`). Its L0 URL is cached 5 minutes; nothing else here is
// cached, so the caller states its own window.

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
