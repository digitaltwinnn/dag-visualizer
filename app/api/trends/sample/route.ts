import { NextResponse } from "next/server";
import { NETWORKS } from "@/src/engine/config";
import { sampledIds, untrackedIds } from "@/src/net/lineage";
import { netOf } from "@/src/net/request";
import { getLive } from "@/app/api/metagraphs/live";
import { fetchChainIds } from "@/app/api/network/chainList";
import { getLiveGeo } from "@/app/api/geo/live";
import { runSample } from "../runSample";
import { writeStore } from "../store";
import type { FleetCounts, GlobalRec, MetaRec } from "../bucketing";
import { mergeDagClusters, type DagNode } from "@/src/data/dagCore";
import type { ClusterNode } from "@/src/data/types";
import { readClusters } from "@/app/api/live/upstream";
import { fleetGeo } from "../fleetGeo";
import { fleetTallies } from "../fleetTally";
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

/** The DAG's own nodes from its two clusters, merged — null when either cluster cannot be read.
 *  Two small `cluster/info` reads, once an hour (the fleet sample's cadence): the live route's memo
 *  is per instance and seconds long, so there is nothing to share with it, and the geo loader keeps
 *  its own hour-cached list because its product is locations. A failure is LOGGED (review
 *  2026-10-29): the DAG's fields go absent for the sample, and a cluster host that stays
 *  unreadable must read as an outage in the function logs, not as a quiet gap. */
async function clusterNodes(net: ReturnType<typeof netOf>): Promise<DagNode[] | null> {
  try {
    const { l0, l1 } = NETWORKS[net];
    const { l0: a, l1: b } = await readClusters(l0, l1);
    return mergeDagClusters(a as ClusterNode[], b as ClusterNode[]);
  } catch (e) {
    console.error("trends/sample: cluster read failed", e);
    return null;
  }
}

// Fleet counts from the SAME cached loaders the /api/metagraphs and /api/geo routes serve —
// shared unstable_cache entries, so sampling the fleet adds no upstream traffic. Null on
// failure: an absent gauge is an honest gap (rule 10), a zeroed fleet is a fabrication.
async function fleetCounts(net: ReturnType<typeof netOf>): Promise<FleetCounts | null> {
  try {
    const [{ metagraphs, geo: metaGeo }, dagGeo, dagNodes] = await Promise.all([getLive(net), getLiveGeo(net), clusterNodes(net)]);
    const dagIps = Object.keys(dagGeo);
    // THE DAG'S LINE AND ITS STACK COME FROM ONE READ, AND ONE FIELD HAS ONE DEFINITION (review
    // 2026-10-29): `f.nodes.dag` is the merged cluster list's length — the same list its types are
    // tallied from, so the stack sums to the line exactly as every metagraph's does — and when the
    // clusters cannot be read it is ABSENT, as is the fleet total `f.nodes` that includes it: a
    // gauge that fell back to the geo map's LOCATED count would dip by every unlocated validator
    // on each failed read and read as nodes leaving. (Until 2026-10-29 `f.nodes.dag` WAS that
    // located count, so the stored series steps up once, by the unlocated validators, where the
    // definition changed.) `f.cc.dag.*` stays the geo map's: a location is by nature a located
    // node's.
    const perNet: Record<string, number> = dagNodes ? { dag: dagNodes.length } : {};
    // Where the fleet runs (fleetGeo.ts): the WHOLE fleet by country and provider — each IP once,
    // validators first — and each network's own nodes, for the geo family. Its `countries` is
    // also the tiers' long-standing `f.cc.<cc>` gauge, so the two can never count differently.
    const geo = fleetGeo(dagGeo, metagraphs, metaGeo);
    const countries = geo.countries;
    let metaTotal = 0;
    for (const m of metagraphs) {
      perNet[m.id] = m.nodes.length;
      metaTotal += m.nodes.length;
    }
    const total = dagNodes ? dagNodes.length + metaTotal : undefined;
    // f.layer.{id}.{role} and f.type.{id}.{key} for EVERY network, the DAG included (2026-10-29):
    // the DAG's nodes are its two validator clusters merged by the live Hypergraph's own rule
    // (`mergeDagClusters`, `clusterNodes` above). A failed cluster read leaves the DAG's layer and
    // type fields ABSENT this sample (an honest gap), the rest of the fleet still written. The
    // fleet-wide f.layer.{role} stays metagraph-only (`fleetTally.ts` says why).
    const { layers, perNetLayers, perNetTypes } = fleetTallies(metagraphs, dagNodes);
    if (!dagIps.length && !metagraphs.length) return null;
    return { ...(total != null ? { total } : {}), perNet, layers, perNetLayers, perNetTypes, countries, geo };
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
      // Every catalog network that is NOT RETIRED (`sampledIds`): a retired network keeps its stored
      // past and its row, and stops being read — paging a stopped chain every 15 minutes is waste.
      metaIds: sampledIds(net),
      // THE UNLISTED CHAINS, MEASURED (2026-10-08): the explorer lists every chain it indexes
      // (`/currency`), so the ones the catalog does not track are sampled for their own count — the
      // History "unlisted" figure was anchors minus the listed networks, which turned a global's
      // snapshots stamped into the NEXT bucket (an explorer skew, found on 2026-09-29 19:59) into
      // phantom unlisted snapshots.
      unlistedIds: async () => untrackedIds(net, await fetchChainIds(be)),
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
