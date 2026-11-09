import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { NETWORKS } from "@/src/engine/config";
import { currentIdOf, isTracked, lineageIds } from "@/src/net/lineage";
import { netOf } from "@/src/net/request";
import type { GlobalSnapshot, RawMetaSnapshot } from "@/src/data/types";
import { BLOCK_WINDOW_TICKS } from "@/src/data/blockWindow";
import { BeyondReach, absentIsEmpty, assembleTrail, trailCacheControl, type TrailRow } from "../trail";

// GET /api/blocks/trail?net=&around=<ordinal|live>&n=52&chain=<id> — the Blocks register's window:
// the newest `n` global snapshots at or below `around` that hold a block (`../trail.ts`). `chain`
// (the top bar's network filter: `dag`, or a listed network's id — a former address maps to its
// network's current one; absent = every network) makes it THAT network's newest `n` block ticks,
// with the DAG blocks those ticks carry; an id the catalog does not track is a 400 (an unlisted
// network's blocks are not read). `chain` is a query parameter, so the CDN keys each network's
// window apart. `live` is the edge and refreshes every 30 s; a window around an explicit ordinal
// is final once THE PIN ITSELF is an hour old (`trailCacheControl`, review I1 — read from the pin's
// own global record, so a pin past the tip fails that read and answers 503, never cached), and is
// then cached a year at the edge, a minute before that. Any read that fails answers 503, never
// cached: a hole must not read as "no blocks". `n` is the window's one size (`BLOCK_WINDOW_TICKS`):
// any other is a 400, so a request cannot mint new edge keys that each cost a fresh walk (review M8).
//
// ⚠️ NO `dynamic = "force-dynamic"` (review I2, 2026-11-09): in Next 16 it sets every fetch to
// no-store (`fetchCache = 'force-no-store'`), so the per-ordinal record reads were re-read on every
// miss. A route handler is not cached by default anyway, and it reads the request. The record reads
// go through `unstable_cache` (the exact route's own pattern): a record by ordinal never changes, and
// a failed read throws, so a miss is never cached.

export const runtime = "nodejs";
export const maxDuration = 60;

const PAGE = 1000;

async function getJson(url: string, absentOk = false): Promise<{ data?: unknown; meta?: { next?: string } }> {
  const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
  // A dormant former address has no list: 404 is no rows, not a failed read.
  if (r.status === 404 && absentOk) return {};
  if (!r.ok) throw new Error(`be ${r.status}`);
  return (await r.json()) as { data?: unknown; meta?: { next?: string } };
}

// A record by ordinal never changes, so it is cached a day (`cachedRecord`); a miss throws, never cached.
async function getRecord<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!r.ok) throw new Error(`be ${r.status}`);
  const { data } = (await r.json()) as { data?: T };
  if (!data) throw new Error("no record");
  return data;
}

const cachedRecord = <T,>(url: string): Promise<T> =>
  unstable_cache(() => getRecord<T>(url), ["trail-record-v1", url], { revalidate: 86_400 })();

export async function GET(req: Request) {
  const net = netOf(req);
  const q = new URL(req.url).searchParams;
  const aroundQ = q.get("around") ?? "live";
  const around = aroundQ === "live" ? null : Number(aroundQ);
  if (around != null && (!Number.isInteger(around) || around < 1)) return NextResponse.json({ error: "around" }, { status: 400 });
  const n = BLOCK_WINDOW_TICKS;
  if (q.get("n") != null && Number(q.get("n")) !== n) return NextResponse.json({ error: "n" }, { status: 400 });
  const chainQ = q.get("chain");
  if (chainQ != null && chainQ !== "dag" && !isTracked(net, chainQ)) return NextResponse.json({ error: "chain" }, { status: 400 });
  const chain = chainQ == null || chainQ === "dag" ? chainQ : currentIdOf(net, chainQ);
  const be = NETWORKS[net].be;
  try {
    // THE PIN'S OWN RECORD first (review I1): its age is what settles the window, and a pin past the
    // tip has none — the read fails, and the request answers 503, never cached.
    const pin = around != null ? await cachedRecord<GlobalSnapshot>(`${be}/global-snapshots/${around}`) : null;
    const answer = await assembleTrail(
      {
        transfers: async (chain, next) => {
          const path = chain === "dag" ? "/transactions" : `/currency/${chain}/transactions`;
          const j = await getJson(`${be}${path}?limit=${PAGE}${next ? `&next=${encodeURIComponent(next)}` : ""}`, absentIsEmpty(chain, next));
          return { rows: Array.isArray(j.data) ? (j.data as TrailRow[]) : [], next: j.meta?.next };
        },
        global: (o) => cachedRecord<GlobalSnapshot>(`${be}/global-snapshots/${o}`),
        metaSnap: (c, o) => cachedRecord<RawMetaSnapshot>(`${be}/currency/${c}/snapshots/${o}`),
        chains: async () => lineageIds(net),
        // A former chain address folds under its network's current id here, so the client keys one family.
        currentId: (id) => currentIdOf(net, id),
      },
      around,
      n,
      chain,
    );
    return NextResponse.json(answer, { headers: { "Cache-Control": trailCacheControl(around, pin?.timestamp ?? null, Date.now()) } });
  } catch (e) {
    // Too deep to walk to is an answer (a pin only gets deeper), cached an hour; any other failure is not.
    if (e instanceof BeyondReach) return NextResponse.json({ ticks: [], chains: [], beyond: true, ...(chain != null ? { chain } : {}) }, { headers: { "Cache-Control": "public, s-maxage=3600" } });
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
