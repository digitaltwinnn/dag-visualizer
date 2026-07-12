import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { L0_CLUSTER, L1_CLUSTER } from "@/src/engine/config";
import { geolocate } from "@/src/server/ipGeolocate";
import type { GeoMap } from "@/src/data/types";

// LIVE validator IP→geo map (user decision, 2026-07-10: the pre-baked data/geo.json seed
// was removed — only real API data, no stale snapshots). Server-side: fetch both validator
// clusters, geolocate every IP via the shared ip-api batch helper, and serve the same
// {ip: geo} shape the old seed had — so the globe still plots instantly from ONE request.
// Cached for an hour (locations are stable; NEW nodes inside the window are covered by the
// client's runtime resolver, geoResolve.resolveMissing). Throwing on an empty result keeps
// a blip from being cached: the route answers 503 and the next request retries — the
// client tolerates it (loadGeoCache checks res.ok and falls back to localStorage + the
// runtime resolver).
export const runtime = "nodejs";
export const revalidate = 3600;
export const maxDuration = 30;

async function clusterIps(url: string): Promise<string[]> {
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    const arr = (await r.json()) as Array<{ ip?: string }>;
    return arr.map((n) => n.ip).filter((ip): ip is string => !!ip);
  } catch {
    return [];
  }
}

const getLiveGeo = unstable_cache(
  async (): Promise<GeoMap> => {
    const [l0, l1] = await Promise.all([clusterIps(L0_CLUSTER), clusterIps(L1_CLUSTER)]);
    const ips = [...new Set([...l0, ...l1])];
    if (!ips.length) throw new Error("no validator ips");
    const map = await geolocate(ips);
    if (!Object.keys(map).length) throw new Error("geolocation empty");
    return map;
  },
  ["validator-geo-live-v2"], // v2: +isp/asn fields (a key bump busts the pre-provider cache)
  { revalidate },
);

export async function GET() {
  try {
    return NextResponse.json(await getLiveGeo());
  } catch {
    return NextResponse.json({ error: "live validator geolocation failed" }, { status: 503 });
  }
}
