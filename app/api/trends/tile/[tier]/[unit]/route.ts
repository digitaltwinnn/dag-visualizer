import { NextResponse } from "next/server";
import { netOf } from "@/src/net/request";
import { assembleSpan } from "../../../assemble";
import { slotsInWindow, type Tier } from "../../../keys";
import { readStore } from "../../../store";

// THE TILE READ — the range zoom's map-tile pattern (2026-09-10, convention 12's zoom made
// deep): user ranges are snowflakes, so the cacheable unit is the CALENDAR UNIT a tier is
// keyed by — one day of 5-minute buckets (`/tile/5m/2026-09-08`), one month of hourly ones
// (`/tile/1h/2026-08`). The client stitches the few units a range touches. A COMPLETE unit
// is immutable history and ships a year of s-maxage — each tile then costs Upstash one read
// per CDN region ever, which is what makes keep-forever retention readable without touching
// the read-bandwidth watch-item; the still-filling current unit gets the rolling windows'
// 300s. Runs on the read-only token like the window route.
export const runtime = "nodejs";
export const maxDuration = 15;

const DAY_MS = 86_400_000;

/** The unit's [start, end) — null for a malformed or nonsense unit. */
function unitSpan(tier: Tier, unit: string): { startMs: number; endMs: number } | null {
  if (tier === "5m") {
    const m = unit.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const startMs = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    // Round-trip guard: "2026-02-31" parses but lands in March.
    const d = new Date(startMs);
    if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
    return { startMs, endMs: startMs + DAY_MS };
  }
  const m = unit.match(/^(\d{4})-(\d{2})$/);
  if (!m || +m[2] < 1 || +m[2] > 12) return null;
  return { startMs: Date.UTC(+m[1], +m[2] - 1, 1), endMs: Date.UTC(+m[1], +m[2], 1) };
}

export async function GET(req: Request, ctx: { params: Promise<{ tier: string; unit: string }> }) {
  const { tier, unit } = await ctx.params;
  if (tier !== "5m" && tier !== "1h") {
    return NextResponse.json({ error: "tier must be 5m or 1h" }, { status: 400 });
  }
  const span = unitSpan(tier, unit);
  if (!span) return NextResponse.json({ error: "bad unit" }, { status: 400 });
  const now = Date.now();
  if (span.startMs > now) return NextResponse.json({ error: "future unit" }, { status: 400 });
  const net = netOf(req);
  try {
    const store = readStore();
    const keys = [...new Set(slotsInWindow(net, tier, span.startMs, span.endMs).map((s) => s.key))];
    const hashes: Record<string, Record<string, string>> = {};
    await Promise.all(keys.map(async (k) => {
      const h = await store.hgetall(k);
      if (h) hashes[k] = h;
    }));
    const complete = span.endMs <= now;
    return NextResponse.json(assembleSpan(net, "tile", tier, span.startMs, span.endMs, now, hashes), {
      headers: {
        "Cache-Control": complete
          ? "public, s-maxage=31536000, stale-while-revalidate=86400"
          : "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch {
    return NextResponse.json({ error: "trends store unavailable" }, { status: 503 });
  }
}
