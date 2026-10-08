import { NextResponse } from "next/server";
import { netOf } from "@/src/net/request";
import { unlistedChains } from "../unlistedChains";

// The unlisted chains' addresses (`../unlistedChains.ts`) — the anchor log's Unlisted lens merges
// them by time, the way "all" merges the catalog's chains.
export const maxDuration = 15;

export async function GET(req: Request) {
  try {
    const chains = await unlistedChains(netOf(req));
    return NextResponse.json({ chains }, { headers: { "Cache-Control": "public, s-maxage=3600" } });
  } catch {
    return NextResponse.json({ error: "upstream unavailable" }, { status: 503 });
  }
}
