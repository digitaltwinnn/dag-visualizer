import { NextResponse } from "next/server";
import { NETWORKS } from "@/src/engine/config";
import { lineageIds } from "@/src/net/lineage";
import { netOf } from "@/src/net/request";
import { explorerReader } from "../../notes/snapshotAt";
import { readWindow } from "../window";

// GET /api/ledger/window?ordinal=N — the Snapshots view's PAST WINDOW around a pinned global snapshot
// (`../window.ts`, `docs/superpowers/specs/2026-11-03-snapshots-past-window-design.md`).
// An old window never changes, so once its newest global is an hour old it is cached a year at the
// edge; before that, a minute. A window the explorer cannot read whole answers 503, never cached.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SETTLED_MS = 3_600_000;

async function getJson(url: string): Promise<{ data?: unknown; meta?: { next?: string } } | null> {
  const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000), next: { revalidate: 86_400 } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`be ${r.status}`);
  return (await r.json()) as { data?: unknown; meta?: { next?: string } };
}

export async function GET(req: Request) {
  const net = netOf(req);
  const ordinal = Number(new URL(req.url).searchParams.get("ordinal"));
  if (!Number.isInteger(ordinal) || ordinal < 1) return NextResponse.json({ error: "ordinal" }, { status: 400 });
  try {
    const answer = await readWindow({ be: NETWORKS[net].be, reader: explorerReader(net), getJson, chainIds: lineageIds(net) }, ordinal);
    if (!answer) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    const newest = Date.parse(answer.globals[answer.globals.length - 1]!.timestamp);
    const settled = Date.now() - newest > SETTLED_MS;
    return NextResponse.json(answer, {
      headers: { "Cache-Control": settled ? "public, s-maxage=31536000, immutable" : "public, s-maxage=60, stale-while-revalidate=60" },
    });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
