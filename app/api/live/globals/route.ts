import { NextResponse } from "next/server";
import { NETWORKS, POLL } from "@/src/engine/config";
import { netOf } from "@/src/net/request";
import { memo, readGlobals } from "../upstream";

// Catch-up read for the live feed: the newest N global snapshots, memoised per (net, N) for ~4 s and
// edge-cached. A failed read is an honest 503 and is never cached.
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: Request) {
  const net = netOf(req);
  const raw = Number(new URL(req.url).searchParams.get("limit"));
  const limit = Math.min(POLL.maxSnapshots, Math.max(1, Number.isFinite(raw) ? Math.floor(raw) : 1));
  try {
    const { value, ageMs } = await memo(`globals:${net}:${limit}`, 4000, () => readGlobals(NETWORKS[net].be, limit));
    return NextResponse.json(
      { globals: value, memoAgeMs: ageMs },
      { headers: { "Cache-Control": "public, s-maxage=4, stale-while-revalidate=2" } },
    );
  } catch (e) {
    console.error("live/globals: read failed", e);
    return NextResponse.json({ error: "live feed unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
