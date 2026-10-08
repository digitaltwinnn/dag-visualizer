"use client";

import useTrendsSlice from "@/components/useTrendsSlice";
import { lastSeen } from "@/src/data/trendSeries";
import { UNLISTED_ID } from "@/src/data/unlisted";
import { bucketStamp } from "@/src/util/localTime";

/** WHEN AN UNLISTED CHANNEL LAST ANCHORED, as a sentence — the raw log's unlisted lens states it.
 *  Reads the whole measured history (daily) only while `on`. */
export function useUnlistedLastSeen(on: boolean): string {
  const slice = useTrendsSlice(on ? "all" : null, null);
  const series = slice.p?.series;
  const last = series ? lastSeen(series[`m.${UNLISTED_ID}.snaps`] ?? [], slice.buckets) : undefined;
  if (slice.error && last === undefined) return "When one last anchored could not be read.";
  return last === undefined
    ? "Reading when one last anchored…"
    : last == null
      ? "None has anchored in the measured history."
      : `The last one anchored on ${bucketStamp(last, 86_400_000, { year: true })}.`;
}
