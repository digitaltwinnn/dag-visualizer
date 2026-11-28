import { NextResponse } from "next/server";
import { HOSTS } from "@/src/engine/config";
import { DED_ID, DOR_ID } from "@/src/data/submitters";
import { cachedL0Url, getJson as getL0Json } from "@/app/api/network/metaL0";
import { getJson, pageCurrencySnapshots } from "@/app/api/trends/explorerPages";
import { writeStore } from "@/app/api/trends/store";
import { runSubmitters } from "../runSubmitters";

// The SUBMITTERS sampler — Vercel Cron hits this every 15 min (vercel.json), off the trends
// sampler's minute. For DED and Dor it reads each new snapshot from the network's own L0 and sums
// who submitted its data blocks into the `sub:mainnet:` family (`runSubmitters.ts`). Auth is the
// trends sampler's: `Authorization: Bearer ${CRON_SECRET}`, which Vercel sends once the env var
// exists. No `dynamic = "force-dynamic"`: it forces fetchCache no-store and bypasses the
// `unstable_cache` that `cachedL0Url` relies on; reading the Authorization header already keeps
// the route per-request.
export const runtime = "nodejs";
// The sampler's own read budget is 200 s, inside this.
export const maxDuration = 300;

const DED_LATEST = "https://lb-mainnet.ded-ingestion.constellationnetwork.net/v1/fingerprints/latest?limit=500";

export async function GET(req: Request) {
  // ⚠️ `!process.env.CRON_SECRET` is load-bearing: without it, an unset secret turns the
  // template literal into the literal string "Bearer undefined" and authenticates anyone
  // who sends exactly that — concretely reachable on a preview deploy sharing prod Redis.
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const be = HOSTS.be;
  try {
    const res = await runSubmitters({
      store: writeStore(),
      nets: [DED_ID, DOR_ID],
      pageMeta: (id, limit, next) => pageCurrencySnapshots(be, id, limit, next),
      fetchSnap: async (netId, ordinal) => getL0Json(`${await cachedL0Url(netId)}/snapshots/${ordinal}`, 15000),
      dedLatest: () => getJson(DED_LATEST, 10000),
      now: () => Date.now(),
    });
    // A network that failed still answers 200 (the others committed): say so in the logs, once each.
    for (const [net, at] of Object.entries(res.failed)) {
      const bad = res.unreadable?.[net];
      if (bad) console.warn(`[submitters] ${net}: its stored device sketch ${bad} would not decode; nothing of it is written until it does (R22)`);
      else if (at != null) console.warn(`[submitters] ${net}: ${at < 0 ? "its explorer list would not read" : `L0 snapshot ${at} would not read`}; the next run resumes there`);
    }
    return NextResponse.json(res);
  } catch (e) {
    // A run that failed wholesale left the cursors unmoved — the next run covers this span.
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
