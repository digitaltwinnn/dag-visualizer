import { NextResponse } from "next/server";
import { SUBMITTERS } from "@/src/data/submitters";
import { readStore } from "../trends/store";
import { readSubmitters } from "./read";

// The submitters READ route: who sent a network's data blocks over a range, from the `sub:` family.
// Same idiom as /api/trends: reading searchParams keeps it per-request, s-maxage does the caching,
// and it runs on the READ-ONLY token. Which hashes a range reads is `readSubmitters`' (`read.ts`).
// `from`/`to` must be hour edges, so the URL space is bounded to what the HUD asks.
export const runtime = "nodejs";
export const maxDuration = 15;

const HOUR = 3600000;
const DAY = 24 * HOUR;
const CACHE = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" };
/** A bad request is never cached: each would be a CDN entry of its own. */
const bad = (error: string) => NextResponse.json({ error }, { status: 400, headers: { "Cache-Control": "no-store" } });

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const net = q.get("net") ?? "";
  if (!Object.hasOwn(SUBMITTERS, net)) return bad("unknown network");
  const win = q.get("window");
  if (win !== null && win !== "24h") return bad("window must be 24h");
  const rawFrom = q.get("from"), rawTo = q.get("to");
  const fromMs = Number(rawFrom), toMs = Number(rawTo);
  if (win === null) {
    if (!rawFrom || !rawTo || !Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs || toMs - fromMs > 3660 * DAY) {
      return bad("from and to must be epoch ms, from < to, within ten years");
    }
    // HOUR EDGES ONLY (PR review I3): the store's finest tier is the hour and the HUD asks whole hours
    // (`querySpan`), so any other value is a fresh CDN key and a fresh read — for Dor, one sketch MGET
    // per measured day — from an unauthenticated route.
    if (fromMs % HOUR !== 0 || toMs % HOUR !== 0) return bad("from and to must be whole hours (epoch ms)");
  }
  try {
    const range = win !== null ? "24h" as const : { fromMs, toMs };
    return NextResponse.json(await readSubmitters(readStore(), net, range, Date.now()), { headers: CACHE });
  } catch {
    return NextResponse.json({ error: "submitters store unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
