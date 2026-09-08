import { unstable_cache } from "next/cache";
import { NETWORKS, type NetworkId } from "@/src/engine/config";
import { geolocate } from "@/src/server/ipGeolocate";
import type { GeoMap } from "@/src/data/types";

const revalidate = 300; // re-fetch at most every 5 minutes (was 10 — user, 2026-08-14:
// a DOR restart left its signers reading "unknown node" for most of a cycle; halving the cadence
// halves that stale window, and the geolocation batch rate stays well inside ip-api's free tier)

// l0 (consensus/inner) > dl1 > cl1 (outer, usually empty) — primary layer priority.
const LAYERS: Array<[string, string]> = [
  ["l0", "l0"],
  ["dl1", "dl1"],
  ["cl1", "cl1"],
];

export interface MetaNode { ip: string; state: string; layer: string; roles: string[]; id: string; ids: string[] }
export interface Metagraph {
  id: string; name: string; symbol: string; description: string;
  siteUrl: string; iconUrl: string; nodes: MetaNode[];
  hue?: { deg: number; oklch: string; hex: string };
}


async function getJson(url: string, ms = 5000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "dag-visualizer" },
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

async function clusterNodes(base: string): Promise<Array<{ ip: string; state: string; id: string }>> {
  try {
    const nodes = (await getJson(base.replace(/\/$/, "") + "/cluster/info")) as unknown;
    if (!Array.isArray(nodes)) return [];
    return nodes
      .filter((n) => n && (n as { ip?: string }).ip)
      .map((n) => ({
        ip: (n as { ip: string }).ip,
        state: (n as { state?: string }).state ?? "Unknown",
        id: (n as { id?: string }).id ?? "",
      }));
  } catch {
    return [];
  }
}

async function fetchLive(net: NetworkId): Promise<{ metagraphs: Metagraph[]; geo: GeoMap; builtAt: number }> {
  const API = NETWORKS[net].directory;
  const list = ((await getJson(`${API}/metagraphs?limit=100`)) as { data?: unknown[] }).data ?? [];
  const ips = new Set<string>();

  const metagraphs = await Promise.all(
    (list as Array<Record<string, string>>).map(async (m): Promise<Metagraph | null> => {
      const id = m.id;
      if (!id) return null;
      let urls: Record<string, string> = {};
      try {
        urls = (((await getJson(`${API}/metagraphs/${id}?v=v2`)) as { data?: { urls?: Record<string, string> } }).data?.urls) ?? {};
      } catch {
        /* no urls → no nodes */
      }
      // Fetch this metagraph's present layers concurrently (was a sequential await
      // loop — one slow cluster LB serially stacked up to 3×timeout). `present` keeps
      // LAYERS order, so the primary-layer priority (l0 > dl1 > cl1) is unchanged.
      const present = LAYERS.filter(([key]) => urls[key]);
      const nodesByLayer = await Promise.all(present.map(([key]) => clusterNodes(urls[key])));
      const primary: Record<string, string> = {};
      const roles: Record<string, string[]> = {};
      const stateOf: Record<string, string> = {};
      const idOf: Record<string, string> = {};
      // ⚠️ A machine's peer id is PER LAYER, not per machine (verified live 2026-08-09: DOR's
      // 35.81.47.27 is `f2724252…` in its l0 cluster and `6270ff66…` in its dl1 cluster — each
      // layer process runs its own keypair). So a hybrid node has SEVERAL ids and only one of
      // them is the primary layer's. Keeping just `idOf` made every data-block signer that
      // happens to be a hybrid machine unresolvable ("not in live set") even though the machine
      // was right there in the list — the block proofs are dL1 ids, the snapshot proofs l0 ones.
      // Collected in LAYERS order, so `ids[0] === id`.
      const idsOf: Record<string, string[]> = {};
      present.forEach(([, layer], i) => {
        for (const n of nodesByLayer[i]) {
          (roles[n.ip] ??= []).push(layer);
          const ids = (idsOf[n.ip] ??= []);
          if (n.id && !ids.includes(n.id)) ids.push(n.id);
          if (!(n.ip in primary)) {
            primary[n.ip] = layer;
            stateOf[n.ip] = n.state;
            idOf[n.ip] = n.id;
            ips.add(n.ip);
          }
        }
      });
      // CANONICAL ORDER — cluster/info returns peers in an unstable order, and the client scene
      // places nodes by list index (ring slots, honeycomb stacks): a reshuffled payload after a
      // revalidate would visibly snap nodes to new positions. Object.keys' insertion order is the
      // fetch order, so sort explicitly.
      const nodes: MetaNode[] = Object.keys(primary)
        .sort()
        .map((ip) => ({
          ip, state: stateOf[ip], layer: primary[ip], roles: roles[ip], id: idOf[ip],
          ids: idsOf[ip] ?? [],
        }));
      return {
        id, name: m.name || id, symbol: m.symbol || "",
        description: m.description || "", siteUrl: m.siteUrl || "",
        iconUrl: m.iconUrl || "", nodes,
      };
    }),
  );

  const geo = await geolocate([...ips]);
  // Stamped so the CLIENT can tell a fresh payload from a frozen cache — see the ageMs note on GET.
  return { metagraphs: metagraphs.filter((m): m is Metagraph => m !== null), geo, builtAt: Date.now() };
}

// Cache the live fan-out across requests/instances for `revalidate` seconds, so the
// expensive dagexplorer + cluster + ip-api calls run at most ~once per 10 min — not on
// every visitor's mount (inner fetches use `no-store`, which otherwise makes the route
// dynamic and re-runs the whole fan-out per request). Throwing on empty keeps a network
// blip from being cached: GET answers 503 and the next request retries.
export const getLive = (net: NetworkId) =>
  unstable_cache(
  async () => {
    const live = await fetchLive(net);
    if (!live.metagraphs.length) throw new Error("empty live result");
    return live;
  },
  ["metagraphs-live-v4", net], // v4: +builtAt (v3 was +per-layer node `ids`, v2 +isp/asn geo)
  { revalidate },
  )();
