import { NextResponse } from "next/server";
import { netOf } from "@/src/net/request";
import { getLiveGeo } from "./live";

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

export async function GET(req: Request) {
  // Reading ?net= makes the route dynamic (ƒ) — the CDN caches it per URL via s-maxage
  // instead, so mainnet's hit behaviour is preserved (multi-network design §3).
  try {
    return NextResponse.json(await getLiveGeo(netOf(req)), {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
    });
  } catch {
    return NextResponse.json({ error: "live validator geolocation failed" }, { status: 503 });
  }
}
