import { NextResponse } from "next/server";
import { NETWORKS, CATALOG } from "@/src/engine/config";
import { netOf } from "@/src/net/request";
import { getLive } from "@/app/api/metagraphs/live";
import { getLiveGeo } from "@/app/api/geo/live";
import { runSample } from "../runSample";
import { writeStore } from "../store";
import type { FleetCounts, GlobalRec, MetaRec } from "../bucketing";
import type { ChainPage } from "../fetchSince";

// The trends SAMPLER — Vercel Cron hits this every 15 min (vercel.json). It pages the tiny
// explorer list records since the Redis cursor (never the ~2.5 MB raw snapshot routes) and
// merge-writes the tiered hashes. Auth: Vercel sends `Authorization: Bearer ${CRON_SECRET}`
// automatically once the env var exists.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 300 s (was 60): pays for the pager's 30K-record self-heal depth after downtime — a normal
// 15-min run still finishes in seconds; only a catch-up after an outage goes deep.
export const maxDuration = 300;

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
    const [{ metagraphs, geo: metaGeo }, dagGeo] = await Promise.all([getLive(net), getLiveGeo(net)]);
    const dagIps = Object.keys(dagGeo);
    const perNet: Record<string, number> = { dag: dagIps.length };
    const layers: Record<string, number> = {};
    // Country counts cover the WHOLE fleet — validators (dagGeo) and metagraph machines
    // (metaGeo, already returned by getLive()) folded into one per-country tally. An IP can
    // appear in both maps (a hybrid node is also geolocated by the metagraph directory scan),
    // so count each IP once: validators first, metagraph geo only for IPs not already seen.
    const countries: Record<string, number> = {};
    const seenIps = new Set<string>();
    for (const ip of dagIps) {
      seenIps.add(ip);
      const cc = dagGeo[ip]?.cc;
      if (cc) countries[cc] = (countries[cc] || 0) + 1;
    }
    for (const ip of Object.keys(metaGeo)) {
      if (seenIps.has(ip)) continue;
      seenIps.add(ip);
      const cc = metaGeo[ip]?.cc;
      if (cc) countries[cc] = (countries[cc] || 0) + 1;
    }
    let total = dagIps.length;
    // f.layer.* counts metagraph-layer roles only — per-layer validator attribution isn't
    // derivable from the geo map (it carries no role/layer field for validator IPs).
    // f.layer.{id}.{role} is the same tally kept per network (2026-09-11 — the /trends
    // per-network node panels draw the layer lines the hypergraph tab already has).
    const perNetLayers: Record<string, Record<string, number>> = {};
    for (const m of metagraphs) {
      perNet[m.id] = m.nodes.length;
      total += m.nodes.length;
      const mine: Record<string, number> = (perNetLayers[m.id] = {});
      for (const n of m.nodes) for (const role of n.roles) {
        layers[role] = (layers[role] || 0) + 1;
        mine[role] = (mine[role] || 0) + 1;
      }
    }
    return total > 0 ? { total, perNet, layers, perNetLayers, countries } : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  // ⚠️ `!process.env.CRON_SECRET` is load-bearing: without it, an unset secret turns the
  // template literal into the literal string "Bearer undefined" and authenticates anyone
  // who sends exactly that — concretely reachable on a preview deploy sharing prod Redis.
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const net = netOf(req);
  const be = NETWORKS[net].be;
  try {
    const res = await runSample({
      net,
      metaIds: CATALOG[net].map((m) => m.id).filter((id): id is string => !!id),
      store: writeStore(),
      // Catch-up pages ride the explorer's own `meta.next` cursor — one request can't go
      // past ~10K records (probed live: the global list returns EMPTY above 10K and the
      // busiest currency chain 504s there), so depth comes from walking, not from limit.
      pageGlobals: async (limit, next) => {
        const j = (await getJson(`${be}/global-snapshots?limit=${limit}${next ? `&next=${encodeURIComponent(next)}` : ""}`)) as { data?: GlobalRec[]; meta?: { next?: string } };
        return { data: j.data ?? [], next: j.meta?.next } satisfies ChainPage<GlobalRec>;
      },
      pageMeta: async (id, limit, next) => {
        const j = (await getJson(`${be}/currency/${id}/snapshots?limit=${limit}${next ? `&next=${encodeURIComponent(next)}` : ""}`)) as { data?: MetaRec[]; meta?: { next?: string } };
        return { data: j.data ?? [], next: j.meta?.next } satisfies ChainPage<MetaRec>;
      },
      fleet: () => fleetCounts(net),
      now: () => Date.now(),
    });
    return NextResponse.json(res);
  } catch (e) {
    // A run that failed wholesale left the cursor unmoved — the next run covers this span.
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
