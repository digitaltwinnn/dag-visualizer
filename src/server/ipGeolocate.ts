import type { GeoMap } from "@/src/data/types";

// Server-side IP→geo resolution, shared by /api/geo (validators) and /api/metagraphs
// (metagraph nodes). ip-api.com free tier: HTTP only, ~45 req/min per source IP,
// non-commercial use (see the API note in CLAUDE.md). We batch 100 IPs/request and both
// routes run behind unstable_cache, so this is a handful of calls per revalidation —
// well under the limit. Batches run concurrently. Failures leave IPs unlocated (the
// globe simply won't plot them; the client-side resolver may still fill them later).
const GEO_FIELDS = "status,country,countryCode,city,lat,lon,query";

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
    /* leave these IPs unlocated */
  }
  return out;
}

export async function geolocate(ips: string[]): Promise<GeoMap> {
  const chunks: string[][] = [];
  for (let i = 0; i < ips.length; i += 100) chunks.push(ips.slice(i, i + 100));
  const maps = await Promise.all(chunks.map(geoBatch));
  return Object.assign({}, ...maps);
}
