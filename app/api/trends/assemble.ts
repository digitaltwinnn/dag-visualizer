// Window assembly — hashes → the /api/trends payload. The honesty split (rule 10 in
// storage, spec): a bucket is COVERED iff its g.ticks field exists. Covered + absent
// counter = an honest 0 (the sampler looked, nothing was there). Covered + absent GAUGE
// (f.*) = null — gauges are hourly/daily point samples, not sums, and a missing sample is
// "not measured". Uncovered bucket = null across every series.
import { fieldOf, slotsInWindow, stepMsOf, type Tier } from "./keys";
import { opOf } from "./merge";

export type WindowId = "24h" | "7d" | "30d" | "90d" | "180d" | "1y";
export const WINDOWS: Record<WindowId, { tier: Tier; ms: number }> = {
  "24h": { tier: "5m", ms: 86400000 },
  "7d": { tier: "1h", ms: 604800000 },
  "30d": { tier: "1h", ms: 2592000000 },
  "90d": { tier: "1d", ms: 7776000000 },
  // The /trends doc page's window (2026-09-06, widened same day from 90d): half a year at daily
  // resolution — 181 points, the depth the rebuild tool backfills.
  "180d": { tier: "1d", ms: 15552000000 },
  "1y": { tier: "1d", ms: 31536000000 },
};

export interface TrendsPayload {
  v: 1;
  net: string;
  window: WindowId;
  tier: Tier;
  stepMs: number;
  /** Bucket START instants, epoch ms UTC, oldest → newest. */
  buckets: number[];
  series: Record<string, (number | null)[]>;
}

export function assemble(
  net: string, window: WindowId, nowMs: number,
  hashes: Record<string, Record<string, string>>,
): TrendsPayload {
  const { tier, ms } = WINDOWS[window];
  const slots = slotsInWindow(net, tier, nowMs - ms, nowMs);

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

  return { v: 1, net, window, tier, stepMs: stepMsOf(tier), buckets, series };
}
