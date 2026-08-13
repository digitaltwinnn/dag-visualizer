import { unstable_cache } from "next/cache";

// The SERVED ORDINAL WINDOW — the bound that turns the snapshot routes from a walkable surface
// into an instrument.
//
// The premise these routes were built on ("the L0 node prunes after ~30 min, so only recent
// ticks resolve") is FALSE against the live LB: it serves the entire ordinal history (verified
// 2026-08-13 — ordinal 1,000,000, years old, answers 200). Without a bound, every one of the
// ~6.7M ordinals is a valid anonymous request: a cold ~2.5 MB upstream pull, a full decode and a
// day-long data-cache write each, with no rate limiting on the Hobby plan. The app itself only
// ever asks about the retained client window (POLL.maxSnapshots = 52 ticks ≈ 25 min, plus the
// 8-tick backfill and pager steps inside that buffer), so a generous bound breaks nothing real.
//
// PAST_WINDOW is deliberately ~100× the client's deepest legitimate ask (~1.6 days of ticks at
// the measured ~28 s cadence) — the point is to be much smaller than 6.7M, not tight. The small
// FUTURE allowance covers clock/ordering skew between the explorer feed and the LB.
export const PAST_WINDOW = 5000;
export const FUTURE_WINDOW = 5;

/** The pure bound — exported for the colocated test. `latest == null` means the reference read
 *  failed; FAIL OPEN, because the routes' own upstream fetch is about to hit the same host and
 *  will fail honestly on its own if the LB is really down — a closed gate here would only add a
 *  second failure mode in front of a working one. */
export function inServedWindow(ordinal: number, latest: number | null): boolean {
  if (latest == null) return true;
  return ordinal >= latest - PAST_WINDOW && ordinal <= latest + FUTURE_WINDOW;
}

const L0 = "https://l0-lb-mainnet.constellationnetwork.io";

// The reference point: the LB's own latest ordinal — a tiny (~20 B) read, cached across
// requests/instances for a minute so the bound costs ~one upstream call per minute, not one per
// request. Throwing on a bad shape keeps a blip from being cached (the caller fails open).
const cachedLatest = unstable_cache(
  async (): Promise<number> => {
    const r = await fetch(`${L0}/global-snapshots/latest/ordinal`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) throw new Error(`l0 ${r.status}`);
    const j = (await r.json()) as { value?: unknown };
    if (typeof j?.value !== "number") throw new Error("no ordinal");
    return j.value;
  },
  ["l0-latest-ordinal-v1"],
  { revalidate: 60 },
);

/** Is this ordinal one the app could legitimately be asking about? */
export async function withinServedWindow(ordinal: number): Promise<boolean> {
  let latest: number | null = null;
  try {
    latest = await cachedLatest();
  } catch {
    /* reference unavailable — fail open (see inServedWindow) */
  }
  return inServedWindow(ordinal, latest);
}
