import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Serves the baked validator IP→geo seed (data/geo.json) so the globe plots instantly
// on load; the client still resolves any missing/new validator IPs at runtime
// (js/geo.js resolveMissing). Reads from disk instead of a public/ copy. Metagraph IP
// geo comes from /api/metagraphs (geolocated live there).
export const runtime = "nodejs";
export const revalidate = 3600;

export async function GET() {
  try {
    const geo = await readFile(path.join(process.cwd(), "data", "geo.json"), "utf8");
    return new NextResponse(geo, { headers: { "content-type": "application/json" } });
  } catch {
    return NextResponse.json({});
  }
}
