import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import metagraphsBaked from "@/data/metagraphs.json";
import geoBaked from "@/data/geo.json";

// Live server-side port of scripts/bake-metagraphs.py. Next's Node server CAN reach
// the metagraph cluster load balancers (plain HTTP, custom ports, no CORS) that a
// browser can't — which is exactly why this data used to be baked. We fetch the
// directory + each cluster's nodes on demand and geolocate the IPs, cached via ISR.
// On any failure we fall back to the on-disk bake so the globe always has data.

export const runtime = "nodejs";
export const revalidate = 600; // re-fetch at most every 10 minutes
// The live fan-out can run long if a cluster LB is slow; give it headroom over the
// Hobby 10s default (the per-fetch timeout below keeps the realistic case well under).
export const maxDuration = 60;

const API = "https://production.dagexplorer-api.constellationnetwork.net/mainnet";
const GEO_FIELDS = "status,country,countryCode,city,lat,lon,query";
// l0 (consensus/inner) > dl1 > cl1 (outer, usually empty) — primary layer priority.
const LAYERS: Array<[string, string]> = [
  ["l0", "l0"],
  ["dl1", "dl1"],
  ["cl1", "cl1"],
];

interface MetaNode { ip: string; state: string; layer: string; roles: string[]; id: string }
interface Metagraph {
  id: string; name: string; symbol: string; description: string;
  siteUrl: string; iconUrl: string; nodes: MetaNode[];
}
type GeoMap = Record<string, { lat: number; lon: number; city: string; country: string; cc: string }>;

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

// ip-api.com free tier: HTTP only, ~45 req/min per source IP, non-commercial use
// (see API note in CLAUDE.md). We batch 100 IPs/request, so this is ~1 call per
// regeneration — well under the limit. Batches run concurrently.
async function geoBatch(ips: string[]): Promise<GeoMap> {
  const out: GeoMap = {};
  try {
    const r = await fetch(`http://ip-api.com/batch?fields=${GEO_FIELDS}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ips),
    });
    const arr = (await r.json()) as Array<Record<string, string | number>>;
    for (const e of arr) {
      if (e.status === "success")
        out[e.query as string] = {
          lat: e.lat as number, lon: e.lon as number,
          city: (e.city as string) || "", country: (e.country as string) || "",
          cc: (e.countryCode as string) || "",
        };
    }
  } catch {
    /* leave these IPs unlocated; the globe just won't plot them */
  }
  return out;
}

async function geolocate(ips: string[]): Promise<GeoMap> {
  const chunks: string[][] = [];
  for (let i = 0; i < ips.length; i += 100) chunks.push(ips.slice(i, i + 100));
  const maps = await Promise.all(chunks.map(geoBatch));
  return Object.assign({}, ...maps);
}

async function fetchLive(): Promise<{ metagraphs: Metagraph[]; geo: GeoMap }> {
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
      present.forEach(([, layer], i) => {
        for (const n of nodesByLayer[i]) {
          (roles[n.ip] ??= []).push(layer);
          if (!(n.ip in primary)) {
            primary[n.ip] = layer;
            stateOf[n.ip] = n.state;
            idOf[n.ip] = n.id;
            ips.add(n.ip);
          }
        }
      });
      const nodes: MetaNode[] = Object.keys(primary).map((ip) => ({
        ip, state: stateOf[ip], layer: primary[ip], roles: roles[ip], id: idOf[ip],
      }));
      return {
        id, name: m.name || id, symbol: m.symbol || "",
        description: m.description || "", siteUrl: m.siteUrl || "",
        iconUrl: m.iconUrl || "", nodes,
      };
    }),
  );

  const geo = await geolocate([...ips]);
  return { metagraphs: metagraphs.filter((m): m is Metagraph => m !== null), geo };
}

// Bundled bake (data/*.json, imported so it ships in serverless deploys) — the
// resilience fallback when the live fetch fails or comes back empty.
const baked = { metagraphs: metagraphsBaked as unknown as Metagraph[], geo: geoBaked as unknown as GeoMap };

// Cache the live fan-out across requests/instances for `revalidate` seconds, so the
// expensive dagexplorer + cluster + ip-api calls run at most ~once per 10 min — not on
// every visitor's mount (inner fetches use `no-store`, which otherwise makes the route
// dynamic and re-runs the whole fan-out per request). Throwing on empty keeps a network
// blip from being cached: GET then serves the bake and the next request retries.
const getLive = unstable_cache(
  async () => {
    const live = await fetchLive();
    if (!live.metagraphs.length) throw new Error("empty live result");
    return live;
  },
  ["metagraphs-live"],
  { revalidate },
);

export async function GET() {
  try {
    return NextResponse.json(await getLive());
  } catch {
    return NextResponse.json(baked); // live fetch failed/empty — serve the bake
  }
}
