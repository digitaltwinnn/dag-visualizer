import { NextResponse } from "next/server";
import { SUBMITTERS } from "@/src/data/submitters";
import { stepMsOf } from "../trends/keys";
import { readStore } from "../trends/store";
import { assembleSubmitters, parseSpan, windowRange24h } from "./assemble";
import { subNamesKeyOf, subSlotOf, subSpanKeyOf, type SubTier } from "./keys";

// The submitters READ route: who sent a network's data blocks over a range, from the `sub:` family.
// Same idiom as /api/trends: reading searchParams keeps it per-request, s-maxage does the caching,
// and it runs on the READ-ONLY token.
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
  let fromMs = Number(rawFrom), toMs = Number(rawTo);
  if (win === null) {
    if (!rawFrom || !rawTo || !Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs || toMs - fromMs > 3660 * DAY) {
      return NextResponse.json({ error: "from and to must be epoch ms, from < to, within ten years" }, { status: 400 });
    }
  }
  try {
    const store = readStore();
    const [span, names] = await Promise.all([store.hgetall(subSpanKeyOf(net)), store.hgetall(subNamesKeyOf(net))]);
    if (win !== null) ({ fromMs, toMs } = windowRange24h(span, Date.now()));
    const tier: SubTier = win !== null || toMs - fromMs <= 30 * DAY ? "1h" : "1d";
    const step = stepMsOf(tier);
    const keys = new Set<string>();
    for (let t = Math.floor(fromMs / step) * step; t < toMs; t += step) keys.add(subSlotOf(net, tier, t).key);
    const read = async (ks: string[]) => {
      const out: Record<string, Record<string, string>> = {};
      await Promise.all(ks.map(async (k) => { const h = await store.hgetall(k); if (h) out[k] = h; }));
      return out;
    };
    const org = SUBMITTERS[net].kind === "organisation";
    const first = new Date(parseSpan(span)?.from ?? Date.now()).getUTCFullYear();
    const years: string[] = [];
    if (org) for (let y = first; y <= new Date().getUTCFullYear(); y++) years.push(subSlotOf(net, "1d", Date.UTC(y, 5, 1)).key);
    const [hashes, yearHashes] = await Promise.all([read([...keys]), read(years)]);
    return NextResponse.json(
      assembleSubmitters({ net, tier, fromMs, toMs, hashes, span, names, yearHashes }),
      { headers: CACHE },
    );
  } catch {
    return NextResponse.json({ error: "submitters store unavailable" }, { status: 503 });
  }
}
