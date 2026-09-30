"use client";

import { useMemo } from "react";

import type { TrendsSlice } from "@/components/useTrendsSlice";
import { stackRoster, viewScope, type TrendScope } from "@/src/data/trendScope";
import {
  TREND_METRICS,
  globalSeries,
  lastMeasured,
  latestDay,
  metricSeries,
  metricUnit,
  rankByLast,
  spanAverage,
  stepFor,
  trimCounterEdges,
  type MetricSeries,
} from "@/src/data/trendSeries";
import { displayNetwork } from "@/src/data/unlisted";
import type { TrendMetric } from "@/src/store/store";

// ONE ROSTER PASS FOR THE STACK AND BOTH RAILS (2026-09-19).
//
// The History view now has three surfaces asking the same question: the chart PLANES, the left
// rail's Networks list, and the right rail's cursor card. "Which networks, in what order, drawn
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
  /** The newest complete DAY (`latestDay`; user, 2026-09-29: "day should be the standard always")
   *  — the `head` under a window shorter than a day. Null while the daily tier is in flight. */
  day: number | null;
  /** THE SPAN READING (`spanAverage`; design A, 2026-09-29 — "the explorer follows the range"):
   *  this network over the whole window on screen, an average per day for a rate — the `head`
   *  over a window of a day or more, so a new range re-ranks the list AND the stack. */
  span: number | null;
  /** THE HEAD READING — the ONE number every surface states for this network: the Networks list's
   *  figure, the plane's headline and the rank (user, 2026-09-29: "didn't we agree to keep it
   *  consistent"). `span` where the window holds at least a day, else `day` — see `headKind`. */
  head: number | null;
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
  /** The payload's OWN axis, before the counter edge trim. Exposed so a surface can tell the two
   *  reasons an instant has no chart apart (`placeInstant`): a bucket that is in the window but
   *  still filling is a different fact from one the window does not reach, and only the second has
   *  a gesture that answers it. Identical to `buckets` for a gauge, which trims nothing. */
  rawBuckets: readonly number[];
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
  /** The daily tier behind every row's `day` is still in flight (the charts are finer than a
   *  day and it hasn't landed) — surfaces say "acquiring", never a finer reading or "no reading". */
  dayPending: boolean;
  /** WHICH reading `head` is. "span": the average per day over a window of at least a day. "day":
   *  the latest full day, for a window SHORTER than one — averaging an hour "per day" would scale a
   *  measured hour into a day nobody measured (rule 10), so there the day is the honest reading. */
  headKind: "span" | "day";
}

const NO_SERIES: Readonly<Record<string, (number | null)[]>> = {};

/** `TrendChart`'s own default, restated once so the rails format exactly as the charts do for the
 *  metrics that state no formatter of their own (snapshots, blocks, nodes). */
// Whole numbers: every metric that falls back to this is a COUNT (snapshots, blocks, nodes), and
// an average of counts stated to a decimal ("1,978.7 a day") claims precision the reading lacks.
const PLAIN = (v: number) => Math.round(v).toLocaleString();

