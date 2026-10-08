import { unstable_cache } from "next/cache";
import { NETWORKS, type NetworkId } from "@/src/engine/config";
import { untrackedIds } from "@/src/net/lineage";

// THE UNLISTED CHAINS, BY ADDRESS (2026-10-08): the explorer lists every chain it indexes
// (`/currency`), and the ones the catalog tracks by no address are the unlisted channels. One cached
// read (an hour — a chain appears rarely) serves the list route and the paging route's gate, so the
// anchor log can page an unlisted chain like any network without opening the route to ANY address.
async function fetchUnlisted(net: NetworkId): Promise<string[]> {
  const r = await fetch(`${NETWORKS[net].be}/currency`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`be ${r.status}`);
  const j = (await r.json()) as { data?: { id?: string }[] };
  return untrackedIds(net, (j.data ?? []).map((c) => c.id ?? ""));
}

export const unlistedChains = (net: NetworkId): Promise<string[]> =>
  unstable_cache(() => fetchUnlisted(net), ["unlisted-chains-v1", net], { revalidate: 3600 })();
