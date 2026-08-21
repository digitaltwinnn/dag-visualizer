import { unstable_cache } from "next/cache";
import { NETWORKS, type NetworkId } from "@/src/engine/config";

// The SERVED ORDINAL WINDOW — the bound that turns the snapshot routes from a walkable surface
// into an instrument.
//
// THE LB'S OWN SERVING BAND (measured 2026-08-14): the payload host serves roughly the last
// ~240k ordinals (~78 days) and 404s older ones — NOT "~30 min" (the original premise) and NOT
// "the entire history" (2026-08-13's probe does not reproduce). So deep history 404s upstream
// on its own; this module's remaining job is the FUTURE bound and being the one place a past
// bound returns if the plan's protections change.
//
// ⚠️ THE PAST BOUND IS DROPPED (user decision, 2026-08-14): the anchor log now pages a
// network's ENTIRE snapshot history, and the payload should follow the rows — "I'm ok to drop
// it; if site visits increase and/or it's abused I'll switch to Pro to get DDoS protection."
// The accepted cost is the one this window was built against: any historical ordinal is again
// a valid anonymous request (~2.5 MB upstream pull + decode + day-long cache write, immutable
// so each ordinal costs at most once). The FUTURE bound stays — it rejects nonsense, not
// history — and the module remains the one place to re-tighten when the plan changes.
export const FUTURE_WINDOW = 5;

/** The pure bound — exported for the colocated test. `latest == null` means the reference read
 *  failed; FAIL OPEN, because the routes' own upstream fetch is about to hit the same host and
 *  will fail honestly on its own if the LB is really down — a closed gate here would only add a
 *  second failure mode in front of a working one. */
export function inServedWindow(ordinal: number, latest: number | null): boolean {
  if (latest == null) return true;
  return ordinal >= 1 && ordinal <= latest + FUTURE_WINDOW;
}

// The reference point: the LB's own latest ordinal — a tiny (~20 B) read, cached across
// requests/instances for a minute so the bound costs ~one upstream call per minute, not one per
// request. Throwing on a bad shape keeps a blip from being cached (the caller fails open).
const cachedLatest = (net: NetworkId) =>
  unstable_cache(
  async (): Promise<number> => {
    const r = await fetch(`${NETWORKS[net].l0}/global-snapshots/latest/ordinal`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) throw new Error(`l0 ${r.status}`);
    const j = (await r.json()) as { value?: unknown };
    if (typeof j?.value !== "number") throw new Error("no ordinal");
    return j.value;
  },
  ["l0-latest-ordinal-v1", net],
  { revalidate: 60 },
  )();

/** Is this ordinal one the app could legitimately be asking about? */
export async function withinServedWindow(net: NetworkId, ordinal: number): Promise<boolean> {
  let latest: number | null = null;
  try {
    latest = await cachedLatest(net);
  } catch {
    /* reference unavailable — fail open (see inServedWindow) */
  }
  return inServedWindow(ordinal, latest);
}
