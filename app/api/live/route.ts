import { NextResponse } from "next/server";
import { NETWORKS, POLL } from "@/src/engine/config";
import type { LiveAnswer } from "@/src/data/types";
import { netOf } from "@/src/net/request";
import { sampledIds } from "@/src/net/lineage";
import { unlistedChains } from "../network/unlistedChains";
import { assembleWithUnlisted } from "./assemble";
import { LIVE_GLOBALS } from "./limit";
import { quietSetFor } from "./quiet";
import { memo, readChain, readGlobals } from "./upstream";

// The shared live answer: 12 globals + each chain's tail, one upstream fan-out per ~4 s per instance,
// edge-cached so every viewer shares it. A failed globals read is an honest 503 and is never cached.
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: Request) {
  const net = netOf(req);
  const be = NETWORKS[net].be;
  try {
    const { value, ageMs } = await memo(`live:${net}`, 4000, async () => {
      return assembleWithUnlisted(
        { globals: () => readGlobals(be, LIVE_GLOBALS), chain: (id) => readChain(be, id, POLL.metaSnapTail) },
        sampledIds(net),
        () => unlistedChains(net),
        quietSetFor(net),
      );
    });
    const body: LiveAnswer = { ...value, memoAgeMs: ageMs };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "public, s-maxage=4, stale-while-revalidate=2" },
    });
  } catch (e) {
    console.error("live: globals read failed", e);
    return NextResponse.json({ error: "live feed unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
