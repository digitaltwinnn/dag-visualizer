import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { METAGRAPHS } from "@/src/engine/config";

// A NETWORK'S SNAPSHOT HISTORY, paged (user, 2026-08-14 — "the pagination should be based on the
// total number of snapshots, not what we see in our buffers"): a thin proxy over the block
// explorer's cursor-paged per-currency snapshot listing. The explorer serves the ENTIRE chain,
// newest first, ~25 tiny records a page — no 2.5 MB pulls anywhere on this path.
//
// Ordinals are sequential, so the network's latest ordinal IS its lifetime total and a row's
// position in the newest-first order is `latest − ordinal + 1` — the client derives every pager
// number from the rows themselves; this route only hands pages through.
//
// CACHING: a CURSORED page starts from a fixed hash, so its content is immutable — cached a day.
// The FIRST page (no cursor) is the live tip and is fetched fresh each time (its consumers only
// ask when the user pages past the client's own window, so this is not a poll).
//
// Only CATALOG addresses are served: the explorer indexes currency metagraphs, and the app's
// unlisted/"all" lenses stay window-scoped by design (the user's own call — no merged history
// feed exists to page).

export const maxDuration = 15;

const BE = "https://be-mainnet.constellationnetwork.io";
const LISTED = new Set(METAGRAPHS.map((m) => m.id));
const PAGE = 25;

interface BeSnap {
  hash?: string;
  ordinal?: number;
  lastSnapshotHash?: string;
  timestamp?: string;
  fee?: number;
  sizeInKB?: number;
}

async function fetchPage(address: string, cursor: string | null) {
  const url = `${BE}/currency/${address}/snapshots?limit=${PAGE}${cursor ? `&next=${encodeURIComponent(cursor)}` : ""}`;
  const r = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`be ${r.status}`);
  const j = (await r.json()) as { data?: BeSnap[]; meta?: { next?: string } };
  const rows = (j.data ?? []).map((s) => ({
    ordinal: s.ordinal ?? 0,
    hash: s.hash ?? "",
    parent: s.lastSnapshotHash ?? "",
    ts: s.timestamp ?? "",
    fee: s.fee ?? 0,
    sizeInKB: s.sizeInKB ?? 0,
  }));
  return { rows, next: j.meta?.next ?? null };
}

const cachedPage = (address: string, cursor: string) =>
  unstable_cache(() => fetchPage(address, cursor), ["network-snapshots-v1", address, cursor], {
    revalidate: 86400, // a cursored page starts from a fixed hash — immutable content
  })();

export async function GET(req: Request, ctx: { params: Promise<{ address: string }> }) {
  const { address } = await ctx.params;
  if (!LISTED.has(address)) {
    return NextResponse.json({ error: "unknown network" }, { status: 404 });
  }
  const cursor = new URL(req.url).searchParams.get("cursor");
  try {
    const data = cursor ? await cachedPage(address, cursor) : await fetchPage(address, null);
    return NextResponse.json(data, {
      headers: cursor
        ? { "Cache-Control": "public, max-age=86400, immutable" }
        : { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "upstream unavailable" }, { status: 503 });
  }
}
