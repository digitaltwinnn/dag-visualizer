import { NextResponse } from "next/server";
import { netOf } from "@/src/net/request";
import { assemble, WINDOWS, type WindowId } from "./assemble";
import { slotsInWindow } from "./keys";
import { readStore } from "./store";

// The trends READ route: 2–3 HGETALLs assembled into one compact window payload, cached by
// the CDN per URL (the /api/metagraphs idiom — reading searchParams keeps it ƒ Dynamic,
// s-maxage does the caching). Runs on the READ-ONLY Upstash token: the public surface
// holds a credential that structurally cannot write or delete history.
export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET(req: Request) {
  const net = netOf(req);
  const w = new URL(req.url).searchParams.get("window") ?? "24h";
  if (!(w in WINDOWS)) {
    return NextResponse.json({ error: `window must be one of ${Object.keys(WINDOWS).join(", ")}` }, { status: 400 });
  }
  const window = w as WindowId;
  try {
    const store = readStore();
    const now = Date.now();
    const { tier, ms } = WINDOWS[window];
    const keys = [...new Set(slotsInWindow(net, tier, now - ms, now).map((s) => s.key))];
    const hashes: Record<string, Record<string, string>> = {};
    await Promise.all(keys.map(async (k) => {
      const h = await store.hgetall(k);
      if (h) hashes[k] = h;
    }));
    return NextResponse.json(assemble(net, window, now, hashes), {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch {
    return NextResponse.json({ error: "trends store unavailable" }, { status: 503 });
  }
}
