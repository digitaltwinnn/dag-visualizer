// Window assembly — hashes → the /api/trends payload. The honesty split (rule 10 in
// storage, spec): a bucket is COVERED iff its g.ticks field exists. Covered + absent
// counter = an honest 0 (the sampler looked, nothing was there). Covered + absent GAUGE
// (f.*) = null — gauges are hourly/daily point samples, not sums, and a missing sample is
// "not measured". Uncovered bucket = null across every series.
import { fieldOf, slotsInWindow, stepMsOf, type Tier } from "./keys";
import { opOf } from "./merge";

export type WindowId = "24h" | "7d" | "30d" | "90d" | "180d" | "1y" | "all";
export const WINDOWS: Record<WindowId, { tier: Tier; ms: number }> = {
  "24h": { tier: "5m", ms: 86400000 },
  "7d": { tier: "1h", ms: 604800000 },
  "30d": { tier: "1h", ms: 2592000000 },
  // 90d/180d currently have no consumer (the /trends page reads 24h/7d/30d/1y) — kept as
  // cheap API surface: a window is one table row, and removing one breaks any caller for a
  // rounding error of savings.
  "90d": { tier: "1d", ms: 7776000000 },
  "180d": { tier: "1d", ms: 15552000000 },
  "1y": { tier: "1d", ms: 31536000000 },
  // "all" = everything the store can hold (user, 2026-09-09 — the backfill reaches past a
  // year, and both zoom rims want an everything view). Six years of daily slots: covers the
  // global chain's own 2022 genesis with room to grow, and the cost of the unmeasured years
  // is a run of nulls that gzips to almost nothing (missing year hashes read back empty) —
  // consumers leading-trim to where measuring began, so the honest span is derived, not
  // asserted here.
  all: { tier: "1d", ms: 189216000000 },
};

export interface TrendsPayload {
  v: 1;
  net: string;
  /** "tile" for the map-tile route's unit payloads (2026-09-10). */
  window: WindowId | "tile";
  tier: Tier;
  stepMs: number;
  /** Server clock at assembly — the only honest "now" a CDN-cached payload can be trimmed
   *  against (the client's clock misjudges which bucket is still filling). */
  now: number;
  /** Bucket START instants, epoch ms UTC, oldest → newest. */
  buckets: number[];
  series: Record<string, (number | null)[]>;
}

export function assemble(
  net: string, window: WindowId, nowMs: number,
  hashes: Record<string, Record<string, string>>,
): TrendsPayload {
  const { tier, ms } = WINDOWS[window];
  return assembleSpan(net, window, tier, nowMs - ms, nowMs, nowMs, hashes);
}

/** The window body over an ARBITRARY [startMs, endMs) span — assemble() delegates here, and
 *  the tile route (2026-09-10, the range zoom's map-tile reads) calls it with a calendar
 *  unit's own bounds. Same honesty contract: uncovered bucket → null everywhere, covered +
 *  absent counter → 0, covered + absent gauge → null. */
export function assembleSpan(
  net: string, window: WindowId | "tile", tier: Tier, startMs: number, endMs: number, nowMs: number,
  hashes: Record<string, Record<string, string>>,
): TrendsPayload {
  // slotsInWindow is END-INCLUSIVE (the rolling windows want their newest bucket); a SPAN is
  // half-open [start, end) so adjacent tiles can never share a boundary bucket — stitching
  // duplicates it otherwise.
  const slots = slotsInWindow(net, tier, startMs, endMs - 1);

  // Collect every series name present in any hash of this window.
  const names = new Set<string>();
  for (const h of Object.values(hashes)) {
    for (const f of Object.keys(h)) {
      const bar = f.indexOf("|");
      if (bar > 0) names.add(f.slice(bar + 1));
    }
  }

  const buckets = slots.map((s) => s.tsMs);
  const series: Record<string, (number | null)[]> = {};
  for (const name of names) series[name] = new Array(slots.length).fill(null);

  slots.forEach((slot, i) => {
    const h = hashes[slot.key];
    const covered = h?.[fieldOf(slot.bucket, "g.ticks")] != null;
    if (!covered) return; // every series stays null — not measured
    for (const name of names) {
      const raw = h[fieldOf(slot.bucket, name)];
      if (raw != null) series[name][i] = Number(raw);
      else if (opOf(name) !== "set") series[name][i] = 0; // covered counter → honest zero
      // covered but unsampled gauge stays null
    }
  });

  return { v: 1, net, window, tier, stepMs: stepMsOf(tier), now: nowMs, buckets, series };
}
