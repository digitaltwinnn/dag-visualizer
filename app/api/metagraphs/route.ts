import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { assignPalette } from "@/src/palette/palette";
import { identityPins } from "@/src/palette/identity";
import { geolocate } from "@/src/server/ipGeolocate";
import type { GeoMap } from "@/src/data/types";

// Live server-side metagraph directory + cluster fetch. Next's Node server CAN reach
// the metagraph cluster load balancers (plain HTTP, custom ports, no CORS) that a
// browser can't. We fetch the directory + each cluster's nodes on demand and geolocate
// the IPs, cached via ISR. On failure the route answers 503 — NO pre-baked fallback
// (user decision, 2026-07-10: stale baked data was worse than an honest error; the
// client keeps its last good pull and simply retries on its next 10-min cycle).

export const runtime = "nodejs";
export const revalidate = 600; // re-fetch at most every 10 minutes
// The live fan-out can run long if a cluster LB is slow; give it headroom over the
// Hobby 10s default (the per-fetch timeout below keeps the realistic case well under).
export const maxDuration = 60;

const API = "https://production.dagexplorer-api.constellationnetwork.net/mainnet";
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
      // CANONICAL ORDER — cluster/info returns peers in an unstable order, and the client scene
      // places nodes by list index (ring slots, honeycomb stacks): a reshuffled payload after a
      // revalidate would visibly snap nodes to new positions. Object.keys' insertion order is the
      // fetch order, so sort explicitly.
      const nodes: MetaNode[] = Object.keys(primary)
        .sort()
        .map((ip) => ({
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

// Cache the live fan-out across requests/instances for `revalidate` seconds, so the
// expensive dagexplorer + cluster + ip-api calls run at most ~once per 10 min — not on
// every visitor's mount (inner fetches use `no-store`, which otherwise makes the route
// dynamic and re-runs the whole fan-out per request). Throwing on empty keeps a network
// blip from being cached: GET answers 503 and the next request retries.
const getLive = unstable_cache(
  async () => {
    const live = await fetchLive();
    if (!live.metagraphs.length) throw new Error("empty live result");
    return live;
  },
  ["metagraphs-live-v2"], // v2: +isp/asn geo fields (key bump busts the pre-provider cache)
  { revalidate },
);

function withHues(list: Metagraph[]): Metagraph[] {
  const palette = assignPalette(list.map((m) => m.id), identityPins());
  return list.map((m) => {
    const e = palette.get(m.id);
    return e ? { ...m, hue: { deg: e.hueDeg, oklch: e.oklch, hex: e.hex } } : m;
  });
}

export async function GET() {
  try {
    const live = await getLive();
    return NextResponse.json({ ...live, metagraphs: withHues(live.metagraphs) });
  } catch {
    // No baked fallback (user decision): an honest 503 — the client keeps its last good
    // pull (Engine.refreshMeta only rebuilds on a changed OK response) and retries later.
    return NextResponse.json({ error: "live metagraph fetch failed" }, { status: 503 });
  }
}
