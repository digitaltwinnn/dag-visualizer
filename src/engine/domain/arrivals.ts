// WHICH OF A BATCH OF SNAPSHOTS JUST ARRIVED (user, 2026-10-08: coming back to the tab after a
// while, "the hyper view is animating all the snapshots during the time I was away … for
// presentation not really needed"). The poll keeps running in a background tab — throttled, but
// running — and every catch-up batch it records is emitted as one `anchor` event whose count the
// Hypergraph turns into packets; the render loop, paused meanwhile, then drained an hour of them on
// return. A packet says "this snapshot anchored just now", so a batch is split by the snapshots'
// OWN timestamps: the ones within `LIVE_ARRIVAL_MS` of the batch's NEWEST stamp are arrivals, the
// rest is history the scene has no honest beat for (the seed takes the same view of a cold buffer).
//
// ⚠️ MEASURED AGAINST THE BATCH, NOT THE WALL CLOCK (the PR review): an explorer that indexes a
// chain a minute or two behind, or a client clock that runs slow, would have made every stamp
// "old" and silenced the packets for good. The batch's own newest stamp is the one clock both the
// data and the beat agree on; a steady poll's batch spans seconds, a backlog spans the absence.

/** How far behind a batch's newest stamp a snapshot still counts as an ARRIVAL. A steady poll's
 *  batch spans a few seconds to a tick; a background tab's backlog spans minutes or hours. */
export const LIVE_ARRIVAL_MS = 60_000;

/** How many of `timestamps` (ISO strings) fall within `windowMs` of the batch's newest stamp. An
 *  unparsable stamp is not an arrival; an empty batch has none. */
export function liveArrivals(timestamps: readonly string[], windowMs = LIVE_ARRIVAL_MS): number {
  let newest = -Infinity;
  const parsed: number[] = [];
  for (const ts of timestamps) {
    const t = Date.parse(ts);
    if (!Number.isFinite(t)) continue;
    parsed.push(t);
    if (t > newest) newest = t;
  }
  let n = 0;
  for (const t of parsed) if (newest - t <= windowMs) n++;
  return n;
}
