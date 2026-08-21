import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { NETWORKS, type NetworkId } from "@/src/engine/config";
import { netOf } from "@/src/net/request";

// VALIDATOR NAMES + DELEGATED-STAKING OPT-IN from the Global L0's delegated-staking registry
// (`/node-params` — probed 2026-08-14: ~181 entries of peerId + nodeMetadataParameters.name,
// operators name their own machines: "DOR - Node 1", "CEO Ben Jorgensen"…). An ENTRY means the
// operator registered as a delegated-staking candidate (user, 2026-08-16), so the map keeps
// every registered peerId — name or not ("" when unnamed) — and the client reads presence for
// the opt-in and the non-empty name for the Nickname. Served as a flat { peerId: name } map.
// Cached 1h (operator metadata moves on operator timescales); 503 on failure — the client
// keeps quiet and retries next mount (the /api/geo pattern; absent data stays absent).
export const runtime = "nodejs";
export const revalidate = 3600;
export const maxDuration = 30;

interface RegistryEntry {
  peerId?: string;
  nodeMetadataParameters?: { name?: string };
}

const getNames = (net: NetworkId) =>
  unstable_cache(
  async (): Promise<Record<string, string>> => {
    const r = await fetch(NETWORKS[net].l0 + "/node-params", { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`registry ${r.status}`);
    const arr = (await r.json()) as RegistryEntry[];
    const map: Record<string, string> = {};
    for (const e of arr) {
      if (e.peerId) map[e.peerId] = e.nodeMetadataParameters?.name?.trim() ?? "";
    }
    if (!Object.keys(map).length) throw new Error("registry empty");
    return map;
  },
  ["node-names-v2", net],
  { revalidate },
  )();

export async function GET(req: Request) {
  try {
    const names = await getNames(netOf(req));
    // Dynamic since ?net= — the CDN caches per URL via s-maxage (multi-network design §3).
    return NextResponse.json(
      { names },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" } },
    );
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}
