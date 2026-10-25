import { NextResponse } from "next/server";
import { NETWORKS } from "@/src/engine/config";
import { netOf } from "@/src/net/request";
import { GLOBALS_LADDER, clampLimit } from "../limit";
import { memo, readGlobals } from "../upstream";
import { SNAPSHOT_WINDOW, cacheControl } from "../windows";

// Catch-up read for the live feed: the newest N global snapshots (N rounded up to `GLOBALS_LADDER`),
// memoised per (net, N) for ~4 s and edge-cached. A failed read is an honest 503 and is never cached.
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: Request) {
  const net = netOf(req);
  const limit = clampLimit(new URL(req.url).searchParams.get("limit"), GLOBALS_LADDER);
  try {
    const { value, ageMs } = await memo(`globals:${net}:${limit}`, SNAPSHOT_WINDOW.memoMs, () => readGlobals(NETWORKS[net].be, limit));
    return NextResponse.json(
      { globals: value, memoAgeMs: ageMs },
      { headers: { "Cache-Control": cacheControl(SNAPSHOT_WINDOW) } },
    );
  } catch (e) {
    console.error("live/globals: read failed", e);
    return NextResponse.json({ error: "live feed unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
