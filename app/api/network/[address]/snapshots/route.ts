import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { METAGRAPHS } from "@/src/net/current";

// A NETWORK'S SNAPSHOT HISTORY, ordinal-addressed (user, 2026-08-14 — "the pagination should be
// based on the total number of snapshots", then "jump to first and latest"): ordinals are
// sequential and gapless, so ANY page of a network's chain is pure arithmetic — no cursor
// walking. Two modes:
//
//   · no params  — the LIVE tip: the explorer's newest-first page, fetched fresh (its consumers
//     only ask when the user pages, so this is not a poll).
//   · ?before=N  — the ~25 ordinals N, N−1 … max(1, N−24), fetched as individual ~330 B records
//     in parallel and cached immutably (history never changes). This is what makes «/» jumps —
//     including straight to genesis, ordinal 1 — one request deep.
//
// Only CATALOG addresses are served: the explorer indexes currency metagraphs, and the app's
// unlisted/"all" lenses stay window-scoped by design (no merged history feed exists to page).

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

const mapRow = (s: BeSnap) => ({
  ordinal: s.ordinal ?? 0,
  hash: s.hash ?? "",
  parent: s.lastSnapshotHash ?? "",
  ts: s.timestamp ?? "",
  fee: s.fee ?? 0,
  sizeInKB: s.sizeInKB ?? 0,
});

async function fetchLive(address: string) {
  const r = await fetch(`${BE}/currency/${address}/snapshots?limit=${PAGE}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`be ${r.status}`);
  const j = (await r.json()) as { data?: BeSnap[] };
  return { rows: (j.data ?? []).map(mapRow) };
}

async function fetchOne(address: string, ordinal: number) {
  const r = await fetch(`${BE}/currency/${address}/snapshots/${ordinal}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`be ${r.status}`);
  const j = (await r.json()) as { data?: BeSnap };
  if (!j.data) throw new Error("bad shape");
  return mapRow(j.data);
}

async function fetchBefore(address: string, before: number) {
  const lo = Math.max(1, before - PAGE + 1);
  const ordinals: number[] = [];
  for (let o = before; o >= lo; o--) ordinals.push(o);
  const rows = await Promise.all(ordinals.map((o) => fetchOne(address, o)));
  return { rows };
}

// An ordinal range in the past is immutable — cache the assembled page for a day.
const cachedBefore = (address: string, before: number) =>
  unstable_cache(() => fetchBefore(address, before), ["network-snapshots-before-v1", address, String(before)], {
    revalidate: 86400,
  })();

export async function GET(req: Request, ctx: { params: Promise<{ address: string }> }) {
  const { address } = await ctx.params;
  if (!LISTED.has(address)) {
    return NextResponse.json({ error: "unknown network" }, { status: 404 });
  }
  const beforeRaw = new URL(req.url).searchParams.get("before");
  const before = beforeRaw == null ? null : Number(beforeRaw);
  if (before != null && (!Number.isFinite(before) || before < 1)) {
    return NextResponse.json({ error: "bad before" }, { status: 400 });
  }
  try {
    const data = before != null ? await cachedBefore(address, Math.floor(before)) : await fetchLive(address);
    return NextResponse.json(data, {
      headers:
        before != null
          ? { "Cache-Control": "public, max-age=86400, immutable" }
          : { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "upstream unavailable" }, { status: 503 });
  }
}
