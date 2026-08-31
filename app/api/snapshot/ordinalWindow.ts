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

// The reference point: the LB's own latest ordinal — a tiny (~20 B) read.
//
// ⚠️ AN EXPLICIT TTL, NOT `unstable_cache`. It was the latter, and the entry went stale and STOPPED
// REVALIDATING over the process's lifetime. Measured live 2026-08-31 on a dev server that had been
// up a few hours: the reference sat 148 ordinals — about 70 minutes — behind the LB, and a restart
// snapped it back to 0 behind. That is not a caching nicety here, it is a CORRECTNESS gate: every
// ordinal above `latest + FUTURE_WINDOW` was refused in ~5ms without the upstream ever being
// asked, so the exact read failed for the live tick and the whole recent trail while the raw
// snapshot was sitting there, served in 1.6s. The symptom is a rising tide — the longer the
// process runs, the more of the present it denies — which is the worst shape for a host that
// keeps instances warm (Vercel's Fluid Compute reuses them; "Vercel never restarts").
//
// So the TTL is a plain module-scope timestamp: no framework revalidation semantics between this
// gate and the truth. Per-instance rather than shared, which costs at most one 20-byte read per
// instance per minute — a price worth paying to make a correctness gate deterministic.
const REF_TTL_MS = 60_000;
// ⚠️ THE FORCED RE-READ NEEDS ITS OWN FLOOR, or it hands back the abuse bound the gate exists for:
// every out-of-window request would force an uncoalesced upstream call, so a loop over nonsense
// ordinals costs one ~4s L0 round trip EACH instead of being refused for free. Within the floor a
// burst of refusals shares a single read — which loses nothing, because the case the force exists
// for is a reference stale by MINUTES, not by five seconds.
const REF_FLOOR_MS = 5_000;
const refCache = new Map<NetworkId, { value: number; at: number }>();

async function readLatest(net: NetworkId): Promise<number> {
  const r = await fetch(`${NETWORKS[net].l0}/global-snapshots/latest/ordinal`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(4000),
  });
  if (!r.ok) throw new Error(`l0 ${r.status}`);
  const j = (await r.json()) as { value?: unknown };
  if (typeof j?.value !== "number") throw new Error("no ordinal");
  return j.value;
}

/** The reference, refreshed past its TTL. Throwing keeps a blip from being stored (caller fails open). */
async function latestOrdinal(net: NetworkId, force = false): Promise<number> {
  const hit = refCache.get(net);
  const age = hit ? Date.now() - hit.at : Infinity;
  if (hit && age < (force ? REF_FLOOR_MS : REF_TTL_MS)) return hit.value;
  const value = await readLatest(net);
  refCache.set(net, { value, at: Date.now() });
  return value;
}

/** Is this ordinal one the app could legitimately be asking about?
 *
 *  ⚠️ A REFUSAL RE-READS FIRST. Refusing is the expensive mistake — it denies a real ordinal
 *  without asking upstream — and the only way to refuse wrongly is a stale reference. So a
 *  would-be refusal spends one forced 20-byte read to be sure. That is bounded by construction:
 *  normal traffic is inside the window and never reaches it, and a genuine walk over nonsense
 *  ordinals pays one tiny read per request, not the ~400 KB snapshot pull the gate exists to
 *  prevent. It also makes the gate self-healing whatever the cache underneath it does. */
export async function withinServedWindow(net: NetworkId, ordinal: number): Promise<boolean> {
  let latest: number | null = null;
  try {
    latest = await latestOrdinal(net);
    if (!inServedWindow(ordinal, latest)) latest = await latestOrdinal(net, true);
  } catch {
    // FAIL OPEN, and that means DISCARDING what we had. Leaving the first read's value here would
    // refuse the ordinal on the very reference the forced re-read was called to distrust — a
    // transient LB blip would then deny a perfectly servable ordinal, which is the failure this
    // whole function was rewritten to prevent.
    latest = null;
  }
  return inServedWindow(ordinal, latest);
}
