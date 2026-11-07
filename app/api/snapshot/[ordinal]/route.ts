import { NextResponse } from "next/server";
import { netOf } from "@/src/net/request";
import { pairHashes } from "../decodeBlocks";
import { cachedBlockHashes, cachedExact } from "../cachedExact";
import { withinServedWindow } from "../ordinalWindow";

// EXACT per-tick anchor totals, read straight from the raw L0 global snapshot. The block explorer
// only gives `metagraphSnapshotCount`; the L0 node's `stateChannelSnapshots` carries EVERY anchored
// metagraph snapshot with its own `value.fee`, so summing them yields the exact total fee + the
// precise per-metagraph breakdown — INCLUDING unlisted metagraphs (no directory needed). The raw
// payload is heavy (~2.5 MB on a big tick), so this runs server-side and returns a tiny JSON,
// cached per ordinal (ordinals are immutable) — one fetch is shared across every client/render.
// ⚠️ The LB's serving depth is a per-request lottery (see CLAUDE.md's payload-depth note), so
// the pull goes through fetchGlobal.ts, which falls back to known-archival nodes on a 404;
// ordinalWindow.ts still bounds the future, and a failure here leaves the client on the polled
// floor either way.

export const maxDuration = 60;

export async function GET(req: Request, ctx: { params: Promise<{ ordinal: string }> }) {
  const { ordinal } = await ctx.params;
  const net = netOf(req);
  const n = Number(ordinal);
  if (!Number.isFinite(n) || n < 0) {
    return NextResponse.json({ error: "bad ordinal" }, { status: 400 });
  }
  if (!(await withinServedWindow(net, n))) {
    // Outside the window this app can ever ask about (ordinalWindow.ts) — refuse without
    // touching the upstream, so the route isn't an anonymous walk over ~6.7M ordinals.
    return NextResponse.json({ available: false, ordinal: n }, { status: 404 });
  }
  try {
    const data = await cachedExact(net, n);
    let complete = true;
    if (data.blocks?.length) {
      const hashes = await cachedBlockHashes(net, n).catch(() => [] as string[]);
      ({ blocks: data.blocks, complete } = pairHashes(data.blocks, hashes));
    }
    return NextResponse.json(data, {
      // `s-maxage` too (2026-10-18): the live tip and the cold-load backfill ask every visitor for
      // the SAME ordinals, and with `max-age` alone only each browser kept them — the CDN missed
      // 96% of the week's 5,233 calls and every one reached the load balancer. An ordinal is
      // immutable, so the edge may keep it as long as the browser does; a 404 carries no header.
      // Blocks the explorer has not named yet carry `hash: ""`: a short edge life, so the CDN and the
      // browser ask again soon rather than keeping the hashless answer for a day.
      headers: { "Cache-Control": complete ? "public, max-age=86400, s-maxage=86400, immutable" : "public, max-age=0, s-maxage=30" },
    });
  } catch {
    // Transiently unavailable (not yet finalized / upstream blip) — client keeps the polled floor.
    return NextResponse.json({ available: false, ordinal: n }, { status: 404 });
  }
}

