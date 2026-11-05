import { NextResponse } from "next/server";
import { NETWORKS } from "@/src/engine/config";
import { currentIdOf, lineageIds } from "@/src/net/lineage";
import { netOf } from "@/src/net/request";
import type { GlobalSnapshot, RawMetaSnapshot } from "@/src/data/types";
import { BeyondReach, assembleTrail, type TrailRow } from "../trail";

// GET /api/blocks/trail?net=&around=<ordinal|live>&n=52 — the Blocks register's window: the newest
// `n` global snapshots at or below `around` that hold a block (`../trail.ts`). `live` is the edge
// and refreshes every 30 s; a window around an explicit ordinal never changes once its newest tick is
// an hour old (the ledger window's own settled rule), so it is cached a year at the edge, a minute
// before that. Any read that fails answers 503, never cached: a hole must not read as "no blocks".

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SETTLED_MS = 3_600_000;
const PAGE = 1000;
const DEFAULT_N = 52;
const MAX_N = 100;

async function getJson(url: string, absentOk = false): Promise<{ data?: unknown; meta?: { next?: string } }> {
  const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
  // A dormant former address has no list: 404 is no rows, not a failed read.
  if (r.status === 404 && absentOk) return {};
  if (!r.ok) throw new Error(`be ${r.status}`);
  return (await r.json()) as { data?: unknown; meta?: { next?: string } };
}

// A record by ordinal never changes, so the platform may cache it (the notes' own rule).
async function getRecord<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000), next: { revalidate: 86_400 } });
  if (!r.ok) throw new Error(`be ${r.status}`);
  const { data } = (await r.json()) as { data?: T };
  if (!data) throw new Error("no record");
  return data;
}

export async function GET(req: Request) {
  const net = netOf(req);
  const q = new URL(req.url).searchParams;
  const aroundQ = q.get("around") ?? "live";
  const around = aroundQ === "live" ? null : Number(aroundQ);
  if (around != null && (!Number.isInteger(around) || around < 1)) return NextResponse.json({ error: "around" }, { status: 400 });
  const nQ = Number(q.get("n") ?? DEFAULT_N);
  const n = Number.isInteger(nQ) && nQ >= 1 ? Math.min(nQ, MAX_N) : DEFAULT_N;
  const be = NETWORKS[net].be;
  try {
    const answer = await assembleTrail(
      {
        transfers: async (chain, next) => {
          const path = chain === "dag" ? "/transactions" : `/currency/${chain}/transactions`;
          const j = await getJson(`${be}${path}?limit=${PAGE}${next ? `&next=${encodeURIComponent(next)}` : ""}`, chain !== "dag");
          return { rows: Array.isArray(j.data) ? (j.data as TrailRow[]) : [], next: j.meta?.next };
        },
        global: (o) => getRecord<GlobalSnapshot>(`${be}/global-snapshots/${o}`),
        metaSnap: (c, o) => getRecord<RawMetaSnapshot>(`${be}/currency/${c}/snapshots/${o}`),
        chains: async () => lineageIds(net),
        // A former chain address folds under its network's current id here, so the client keys one family.
        currentId: (id) => currentIdOf(net, id),
      },
      around,
      n,
    );
    const newest = answer.ticks[0];
    const settled = around != null && newest != null && Date.now() - Date.parse(newest.ts) > SETTLED_MS;
    const cache = around == null ? "public, s-maxage=30, stale-while-revalidate=30" : settled ? "public, s-maxage=31536000, immutable" : "public, s-maxage=60, stale-while-revalidate=60";
    return NextResponse.json(answer, { headers: { "Cache-Control": cache } });
  } catch (e) {
    // Too deep to walk to is an answer (a pin only gets deeper), cached an hour; any other failure is not.
    if (e instanceof BeyondReach) return NextResponse.json({ ticks: [], chains: [], beyond: true }, { headers: { "Cache-Control": "public, s-maxage=3600" } });
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
