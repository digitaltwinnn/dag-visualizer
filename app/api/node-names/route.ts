import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";

// VALIDATOR NAMES from the Global L0's delegated-staking registry (`/node-params` — probed
// 2026-08-14: ~181 entries of peerId + nodeMetadataParameters.name, operators name their own
// machines: "DOR - Node 1", "CEO Ben Jorgensen"…). Served as a flat { peerId: name } map for
// the node card's Name row and the callout title (user, 2026-08-16 — identity enrichment).
// Cached 1h (operator metadata moves on operator timescales); 503 on failure — the client
// keeps quiet and retries next mount (the /api/geo pattern; absent data stays absent).
export const runtime = "nodejs";
export const revalidate = 3600;
export const maxDuration = 30;

const REGISTRY = "https://l0-lb-mainnet.constellationnetwork.io/node-params";

interface RegistryEntry {
  peerId?: string;
  nodeMetadataParameters?: { name?: string };
}

const getNames = unstable_cache(
  async (): Promise<Record<string, string>> => {
    const r = await fetch(REGISTRY, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`registry ${r.status}`);
    const arr = (await r.json()) as RegistryEntry[];
    const map: Record<string, string> = {};
    for (const e of arr) {
      const name = e.nodeMetadataParameters?.name?.trim();
      if (e.peerId && name) map[e.peerId] = name;
    }
    if (!Object.keys(map).length) throw new Error("registry empty");
    return map;
  },
  ["node-names-v1"],
  { revalidate },
);

export async function GET() {
  try {
    const names = await getNames();
    return NextResponse.json(
      { names },
      { headers: { "Cache-Control": "public, max-age=3600" } },
    );
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}
