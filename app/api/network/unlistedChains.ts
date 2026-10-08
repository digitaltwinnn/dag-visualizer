import { unstable_cache } from "next/cache";
import { NETWORKS, type NetworkId } from "@/src/engine/config";
import { untrackedIds } from "@/src/net/lineage";
import { fetchChainIds } from "./chainList";

// THE UNLISTED CHAINS, BY ADDRESS (2026-10-08): the explorer lists every chain it indexes
// (`/currency`), and the ones the catalog tracks by no address are the unlisted channels. One cached
// read (an hour — a chain appears rarely) serves the list route and the paging route's gate, so the
// anchor log can page an unlisted chain like any network without opening the route to ANY address.
async function fetchUnlisted(net: NetworkId): Promise<string[]> {
  return untrackedIds(net, await fetchChainIds(NETWORKS[net].be, 4000));
}

export const unlistedChains = (net: NetworkId): Promise<string[]> =>
  unstable_cache(() => fetchUnlisted(net), ["unlisted-chains-v1", net], { revalidate: 3600 })();
