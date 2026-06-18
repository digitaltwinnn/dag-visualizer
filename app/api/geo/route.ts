import { NextResponse } from "next/server";
import geo from "@/data/geo.json";

// Serves the baked validator IP→geo seed so the globe plots instantly on load; the
// client still resolves any missing/new validator IPs at runtime (js/geo.js
// resolveMissing). Metagraph IP geo comes from /api/metagraphs (geolocated live).
// Imported (bundled) rather than read from disk so it ships in serverless deploys.
export const revalidate = 3600;

export function GET() {
  return NextResponse.json(geo);
}
