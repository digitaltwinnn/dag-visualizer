import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { METAGRAPHS } from "@/src/engine/config";
import { classifyActivity } from "@/src/data/currencyActivity";
import type { CurrencyActivity } from "@/src/data/types";

export const maxDuration = 30;

const BE = "https://be-mainnet.constellationnetwork.io";

async function lastTxTs(id: string): Promise<string | null> {
  try {
    const r = await fetch(`${BE}/currency/${id}/transactions?limit=1`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { data?: { timestamp?: string }[] };
    return j?.data?.[0]?.timestamp ?? null;
  } catch {
    return null; // a metagraph with no currency answers nothing — that IS the reading
  }
}

async function fetchActivity(): Promise<CurrencyActivity[]> {
  const now = Date.now();
  const items = await Promise.all(
    METAGRAPHS.map(async (m): Promise<CurrencyActivity> => {
      const lastTs = await lastTxTs(m.id);
      return { metaId: m.id, lastTs, state: classifyActivity(lastTs, now) };
    }),
  );
  if (!items.length) throw new Error("empty");
  return items;
}

const cached = unstable_cache(fetchActivity, ["currency-activity"], { revalidate: 600 });

export async function GET() {
  try {
    return NextResponse.json({ items: await cached() });
  } catch {
    return NextResponse.json({ error: "currency activity unavailable" }, { status: 503 });
  }
}
