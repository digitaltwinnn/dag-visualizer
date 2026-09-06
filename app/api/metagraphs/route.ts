import { NextResponse } from "next/server";
import { assignPalette, allowedFor } from "@/src/palette/palette";
import { type NetworkId } from "@/src/engine/config";
import { netOf } from "@/src/net/request";
import { identityPins } from "@/src/palette/identity";
import { getLive, type Metagraph } from "./live";

// Live server-side metagraph directory + cluster fetch. Next's Node server CAN reach
// the metagraph cluster load balancers (plain HTTP, custom ports, no CORS) that a
// browser can't. We fetch the directory + each cluster's nodes on demand and geolocate
// the IPs, cached via ISR. On failure the route answers 503 — NO pre-baked fallback
// (user decision, 2026-07-10: stale baked data was worse than an honest error; the
// client keeps its last good pull and simply retries on its next 10-min cycle).

export const runtime = "nodejs";
export const revalidate = 300; // re-fetch at most every 5 minutes (was 10 — user, 2026-08-14:
// a DOR restart left its signers reading "unknown node" for most of a cycle; halving the cadence
// halves that stale window, and the geolocation batch rate stays well inside ip-api's free tier)
// The live fan-out can run long if a cluster LB is slow; give it headroom over the
// Hobby 10s default (the per-fetch timeout in ./live's getJson keeps the realistic case
// well under).
export const maxDuration = 60;

function withHues(list: Metagraph[], net: NetworkId): Metagraph[] {
  // The REQUEST's allowed ranges, not the module default: this runs on the server, where the
  // frozen client resolver always answers mainnet — passing them keeps server-assigned hues
  // identical to what the client's own palette would assign for this network.
  const palette = assignPalette(list.map((m) => m.id), identityPins(), allowedFor(net));
  return list.map((m) => {
    const e = palette.get(m.id);
    return e ? { ...m, hue: { deg: e.hueDeg, oklch: e.oklch, hex: e.hex } } : m;
  });
}

export async function GET(req: Request) {
  const net = netOf(req);
  try {
    const live = await getLive(net);
    // AGE, NOT A TIMESTAMP. The client needs to know whether this payload is current, and the only
    // reliable subtraction is one done on a single clock: `builtAt` is server time, and a viewer's
    // clock can be minutes off, which would invent staleness that isn't there. Both terms here are
    // this server's own `Date.now()`, so what crosses the wire is already an elapsed duration.
    //
    // WHY IT IS PUBLISHED AT ALL: `unstable_cache` is demonstrably capable of going stale and
    // ceasing to revalidate over a long-lived process — that is exactly what broke the snapshot
    // route's served-window gate (app/api/snapshot/ordinalWindow.ts, 2026-08-31, measured 148
    // ordinals behind). This route is the same construct over a time-varying value, and it feeds
    // the whole app's node set. It is NOT swapped for a per-instance TTL the way the gate was: the
    // shared cache is load-bearing here, holding an expensive fan-out — dozens of cluster calls
    // plus ip-api, which is rate-limited free-tier — down to once per window across instances.
    // So this measures rather than re-plumbs: a freeze becomes visible in the pulse strip instead
    // of silently serving last week's fleet, and that evidence is what should decide any deeper fix.
    // A payload cached before builtAt existed has none — omit the field rather than serialising a
    // NaN, which JSON turns into null and the client would then have to special-case. Its absence
    // already means "fail open, treat as fresh" on the client, so omission is the honest signal.
    const ageMs = typeof live.builtAt === "number" ? Math.max(0, Date.now() - live.builtAt) : undefined;
    return NextResponse.json(
      { ...live, ageMs, metagraphs: withHues(live.metagraphs, net) },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch {
    // No baked fallback (user decision): an honest 503 — the client keeps its last good
    // pull (Engine.refreshMeta only rebuilds on a changed OK response) and retries later.
    return NextResponse.json({ error: "live metagraph fetch failed" }, { status: 503 });
  }
}
