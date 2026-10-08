// WHICH OF A BATCH OF SNAPSHOTS JUST ARRIVED (user, 2026-10-08: coming back to the tab after a
// while, "the hyper view is animating all the snapshots during the time I was away … for
// presentation not really needed"). The poll keeps running in a background tab — throttled, but
// running — and every catch-up batch it records is emitted as one `anchor` event whose count the
// Hypergraph turns into packets; the render loop, paused meanwhile, then drained an hour of them on
// return. A packet says "this snapshot anchored just now", so a batch is split by the snapshots'
// OWN timestamps: the ones younger than `LIVE_ARRIVAL_MS` are arrivals, the rest is history the
// scene has no honest beat for (the seed takes the same view of a cold buffer).

/** Younger than this, a snapshot is an ARRIVAL the scene may animate. Wide enough for the
 *  explorer's indexing lag behind the chain plus one poll, narrow enough that a minute away
 *  replays nothing. */
export const LIVE_ARRIVAL_MS = 60_000;

/** How many of `timestamps` (ISO strings) are at most `windowMs` old at `nowMs`. An unparsable
 *  stamp is not an arrival. */
export function liveArrivals(timestamps: readonly string[], nowMs: number, windowMs = LIVE_ARRIVAL_MS): number {
  let n = 0;
  for (const ts of timestamps) {
    const t = Date.parse(ts);
    if (Number.isFinite(t) && nowMs - t <= windowMs) n++;
  }
  return n;
}
