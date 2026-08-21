import { CATALOG, NETWORKS, type MetaConfig, type NetworkDef, type NetworkId } from "@/src/engine/config";
import { parseNet } from "./parse";

// The CLIENT network resolver — evaluated ONCE at first import, then frozen for the page's
// lifetime. The network is a page parameter, not state (the store carries no key for it);
// a switch is a hard reload through the TopBar's NetworkSwitch anchors. Under Node (vitest,
// SSR) there is no `location`, so this resolves mainnet — which keeps every module-scope
// lane derivation and the whole existing test suite identical to the single-network app.
export const NET: NetworkId = parseNet(typeof location === "undefined" ? "" : location.search);
export const NET_DEF: NetworkDef = NETWORKS[NET];
export const METAGRAPHS: MetaConfig[] = CATALOG[NET];

// Every own-server URL goes through here — src/net/netUrlBoundary.test.ts is the fence.
// On mainnet it appends NOTHING, so mainnet URLs stay byte-identical and existing CDN and
// browser cache keys survive. The pure core is split out so the dev-network behaviour is
// testable under Node, where NET is always mainnet.
export function netUrlFor(net: NetworkId, path: string): string {
  if (net === "mainnet") return path;
  return path + (path.includes("?") ? "&" : "?") + "net=" + net;
}
export function netUrl(path: string): string {
  return netUrlFor(NET, path);
}
