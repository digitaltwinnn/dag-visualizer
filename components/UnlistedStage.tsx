"use client";

import useTrendsSlice from "@/components/useTrendsSlice";
import { lastSeen, unlistedSeries } from "@/src/data/trendSeries";
import { LISTED_IDS, UNLISTED_ID } from "@/src/data/unlisted";
import { VIEW_POLICIES } from "@/src/engine/domain/viewPolicy";
import { useStore } from "@/src/store/store";
import { bucketStamp } from "@/src/util/localTime";

/** WHEN AN UNLISTED CHANNEL LAST ANCHORED, as a sentence — the stage note's and the raw log's one
 *  answer. Reads the whole measured history (daily) only while `on`. */
export function useUnlistedLastSeen(on: boolean): string {
  const slice = useTrendsSlice(on ? "all" : null, null);
  const series = slice.p?.series;
  const last = series ? lastSeen(unlistedSeries(series, (id) => LISTED_IDS.has(id)), slice.buckets) : undefined;
  if (slice.error && last === undefined) return "When one last anchored could not be read.";
  return last === undefined
    ? "Reading when one last anchored…"
    : last == null
      ? "None has anchored in the measured history."
      : `The last one anchored on ${bucketStamp(last, 86_400_000, { year: true })}.`;
}

// THE UNLISTED SET, SAID ON THE STAGE (the Unlisted audit, 2026-10-07: under the Unlisted filter the
// Hypergraph read as a rendering fault — every hub dimmed, nothing saying there was nothing to
// show). Unlisted channels anchor into the global ledger without a catalog entry: no hub, no
// nodes, no place on the globe. The structural views therefore have no SUBJECT to draw for them,
// and this one quiet line says so — and says what IS known: when the last one anchored, measured
// as the global count less every listed network (`unlistedSeries`, the History row's own reading).
//
// Only in the views that draw a scene and no chart stack: History states its own scope.
export default function UnlistedStage() {
  const mode = useStore((s) => s.mode);
  const filter = useStore((s) => s.filter);
  const policy = VIEW_POLICIES[mode];
  const on = filter === UNLISTED_ID && policy.canvas && !policy.chartStack;
  const when = useUnlistedLastSeen(on);
  if (!on) return null;
  return (
    <div
      role="status"
      className="absolute left-1/2 top-1/2 z-[5] -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none max-w-[min(30rem,calc(100vw-2rem))] rounded-md border border-border bg-[var(--panel-solid)] px-4 py-3 text-center text-body text-foreground-dim backdrop-blur-[8px]"
    >
      <p className="m-0">Unlisted channels anchor into the ledger without a catalog entry, so they have no nodes to show here.</p>
      <p className="m-0 mt-1 text-muted-foreground">{when}</p>
    </div>
  );
}
