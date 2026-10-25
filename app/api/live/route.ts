import { NextResponse } from "next/server";
import { NETWORKS } from "@/src/engine/config";
import { netOf } from "@/src/net/request";
import { sampledIds } from "@/src/net/lineage";
import { unlistedChains } from "../network/unlistedChains";
import { assembleLive, type LiveAnswer } from "./assemble";
import { quietSetFor } from "./quiet";
import { memo, readChain, readGlobals } from "./upstream";

// The shared live answer: 12 globals + each chain's tail, one upstream fan-out per ~4 s per instance,
// edge-cached so every viewer shares it. A failed globals read is an honest 503 and is never cached.
export const runtime = "nodejs";
export const maxDuration = 30;

const GLOBALS = 12;
const TAIL = 50; // POLL.metaSnapTail

export async function GET(req: Request) {
  const net = netOf(req);
  const be = NETWORKS[net].be;
  try {
    const { value, ageMs } = await memo(`live:${net}`, 4000, async () => {
      const quiet = quietSetFor(net);
      const unlisted = (await unlistedChains(net).catch(() => [] as string[])).filter((id) => !quiet.has(id));
      const r = await assembleLive(
        { globals: () => readGlobals(be, GLOBALS), chain: (id) => readChain(be, id, TAIL) },
        sampledIds(net),
        unlisted,
      );
      // An unlisted chain that read fine but is absent from the answer was quiet: skip it until the rebuild.
      for (const id of unlisted) if (!r.unlisted.includes(id) && !r.failed.includes(id)) quiet.add(id);
      return r;
    });
    const body: LiveAnswer = { ...value, memoAgeMs: ageMs };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "public, s-maxage=4, stale-while-revalidate=2" },
    });
  } catch {
    return NextResponse.json({ error: "live feed unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
