"use client";

import { LineChart, Line, YAxis, ResponsiveContainer } from "recharts";

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
 *  line carries shape alone, so its job is to be READ, not measured. */
function bucketMean(data: number[], max: number): number[] {
  if (data.length <= max) return data;
  const out: number[] = [];
  const size = data.length / max;
  for (let i = 0; i < max; i++) {
    const from = Math.floor(i * size);
    const to = Math.max(from + 1, Math.floor((i + 1) * size));
    let sum = 0;
    for (let j = from; j < to; j++) sum += data[j];
    out.push(sum / (to - from));
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
  data: number[] | undefined;
  color: string;
  width?: number;
  height?: number;
  stretch?: boolean;
  /** Cap the plotted points, bucketing by mean over the SAME window (see bucketMean). */
  maxPoints?: number;
}) {
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
  if (!data || data.length < 2) {
    return (
      <span
        className={cn("flex items-center justify-center text-micro text-muted-foreground", stretch && "w-full")}
        style={{ height, width: stretch ? undefined : width }}
      >
        acquiring…
      </span>
    );
  }
  const series = maxPoints ? bucketMean(data, maxPoints) : data;
  const points = series.map((v, i) => ({ i, v }));
  if (stretch) {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={points} margin={{ top: 3, right: 1, bottom: 3, left: 1 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    );
  }
  return (
    <LineChart width={width} height={height} data={points} margin={{ top: 3, right: 1, bottom: 3, left: 1 }}>
      {/* hidden axis, scaled to the data so the line uses the full height */}
      <YAxis hide domain={["dataMin", "dataMax"]} />
      <Line
        type="monotone"
        dataKey="v"
        stroke={color}
        strokeWidth={1.5}
        dot={false}
        isAnimationActive={false}
      />
    </LineChart>
  );
}
