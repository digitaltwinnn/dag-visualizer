"use client";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// THE TRENDS DOC'S ONE CHART PRIMITIVE — a small-multiple line chart over the /api/trends
// buckets, on RECHARTS (user, 2026-09-07: "why hand-roll charts if we have a neat library?" —
// and the vitals band's Sparkline had already established the recharts idiom, so the library
// was in the bundle all along; this file's first cut claimed otherwise and hand-rolled).
// Recharts lays out at pixel size, which retires the hand-rolled version's stretch hacks
// (non-scaling strokes, HTML-overlay dots); every colour it draws is a CSS token string, so
// the design system holds.
//
// The honesty rules are the store's, rendered: a null bucket is a GAP in the line
// (`connectNulls={false}` — never a zero, never an interpolation), an isolated measured point
// between gaps still shows (a dot, since no segment can reach it), a series with nothing
// measured says so in words instead of drawing an empty plot, and the head's right-hand
// readout is the newest measured bucket stamped with its own date — a reading is only honest
// while you can see the span it covers. Identity: the hue prop carries a network's own colour,
// but the NAME beside the chart is what identifies it — colour is never the only channel.

export interface TrendLine {
  label: string;
  points: (number | null)[];
  /** Dashed = the secondary reading of a pair — a second channel beside colour, so the pair
   *  survives grayscale. */
  dash?: boolean;
  hue?: string;
}

const PLOT_H = 120;
const AXIS_H = 18;

