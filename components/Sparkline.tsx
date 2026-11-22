"use client";

import { useId } from "react";
import { Area, ComposedChart, Line, YAxis, ResponsiveContainer } from "recharts";

import { cn } from "@/lib/utils";

// Tiny inline trend line (Recharts) — used in the stats header. Recharts is also the
// foundation for the larger charts to come (axes/tooltips/area/bar), so reuse it.
// `stretch` fills the parent's width instead of the fixed box (the vitals band's rate cards —
// the fixed 64px chart left the card's right half empty; user, 2026-08-30).
/** Bucket a series down to at most `max` points by MEAN — the neutral downsample.
 *
 *  ⚠️ WHY MEAN AND NOT SLICE. Taking the last N points would be cheaper and would keep every value
 *  exact, but it silently shortens the WINDOW — and the card beside this chart states that window
 *  in words ("rate extrapolated from 52 global ticks over ~12 min"). A sparkline whose span
 *  disagreed with the basis printed next to it is precisely the kind of quiet lie rule 10 exists to
 *  stop. Bucketing keeps the full window and lowers the frequency, which is the actual request.
 *
 *  Mean rather than max: a max-bucket preserves peaks but inflates the shape, and this chart has no
 *  axis to correct the impression with. The headline numeral beside it carries the real rate; the
 *  line carries shape alone, so its job is to be READ, not measured.
 *
 *  A null is NOT MEASURED (the trends store's contract): it never enters a bucket's mean, and a
 *  bucket with nothing measured stays null — the line breaks there rather than fabricating a
 *  level (rule 10; the /trends charts' own connectNulls:false, one instrument down). */
function bucketMean(data: (number | null)[], max: number): (number | null)[] {
  if (data.length <= max) return data;
  const out: (number | null)[] = [];
  const size = data.length / max;
  for (let i = 0; i < max; i++) {
    const from = Math.floor(i * size);
    const to = Math.max(from + 1, Math.floor((i + 1) * size));
    let sum = 0;
    let n = 0;
    for (let j = from; j < to; j++) {
      const v = data[j];
      if (v != null) { sum += v; n++; }
    }
    out.push(n > 0 ? sum / n : null);
  }
  return out;
}

export default function Sparkline({
  data,
  color,
  width = 60,
  height = 22,
  stretch = false,
  maxPoints,
}: {
  data: (number | null)[] | undefined;
  color: string;
  width?: number;
  height?: number;
  stretch?: boolean;
  /** Cap the plotted points, bucketing by mean over the SAME window (see bucketMean). */
  maxPoints?: number;
}) {
  // The area gradient's id (a paint server is referenced by document id, so each chart needs its
  // own), sanitised because `url(#…)` dislikes the ':' a React id carries.
  const fadeId = `spark-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  // ⚠️ AN EMPTY CHART SAYS SO, IT DOES NOT RENDER NOTHING (user, 2026-09-01: "what to show for
  // vitals that show charts but don't have any data to show?"). `return null` left a card with a
  // label, a number and a silent gap where the trend belongs, which reads as a broken chart rather
  // than as a chart with nothing yet to draw.
  //
  // ⚠️ AND THE WORD IS `acquiring…`, NOT "no data". This app keeps those apart on purpose (rule 10,
  // and the acquiring-state note in components/CLAUDE.md): "haven't looked yet" and "looked and
  // found nothing" are different facts, and a rate with fewer than two ticks behind it is the
  // FIRST — the window simply has not filled. "No data" would claim the second. It is also the
  // word `TickBars` already uses two cards along, so the band speaks one language. A real zero is
  // a READING and never reaches here: it plots as a flat line.
  // A null-riddled series is judged by what it can DRAW: fewer than two measured points is
  // the same "window has not filled" fact whatever the array's length.
  // ⚠️ EXCEPT a delivered window with NO measured bucket at all (user, 2026-09-09, watching
  // the backfill's cron lock-out park every 1H card on a promise): the payload came back and
  // every bucket is null — that is "looked, and nothing sampled this window", an outage that
  // can stand for hours, not a fill still in progress. It states itself; the rim names the
  // window, so the short form carries it.
  if (!data || data.filter((v) => v != null).length < 2) {
    const unsampled = !!data && data.length > 0 && data.every((v) => v == null);
    return (
      <span
        className={cn("flex items-center justify-center text-label text-muted-foreground", stretch && "w-full")}
        style={{ height, width: stretch ? undefined : width }}
      >
        {unsampled ? "not sampled" : "acquiring…"}
      </span>
    );
  }
  const series = maxPoints ? bucketMean(data, maxPoints) : data;
  const points = series.map((v, i) => ({ i, v }));
  /** An isolated measured point (both neighbours null) gets a dot — no segment can reach it
   *  (TrendChart's own device; the review found [5, null, 7] passing the guard yet painting
   *  NOTHING under connectNulls=false + dot=false — a silently blank chart). Judged on the
   *  DRAWN series: bucketMean can merge the only measured neighbours into isolation. */
  const isolated = (i: number): boolean =>
    series[i] != null && (i === 0 || series[i - 1] == null) && (i === series.length - 1 || series[i + 1] == null);
  // THE NEWEST MEASURED POINT WEARS A DOT (2026-11-22): the line's right end is the reading the
  // numeral beside it states, and the dot says which end that is.
  let lastIdx = -1;
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i] != null) { lastIdx = i; break; }
  }
  const dot = (props: { key?: React.Key | null; index?: number; cx?: number; cy?: number }) => {
    const { key, index, cx, cy } = props;
    if (index == null || cx == null || cy == null || !(isolated(index) || index === lastIdx)) return <g key={key ?? undefined} />;
    return <circle key={key ?? undefined} cx={cx} cy={cy} r={index === lastIdx ? 2 : 1.75} fill={color} />;
  };
  // ONE DRAWING FOR BOTH SIZES. Straight segments with round joins, History's own line (a
  // smoothed curve swings past the buckets it joins and draws levels nobody measured), over a
  // faint fade of the same hue. The fade runs to the box's floor, which is the window's own
  // minimum (the hidden axis is scaled to the data), so it carries SHAPE and no magnitude — the
  // numeral beside the chart is the reading. A gap in the series is a gap in both.
  const body = (
    <>
      <defs>
        <linearGradient id={fadeId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.16} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* hidden axis, scaled to the data so the line uses the full height */}
      <YAxis hide domain={["dataMin", "dataMax"]} />
      <Area type="linear" dataKey="v" stroke="none" fill={`url(#${fadeId})`} fillOpacity={1} connectNulls={false} isAnimationActive={false} dot={false} activeDot={false} />
      {/* connectNulls false stated, not defaulted: the break IS the reading (a gap is
          "not measured", and bridging it would draw a level nobody measured). */}
      <Line type="linear" dataKey="v" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" dot={dot} isAnimationActive={false} connectNulls={false} />
    </>
  );
  // The right margin leaves the end dot its radius.
  const margin = { top: 3, right: 3, bottom: 3, left: 1 };
  if (stretch) {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={points} margin={margin}>{body}</ComposedChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ComposedChart width={width} height={height} data={points} margin={margin}>{body}</ComposedChart>
  );
}