/** WHAT AN UNMEASURED BUCKET SAYS, in words (rule 10). A gap is not a zero, and every surface that
 *  can show one — the Networks list's last reading, the cursor card's per-network rows — says it the
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
  // The daily tier behind the head reading (`latestDay`); undefined where the chart is already daily.
  const daily = slice.daily?.series;
  const rawAxis = gauge ? slice.fBuckets : slice.buckets;
  // THE GRAIN, from the one home that decides it (`stepFor`) — the band's timeline asks the very
  // same question, and a second copy of this ternary is how the band came to quantise at five
  // minutes over charts drawn in hours (2026-09-19).
  const stepMs = stepFor(slice, metric);
  // The SCENE's scope: the DAG is a network here (its own plane), not the document's empty state.
  const scope = viewScope(filter);
  // The window's own span, from the payload's axis before any edge trim. A day's worth of the
  // finest tier is 288 five-minute buckets; one bucket short of a day still counts as the day.
  const headKind: "span" | "day" = rawAxis.length * stepMs >= 86_400_000 - stepMs ? "span" : "day";

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `spec` is TREND_METRICS[metric]
  const pass = useMemo(() => {
    const counter = spec.kind === "counter";
    const cut = <T,>(a: readonly T[]): T[] => (counter ? trimCounterEdges(a, stepMs) : a.slice());
    const ids = stackRoster(filter);
    const rows = new Map<string, TrendRosterRow>();
    for (const id of ids) {
      // THE HYPERGRAPH'S OWN SERIES is the global one (`globalSeries` — the same read the Moment
      // card's whole-network lead and the band's overview make), with no sampling or gap marks:
      // those are per-metagraph facts. Every other id reads its own `m.<id>.*` rows.
      const s = id === "dag" ? { points: globalSeries(metric, series), sampled: undefined, gaps: undefined } : metricSeries(metric, id, series);
      const net = displayNetwork(id);
      const points = cut(s.points);
      // Continuity's weights: the snapshots each bucket's spacing was measured over.
      const weights =
        metric === "continuity" ? cut(id === "dag" ? globalSeries("snapshots", series) : metricSeries("snapshots", id, series).points) : undefined;
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
        day: latestDay(metric, id, daily, points, stepMs),
        span: spanAverage(metric, points, stepMs, weights),
        head: null,
      });
      const r = rows.get(id)!;
      r.head = headKind === "span" ? r.span : r.day;
    }
    return {
      rows,
      // Busiest OVER THE SPAN the list states (design A) — the window on screen, so a new range
      // re-ranks the list and the stack together. The day, then the last reading, only where the
      // span has nothing measured, so a quiet network still sorts by what it last said.
      order: rankByLast(ids, (id) => {
        const r = rows.get(id)!;
        return [r.head ?? r.day ?? r.last];
      }),
      buckets: cut(rawAxis),
      global: cut(globalSeries(metric, series)),
    };
  }, [filter, metric, series, rawAxis, stepMs, daily, headKind]);

  // STABILISED BY CONTENT (the `trendIds` channel's rule, which the stack publishes from this
  // value): the rank is recomputed whenever the memo above is, and the engine's change signal is
  // `!==` on the array — so a fresh reference on an unchanged list would retarget the projector's
  // ease and the stack would never settle. Keying on the joined ids publishes exactly when the
  // CONTENT moves.
  const rankedKey = pass.order.join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ranked = useMemo(() => pass.order, [rankedKey]);

  // ⚠️ THE VIEW OBJECT IS MEMOISED TOO, NOT JUST THE PASS INSIDE IT (2026-09-19). A
  // fresh `{…}` here every render is content-free churn that a consumer's `useMemo([roster])`
  // cannot tell apart from a real change — and it defeated the whole point of this hook's memo
  // exactly once, in the stack's `sharedMax` and its per-plane `lines`, where a scrub rebuilt both
  // on every bucket write and re-rendered five recharts trees behind them. The symptom is
  // invisible: the numbers are right, the frame rate is not. Every field below is either the
  // memoised pass, a stable slice reference, or derived from a primitive dep.
  const pending = gauge && slice.fleetPending;
  // Acquiring only while the read can still land: a failed daily leg is no reading (rule 10's
  // give-up path — stars that never resolve are a fabricated state).
  const dayPending = stepMs < 86_400_000 && !slice.daily && !slice.dailyError;
  const unit = metricUnit(metric, stepMs);
  const format = spec.format ?? PLAIN;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `format` is TREND_METRICS[metric]'s
  return useMemo(
    () => ({
      ranked,
      rows: pass.rows,
      global: pass.global,
      buckets: pass.buckets,
      rawBuckets: rawAxis,
      stepMs,
      unit,
      format,
      pending,
      dayPending,
      scope,
      headKind,
    }),
    [ranked, pass, rawAxis, stepMs, unit, format, pending, dayPending, scope, headKind],
  );
}
