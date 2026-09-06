import { NextResponse } from "next/server";
import { NETWORKS, CATALOG } from "@/src/engine/config";
import { netOf } from "@/src/net/request";
import { getLive } from "@/app/api/metagraphs/live";
import { getLiveGeo } from "@/app/api/geo/live";
import { runSample } from "../runSample";
import { writeStore } from "../store";
import type { FleetCounts, GlobalRec, MetaRec } from "../bucketing";

// The trends SAMPLER — Vercel Cron hits this every 15 min (vercel.json). It pages the tiny
// explorer list records since the Redis cursor (never the ~2.5 MB raw snapshot routes) and
// merge-writes the tiered hashes. Auth: Vercel sends `Authorization: Bearer ${CRON_SECRET}`
// automatically once the env var exists.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function getJson(url: string, ms = 7000): Promise<unknown> {
  const r = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(ms),
    headers: { "User-Agent": "dag-visualizer" },
  });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

// Fleet counts from the SAME cached loaders the /api/metagraphs and /api/geo routes serve —
// shared unstable_cache entries, so sampling the fleet adds no upstream traffic. Null on
// failure: an absent gauge is an honest gap (rule 10), a zeroed fleet is a fabrication.
async function fleetCounts(net: ReturnType<typeof netOf>): Promise<FleetCounts | null> {
  try {
    const [{ metagraphs }, geo] = await Promise.all([getLive(net), getLiveGeo(net)]);
    const dagIps = Object.keys(geo);
    const perNet: Record<string, number> = { dag: dagIps.length };
    const layers: Record<string, number> = {};
    const countries: Record<string, number> = {};
    for (const ip of dagIps) {
      const cc = geo[ip]?.cc;
      if (cc) countries[cc] = (countries[cc] || 0) + 1;
    }
    let total = dagIps.length;
    for (const m of metagraphs) {
      perNet[m.id] = m.nodes.length;
      total += m.nodes.length;
      for (const n of m.nodes) for (const role of n.roles) layers[role] = (layers[role] || 0) + 1;
    }
    return total > 0 ? { total, perNet, layers, countries } : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const net = netOf(req);
  const be = NETWORKS[net].be;
  try {
    const res = await runSample({
      net,
      metaIds: CATALOG[net].map((m) => m.id).filter((id): id is string => !!id),
      store: writeStore(),
      pageGlobals: async (limit) =>
        (((await getJson(`${be}/global-snapshots?limit=${limit}`)) as { data?: GlobalRec[] }).data ?? []),
      pageMeta: async (id, limit) =>
        (((await getJson(`${be}/currency/${id}/snapshots?limit=${limit}`)) as { data?: MetaRec[] }).data ?? []),
      fleet: () => fleetCounts(net),
      now: () => Date.now(),
    });
    return NextResponse.json(res);
  } catch (e) {
    // A run that failed wholesale left the cursor unmoved — the next run covers this span.
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
