import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Live server-side port of scripts/bake-metagraphs.py. Next's Node server CAN reach
// the metagraph cluster load balancers (plain HTTP, custom ports, no CORS) that a
// browser can't — which is exactly why this data used to be baked. We fetch the
// directory + each cluster's nodes on demand and geolocate the IPs, cached via ISR.
// On any failure we fall back to the on-disk bake so the globe always has data.

export const runtime = "nodejs";
export const revalidate = 600; // re-fetch at most every 10 minutes (ISR)

const API = "https://production.dagexplorer-api.constellationnetwork.net/mainnet";
const GEO_FIELDS = "status,country,countryCode,city,lat,lon,query";
// l0 (consensus/inner) > dl1 > cl1 (outer, usually empty) — primary layer priority.
const LAYERS: Array<[string, string]> = [
  ["l0", "l0"],
  ["dl1", "dl1"],
  ["cl1", "cl1"],
];

interface MetaNode { ip: string; state: string; layer: string; roles: string[] }
interface Metagraph {
  id: string; name: string; symbol: string; description: string;
  siteUrl: string; iconUrl: string; nodes: MetaNode[];
}
type GeoMap = Record<string, { lat: number; lon: number; city: string; country: string; cc: string }>;

async function getJson(url: string, ms = 12000): Promise<unknown> {
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

async function clusterNodes(base: string): Promise<Array<{ ip: string; state: string }>> {
  try {
    const nodes = (await getJson(base.replace(/\/$/, "") + "/cluster/info")) as unknown;
    if (!Array.isArray(nodes)) return [];
    return nodes
      .filter((n) => n && (n as { ip?: string }).ip)
      .map((n) => ({ ip: (n as { ip: string }).ip, state: (n as { state?: string }).state ?? "Unknown" }));
  } catch {
    return [];
  }
}

async function geolocate(ips: string[]): Promise<GeoMap> {
  const out: GeoMap = {};
  for (let i = 0; i < ips.length; i += 100) {
    const chunk = ips.slice(i, i + 100);
    try {
      const r = await fetch(`http://ip-api.com/batch?fields=${GEO_FIELDS}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chunk),
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
  }
  return out;
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
      const primary: Record<string, string> = {};
      const roles: Record<string, string[]> = {};
      const stateOf: Record<string, string> = {};
      for (const [key, layer] of LAYERS) {
        if (!urls[key]) continue;
        for (const n of await clusterNodes(urls[key])) {
          (roles[n.ip] ??= []).push(layer);
          if (!(n.ip in primary)) {
            primary[n.ip] = layer;
            stateOf[n.ip] = n.state;
            ips.add(n.ip);
          }
        }
      }
      const nodes: MetaNode[] = Object.keys(primary).map((ip) => ({
        ip, state: stateOf[ip], layer: primary[ip], roles: roles[ip],
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

// On-disk bake (data/*.json) — resilience fallback when the live fetch fails.
async function fetchBaked(): Promise<{ metagraphs: Metagraph[]; geo: GeoMap }> {
  const dir = path.join(process.cwd(), "data");
  const [metagraphs, geo] = await Promise.all([
    readFile(path.join(dir, "metagraphs.json"), "utf8").then(JSON.parse),
    readFile(path.join(dir, "geo.json"), "utf8").then(JSON.parse).catch(() => ({})),
  ]);
  return { metagraphs, geo };
}

export async function GET() {
  try {
    const live = await fetchLive();
    // If the live directory came back empty (network blip), prefer the bake.
    if (live.metagraphs.length) return NextResponse.json(live);
  } catch {
    /* fall through to baked */
  }
  try {
    return NextResponse.json(await fetchBaked());
  } catch {
    return NextResponse.json({ metagraphs: [], geo: {} });
  }
}
