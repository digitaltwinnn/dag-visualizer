"use client";

import { useMemo } from "react";

import type { TrendsSlice } from "@/components/useTrendsSlice";
import { trendRoster, trendScope, type TrendScope } from "@/src/data/trendScope";
import {
  TREND_METRICS,
  globalSeries,
  lastMeasured,
  metricSeries,
  metricUnit,
  rankByLast,
  trimCounterEdges,
  type MetricSeries,
} from "@/src/data/trendSeries";
import { displayNetwork } from "@/src/data/unlisted";
import type { TrendMetric } from "@/src/store/store";

// ONE ROSTER PASS FOR THE STACK AND BOTH RAILS (2026-09-19).
//
// The History view now has three surfaces asking the same question: the chart PLANES, the left
// rail's Layers list, and the right rail's cursor card. "Which networks, in what order, drawn
// against which axis, and what did each one measure" is one answer, and three copies of it would
// be three chances to disagree about the ranking the planes are laid out by — a rail row naming a
// plane that is not there, a value that does not match the chart beside it.
//
// It is also EXPENSIVE by construction: `metricSeries` copies or maps every bucket of every
// series it touches, and the whole view re-renders on every cursor write. So this is memoised on
// what the answer actually depends on — the committed filter (which IS the roster; the catalog is
// a module constant), the metric, and the payload's own series/axis REFERENCES, which
// `useTrendsSlice` holds still across a render that changed none of its inputs. The cursor is in
// none of them.
//
// NOT A FETCH. The slice is passed IN rather than fetched here, for two reasons: the stack's own
// boundary test requires it to read `useTrendsSlice` directly (one window data path, two
// registers), and a hook that fetched would make every consumer's window a second opinion about
// what is on screen. Each caller reads the store's window and hands the slice over.
//
// THE COUNTER TRIM LIVES HERE TOO. A counter's partial edge buckets are dropped (`trimCounterEdges`
// — a partial sum drawn whole reads as a crash), and the axis is cut by the same call. That has to
// be ONE decision: if the rail read the untrimmed series while the planes drew the trimmed one, a
// cursor parked on the newest bucket would show the card a number no chart on screen agrees with.

/** One network's row of the answer. */
export interface TrendRosterRow {
  id: string;
  /** The display name, never the id — identity is named in text, never colour alone. */
  name: string;
  hue: string;
  /** The series as DRAWN: already cut by the metric's own edge rule. */
  series: MetricSeries;
  /** The newest MEASURED value, which is not the newest bucket (`lastMeasured`). */
  last: number | null;
}

export interface TrendRosterView {
  /** The ranked ids, busiest first. STABLE BY CONTENT — a new reference only when the list
   *  itself moves, which is what the `trendIds` publish channel requires of its publisher. */
  ranked: readonly string[];
  rows: ReadonlyMap<string, TrendRosterRow>;
  /** The WHOLE NETWORK's series for this metric (`globalSeries`) — the reading a surface states
   *  when no one network is the subject. Cut by the SAME edge rule as the per-network rows, which
   *  is exactly why it lives here: read straight off the payload it is one bucket out of step with
   *  the axis, and a cursor then quotes yesterday's number (caught live, 2026-09-19). */
  global: (number | null)[];
  /** The axis every row is drawn against, cut by the same rule the series were. */
  buckets: number[];
  /** The cadence of those buckets — the unit word, the stamp's precision and the cursor's
   *  containment all follow it. */
  stepMs: number;
  /** The unit word at this cadence, and the ONE value formatter every surface renders with —
   *  already resolved, so a rail and a chart can never print the same number two ways. */
  unit: string;
  format: (v: number) => string;
  /** A GAUGE metric whose hourly payload has not landed yet — say so, don't draw an empty plot. */
  pending: boolean;
  /** What the committed filter has done to the view (`src/data/trendScope.ts`). */
  scope: TrendScope;
}

const NO_SERIES: Readonly<Record<string, (number | null)[]>> = {};

/** `TrendChart`'s own default, restated once so the rails format exactly as the charts do for the
 *  metrics that state no formatter of their own (snapshots, blocks, nodes). */
const PLAIN = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 1 });

/** WHAT AN UNMEASURED BUCKET SAYS, in words (rule 10). A gap is not a zero, and every surface that
 *  can show one — the Layers list's last reading, the cursor card's per-network rows — says it the
 *  same way. */
export const NO_READING = "no reading";

/** The roster, its series and its scope for one filter × metric over one fetched slice. */
export default function useTrendRoster(
  slice: TrendsSlice,
  filter: string,
  metric: TrendMetric,
): TrendRosterView {
  const spec = TREND_METRICS[metric];
  // A GAUGE reads the FLEET's window — hourly where the main one is finer than the gauges are
  // written — and a counter reads the main one. Rank, ceiling, axis and unit all take the same
  // source, or a chart would draw one window's points against another's dates.
  const gauge = spec.kind === "gauge";
  const src = gauge ? slice.pF : slice.p;
  const series = src?.series ?? NO_SERIES;
  const rawAxis = gauge ? slice.fBuckets : slice.buckets;
  const stepMs = gauge ? slice.fStep : slice.stepMs;
  const scope = trendScope(filter);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `spec` is TREND_METRICS[metric]
  const pass = useMemo(() => {
    const counter = spec.kind === "counter";
    const cut = <T,>(a: readonly T[]): T[] => (counter ? trimCounterEdges(a, stepMs) : a.slice());
    const ids = trendRoster(filter);
    const rows = new Map<string, TrendRosterRow>();
    for (const id of ids) {
      const s = metricSeries(metric, id, series);
      const net = displayNetwork(id);
      const points = cut(s.points);
      rows.set(id, {
        id,
        name: net?.name ?? id,
        hue: net?.hue ?? "var(--primary)",
        series: {
          points,
          sampled: s.sampled && cut(s.sampled),
          gaps: s.gaps && cut(s.gaps),
        },
        last: lastMeasured(points),
      });
    }
    return {
      rows,
      order: rankByLast(ids, (id) => rows.get(id)!.series.points),
      buckets: cut(rawAxis),
      global: cut(globalSeries(metric, series)),
    };
  }, [filter, metric, series, rawAxis, stepMs]);

  // STABILISED BY CONTENT (the `trendIds` channel's rule, which the stack publishes from this
  // value): the rank is recomputed whenever the memo above is, and the engine's change signal is
  // `!==` on the array — so a fresh reference on an unchanged list would retarget the projector's
  // ease and the stack would never settle. Keying on the joined ids publishes exactly when the
  // CONTENT moves.
  const rankedKey = pass.order.join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ranked = useMemo(() => pass.order, [rankedKey]);

  return {
    ranked,
    rows: pass.rows,
    global: pass.global,
    buckets: pass.buckets,
    stepMs,
    unit: metricUnit(metric, stepMs),
    format: spec.format ?? PLAIN,
    pending: gauge && slice.fleetPending,
    scope,
  };
}
