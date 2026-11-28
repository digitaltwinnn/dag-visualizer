import type { MetaRec } from "./bucketing";
import type { ChainPage } from "./fetchSince";

// The explorer's list reads the samplers share: one JSON GET with a timeout, and one currency
// chain's snapshot list as a `ChainPage`. The trends sampler and the submitters sampler both page
// the same list, so the URL builder lives once, here.

export async function getJson(url: string, ms = 7000): Promise<unknown> {
  const r = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(ms),
    headers: { "User-Agent": "dag-visualizer" },
  });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

/** One page of a currency chain's snapshot records, newest first; `next` is the explorer's cursor. */
export async function pageCurrencySnapshots(be: string, id: string, limit: number, next?: string): Promise<ChainPage<MetaRec>> {
  const j = (await getJson(`${be}/currency/${id}/snapshots?limit=${limit}${next ? `&next=${encodeURIComponent(next)}` : ""}`)) as { data?: MetaRec[]; meta?: { next?: string } };
  return { data: j.data ?? [], next: j.meta?.next } satisfies ChainPage<MetaRec>;
}
