import { NextResponse, connection } from "next/server";
import { HOSTS } from "@/src/engine/config";
import { memo, readClusters } from "../upstream";
import { CLUSTER_WINDOW, cacheControl } from "../windows";

// The node lists (global L0 + currency L1 cluster info), memoised ~25 s and edge-cached. An empty
// list from either layer is a failure, not an answer: 503, never cached.
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  // Per request, never prerendered: the CDN caches the answer by its own Cache-Control.
  await connection();
  const { l0, l1 } = HOSTS;
  try {
    const { value, ageMs } = await memo(`clusters`, CLUSTER_WINDOW.memoMs, () => readClusters(l0, l1));
    return NextResponse.json(
      { ...value, memoAgeMs: ageMs },
      { headers: { "Cache-Control": cacheControl(CLUSTER_WINDOW) } },
    );
  } catch (e) {
    console.error("live/clusters: read failed", e);
    return NextResponse.json({ error: "live feed unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
