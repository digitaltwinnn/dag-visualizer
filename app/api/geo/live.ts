import { unstable_cache } from "next/cache";
import { HOSTS } from "@/src/engine/config";
import { geolocate } from "@/src/server/ipGeolocate";
import type { GeoMap } from "@/src/data/types";

// Cached for an hour (locations are stable; NEW nodes inside the window are covered by the
// client's runtime resolver, geoResolve.resolveMissing). Throwing on an empty result keeps
// a blip from being cached: the route answers 503 and the next request retries — the
// client tolerates it (loadGeoCache checks res.ok and falls back to localStorage + the
// runtime resolver).
const revalidate = 3600;

async function clusterIps(url: string): Promise<string[]> {
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    const arr = (await r.json()) as Array<{ ip?: string }>;
    return arr.map((n) => n.ip).filter((ip): ip is string => !!ip);
  } catch {
    return [];
  }
}

// The cached fetch (the repo's inline unstable_cache factory idiom — global/at).
export const getLiveGeo = () =>
  unstable_cache(
    async (): Promise<GeoMap> => {
      const [l0, l1] = await Promise.all([
        clusterIps(HOSTS.l0 + "/cluster/info"),
        clusterIps(HOSTS.l1 + "/cluster/info"),
      ]);
      const ips = [...new Set([...l0, ...l1])];
      if (!ips.length) throw new Error("no validator ips");
      const map = await geolocate(ips);
      if (!Object.keys(map).length) throw new Error("geolocation empty");
      return map;
    },
    ["validator-geo-live-v2"], // v2: +isp/asn fields (a key bump busts the pre-provider cache)
    { revalidate },
  )();
