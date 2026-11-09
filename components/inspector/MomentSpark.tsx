"use client";

import Hairline, { HAIRLINE_H, HAIRLINE_W } from "@/components/inspector/Hairline";
import { useTrendsRange } from "@/components/useTrendsWindow";
import { sparkGeometry, sparkPlan, sparkPoints } from "@/src/data/momentSpark";
import type { TrendMetric } from "@/src/store/store";

// THE MOMENT'S HAIRLINE (user, 2026-11-05) — the lead sentence's reading broken into the next finer
// buckets inside the moment, so the card shows at a glance whether the moment was steady or had
// ups and downs. Every decision is `src/data/momentSpark.ts`'s (which finer tier, which points,
// the stretched geometry and its breaks); this only fetches the finer slice, and `Hairline` draws it
// — the Range card's drawing too, so the two cards are one species (user, 2026-11-09).
//
// The slice rides History's own tile reads (`useTrendsRange`, the range zoom's): a finished hour's
// 5-minute day or a finished day's hourly month is one cached request, shared with any range the
// reader brushes over the same day. Until it lands, or when it fails, the card draws NOTHING here
// — a placeholder line would be a reading nobody measured (rule 10), and the lead above already
// states the figure.

/** The moment's start and end, as the bucket's own clock: an hour in the reader's time (the title
 *  above names the zone), a day as the UTC day it is (`localTime`'s rule: a day is a UTC day). */
function ends(fromMs: number, toMs: number, day: boolean): [string, string] {
  if (day) return ["00:00", "24:00 UTC"];
  const clock = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return [clock(fromMs), clock(toMs)];
}

export default function MomentSpark({
  metric,
  subject,
  stepMs,
  bucket,
}: {
  metric: TrendMetric;
  /** The network the lead sentence is about, or null for the whole network (the lead's own rule). */
  subject: string | null;
  stepMs: number;
  bucket: number;
}) {
  const plan = sparkPlan(metric, stepMs, bucket);
  const { data } = useTrendsRange(plan, "Moment card");
  const points = plan && data ? sparkPoints(metric, subject, data, plan) : null;
  if (!plan || !points) return null;
  const g = sparkGeometry(points, HAIRLINE_W, HAIRLINE_H);
  const [from, to] = ends(plan.fromMs, plan.toMs, plan.tier === "1h");
  return (
    <Hairline
      geometry={g}
      label={`The ${plan.tier === "5m" ? "five-minute" : "hourly"} readings inside this moment`}
      caption={
        <>
          <span>{from}</span>
          <span>{to}</span>
        </>
      }
    />
  );
}
