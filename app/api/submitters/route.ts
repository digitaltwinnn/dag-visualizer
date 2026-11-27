import { NextResponse } from "next/server";
import { SUBMITTERS } from "@/src/data/submitters";
import { readStore } from "../trends/store";
import { readSubmitters } from "./read";

// The submitters READ route: who sent a network's data blocks over a range, from the `sub:` family.
// Same idiom as /api/trends: reading searchParams keeps it per-request, s-maxage does the caching,
// and it runs on the READ-ONLY token. Which hashes a range reads is `readSubmitters`' (`read.ts`).
export const runtime = "nodejs";
export const maxDuration = 15;

const DAY = 86400000;
const CACHE = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" };

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const net = q.get("net") ?? "";
  if (!Object.hasOwn(SUBMITTERS, net)) return NextResponse.json({ error: "unknown network" }, { status: 400 });
  const win = q.get("window");
  if (win !== null && win !== "24h") return NextResponse.json({ error: "window must be 24h" }, { status: 400 });
  const rawFrom = q.get("from"), rawTo = q.get("to");
  const fromMs = Number(rawFrom), toMs = Number(rawTo);
  if (win === null) {
    if (!rawFrom || !rawTo || !Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs || toMs - fromMs > 3660 * DAY) {
      return NextResponse.json({ error: "from and to must be epoch ms, from < to, within ten years" }, { status: 400 });
    }
  }
  try {
    const range = win !== null ? "24h" as const : { fromMs, toMs };
    return NextResponse.json(await readSubmitters(readStore(), net, range, Date.now()), { headers: CACHE });
  } catch {
    return NextResponse.json({ error: "submitters store unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