export default function TrendChart({
  name,
  unit,
  lines,
  buckets,
  stepMs = 86400000,
  format = (v) => v.toLocaleString(undefined, { maximumFractionDigits: 1 }),
  className,
}: {
  name: string;
  /** The unit word the head carries once (" /day", " seconds", " total"…). */
  unit?: string;
  lines: TrendLine[];
  /** Bucket START instants (epoch ms UTC), oldest → newest — the API's own axis. */
  buckets: number[];
  /** The bucket width (the payload's own stepMs) — drives axis-mark granularity and the
   *  stamps' precision. Daily by default. */
  stepMs?: number;
  format?: (v: number) => string;
  className?: string;
}) {
  const n = buckets.length;
  const measured = lines.some((l) => l.points.some((v) => v != null));
  const max = Math.max(1e-9, ...lines.flatMap((l) => l.points.filter((v): v is number => v != null))) * 1.05;

  const rows = buckets.map((ts, i) => {
    const row: Record<string, number | null> = { ts };
    for (const l of lines) row[l.label] = l.points[i];
    return row;
  });

  // Axis marks at the granularity the window can carry: months for a long daily window, days
  // for a week, weekly (Mondays) for a month of hours, six-hour marks inside a day.
  const spanMs = n > 1 ? buckets[n - 1] - buckets[0] : 0;
  const ticks: number[] = [];
  for (let i = 1; i < n; i++) {
    const d = new Date(buckets[i]);
    const prev = new Date(buckets[i - 1]);
    if (spanMs > 45 * 86400000) {
      if (prev.getUTCMonth() !== d.getUTCMonth()) ticks.push(buckets[i]);
    } else if (spanMs > 2 * 86400000) {
      if (prev.getUTCDate() !== d.getUTCDate() && (spanMs <= 9 * 86400000 || d.getUTCDay() === 1)) ticks.push(buckets[i]);
    } else if (d.getUTCHours() % 6 === 0 && d.getUTCMinutes() === 0 && !(prev.getUTCHours() === d.getUTCHours() && prev.getUTCDate() === d.getUTCDate())) {
      ticks.push(buckets[i]);
    }
  }
  const tickLabel = (ts: number): string => {
    const d = new Date(ts);
    if (spanMs > 45 * 86400000) return d.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });
    if (spanMs > 2 * 86400000) return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
    return `${String(d.getUTCHours()).padStart(2, "0")}:00`;
  };
  const stampOf = (ts: number): string =>
    stepMs < 86400000
      ? new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }) + " UTC"
      : new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

  const hue0 = lines[0]?.hue ?? "var(--primary)";
  // The head's right-hand readout: the NEWEST MEASURED BUCKET, stamped with its own date —
  // an unlabeled number reads as anything (a total, an average), and it is neither.
  let lastIdx = -1;
  for (let i = (lines[0]?.points.length ?? 0) - 1; i >= 0; i--) {
    if (lines[0].points[i] != null) { lastIdx = i; break; }
  }
  const last = lastIdx >= 0 ? lines[0].points[lastIdx] : null;

  /** An isolated measured point (both neighbours null) gets a dot — no segment can reach it. */
  const isolated = (l: TrendLine, i: number): boolean =>
    l.points[i] != null && (i === 0 || l.points[i - 1] == null) && (i === n - 1 || l.points[i + 1] == null);

  return (
    <div className={className ? `min-w-0 ${className}` : "min-w-0"}>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="inline-block w-2 h-2 rounded-full flex-none" style={{ background: hue0 }} aria-hidden />
        <span className="text-label font-semibold text-foreground truncate">{name}</span>
        {unit && <span className="text-micro text-muted-foreground">{unit}</span>}
        {/* The pair legend — only when there IS a pair (one series needs no legend, its name is
            the title). */}
        {lines.length > 1 && (
          <span className="ml-auto inline-flex items-center gap-2 text-micro text-muted-foreground">
            {lines.map((l) => (
              <span key={l.label} className="inline-flex items-center gap-1">
                <svg width="14" height="4" aria-hidden>
                  <line x1="0" y1="2" x2="14" y2="2" stroke={l.hue ?? hue0} strokeWidth="2" strokeDasharray={l.dash ? "3 3" : undefined} />
                </svg>
                {l.label}
              </span>
            ))}
          </span>
        )}
        {lines.length === 1 && last != null && (
          <span className="ml-auto inline-flex items-baseline gap-1.5">
            <span className="text-micro text-muted-foreground">{stampOf(buckets[lastIdx])}</span>
            <span className="text-label text-foreground-dim tabular-nums">{format(last)}</span>
          </span>
        )}
      </div>
      {!measured ? (
        <div className="h-[138px] grid place-items-center rounded-md border border-border border-dashed">
          <span className="text-label text-muted-foreground">no measurements in this window</span>
        </div>
      ) : (
        <div
          className="relative rounded-md bg-[var(--panel-plate)]"
          role="img"
          aria-label={`${name} — ${stepMs >= 86400000 ? "daily" : stepMs >= 3600000 ? "hourly" : "5-minute"} buckets, ${n} of them`}
        >
          <ResponsiveContainer width="100%" height={PLOT_H + AXIS_H}>
            <LineChart data={rows} margin={{ top: 6, right: 2, bottom: 0, left: 2 }}>
              <CartesianGrid
                vertical={false}
                stroke="var(--border)"
                strokeOpacity={0.5}
                horizontalCoordinatesGenerator={({ height }) => [height * 0.25, height * 0.5, height * 0.75]}
              />
              <XAxis
                dataKey="ts"
                type="number"
                domain={["dataMin", "dataMax"]}
                ticks={ticks}
                tickFormatter={tickLabel}
                axisLine={false}
                tickLine={false}
                height={AXIS_H}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              />
              <YAxis hide domain={[0, max]} />
              <Tooltip
                isAnimationActive={false}
                cursor={{ stroke: "var(--primary)", strokeOpacity: 0.4 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="rounded border border-border bg-[var(--panel)] px-1.5 py-0.5 text-micro text-foreground whitespace-nowrap tabular-nums">
                      <span className="text-muted-foreground">{stampOf(Number(label))}{" · "}</span>
                      {lines.map((l, li) => {
                        const v = payload.find((e) => e.dataKey === l.label)?.value;
                        return (
                          <span key={l.label}>
                            {li > 0 && <span className="text-muted-foreground"> · </span>}
                            {lines.length > 1 && <span className="text-muted-foreground">{l.label} </span>}
                            {v != null ? format(Number(v)) : "—"}
                          </span>
                        );
                      })}
                    </div>
                  );
                }}
              />
              {lines.map((l) => (
                <Line
                  key={l.label}
                  dataKey={l.label}
                  type="linear"
                  stroke={l.hue ?? hue0}
                  strokeWidth={2}
                  strokeDasharray={l.dash ? "4 4" : undefined}
                  connectNulls={false}
                  isAnimationActive={false}
                  dot={(props: { key?: React.Key | null; index?: number; cx?: number; cy?: number }) => {
                    const { key, index, cx, cy } = props;
                    if (index == null || cx == null || cy == null || !isolated(l, index)) return <g key={key ?? undefined} />;
                    return <circle key={key ?? undefined} cx={cx} cy={cy} r={2.5} fill={l.hue ?? hue0} />;
                  }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          {/* The y scale's one number — the baseline is 0 by construction. */}
          <span aria-hidden className="absolute top-0.5 left-1.5 text-micro text-muted-foreground pointer-events-none tabular-nums">
            {format(max / 1.05)}
          </span>
        </div>
      )}
    </div>
  );
}
