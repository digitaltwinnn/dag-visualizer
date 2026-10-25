import { NextResponse } from "next/server";
import { NETWORKS } from "@/src/engine/config";
import { netOf } from "@/src/net/request";
import { memo, readClusters } from "../upstream";
import { CLUSTER_WINDOW, cacheControl } from "../windows";

// The node lists (global L0 + currency L1 cluster info), memoised ~25 s and edge-cached. An empty
// list from either layer is a failure, not an answer: 503, never cached.
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: Request) {
  const net = netOf(req);
  const { l0, l1 } = NETWORKS[net];
  try {
    const { value, ageMs } = await memo(`clusters:${net}`, CLUSTER_WINDOW.memoMs, () => readClusters(l0, l1));
    return NextResponse.json(
      { ...value, memoAgeMs: ageMs },
      { headers: { "Cache-Control": cacheControl(CLUSTER_WINDOW) } },
    );
  } catch (e) {
    console.error("live/clusters: read failed", e);
    return NextResponse.json({ error: "live feed unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
