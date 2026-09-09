"use client";
import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table2 } from "lucide-react";

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
  /** Dashed = a secondary reading of a group — a second channel beside colour, so the group
   *  survives grayscale. `true` = the standard dash; a string is a custom dasharray for a
   *  THIRD member (the layers chart: solid / dotted / dashed on one hue). */
  dash?: boolean | string;
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
  sampled,
  onRange,
  inspect,
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
  /** COVERAGE, for charts whose plotted values are DERIVED (user, 2026-09-09: DOR's 24H
   *  continuity wore far more amber than its neighbours — every quiet bucket's mean gap is
   *  null because there is nothing to divide, and the band read those as sampling outages).
   *  When given, a bucket is unmeasured iff sampled[i] is null; a null POINT over a sampled
   *  bucket is "no reading derivable here" — the line breaks, no amber. Omitted, the points
   *  themselves are the coverage (raw stored series carry their own nulls-as-holes). */
  sampled?: (number | null)[];
  /** Drag-to-select a time range (the observation ladder's zoom, convention 12): mouse-down →
   *  drag → release hands the [fromMs, toMs] up, where the PAGE cuts every chart to it — one
   *  selection drives the whole column (the shared-axis rule), so this chart never cuts
   *  itself. Omitted (or a coarse pointer), the plot is read-only as before. */
  onRange?: (fromMs: number, toMs: number) => void;
  /** One step down the ladder: "open these buckets as records". Rendered as a small action in
   *  the head — the page passes it only while a range is active and the chart knows its chain. */
  inspect?: () => void;
  className?: string;
}) {
  const n = buckets.length;
  // The in-flight drag, as bucket instants — preview only; the committed range lives on the
  // page (one selection, every chart). Cleared on release or when the pointer leaves.
  const [drag, setDrag] = useState<{ a: number; b: number } | null>(null);
  const dragProps = onRange
    ? {
        onMouseDown: (e: { activeLabel?: string | number }) => {
          const ts = Number(e?.activeLabel);
          if (Number.isFinite(ts)) setDrag({ a: ts, b: ts });
        },
        onMouseMove: (e: { activeLabel?: string | number }) => {
          const ts = Number(e?.activeLabel);
          if (drag && Number.isFinite(ts)) setDrag({ a: drag.a, b: ts });
        },
        onMouseUp: () => {
          if (drag) {
            const lo = Math.min(drag.a, drag.b);
            const hi = Math.max(drag.a, drag.b);
            // A click (no travel) is not a range — require at least one full bucket.
            if (hi - lo >= stepMs) onRange(lo, hi + stepMs);
          }
          setDrag(null);
        },
        onMouseLeave: () => setDrag(null),
      }
    : {};
  const measured = lines.some((l) => l.points.some((v) => v != null));
  const max = Math.max(1e-9, ...lines.flatMap((l) => l.points.filter((v): v is number => v != null))) * 1.12;

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

  // VERTICAL BANDS, TWO KINDS (user, 2026-09-09 — one long arc: first "highlight the outage
  // between these two measurements", then three rounds of form (full tile height, no outline,
  // a real orange on both grounds), then the meaning flipped by "switch it around"): these
  // charts are ABOUT the network, so the warning colour belongs to the NETWORK's events —
  // an amber band is a measured run of buckets where the chain sealed NOTHING while this app
  // watched (sampled === 0; the continuity charts pass `sampled`, whose zeros are exactly
  // that silence). Our own coverage caveat goes NEUTRAL instead: a gray band is a stretch
  // nobody sampled — no claim about the chain, quiet on purpose (the HUD's unmeasured stubs
  // wear the same achromatic tone), and rare by design since the sampler heals its own gaps.
  // A bucket is unmeasured only when EVERY line has nothing there (a pair's one-sided null is
  // that series' own gap), and the never-measured LEADING prefix is the instrument's
  // birthdate — no band at all.
  const bandRuns = (inRun: (i: number) => boolean, startAt: number): { x1: number; x2: number }[] => {
    const out: { x1: number; x2: number }[] = [];
    let start = -1;
    for (let i = startAt; i < n; i++) {
      if (inRun(i)) {
        if (start < 0) start = i;
      } else if (start >= 0) {
        out.push({ x1: buckets[Math.max(0, start - 1)], x2: buckets[i] });
        start = -1;
      }
    }
    if (start > 0) out.push({ x1: buckets[start - 1], x2: buckets[n - 1] });
    return out;
  };
  const unmeasuredAt = (i: number): boolean =>
    sampled ? sampled[i] == null : lines.every((l) => l.points[i] == null);
  const firstMeasured = buckets.findIndex((_, i) => !unmeasuredAt(i));
  const holes = firstMeasured >= 0 ? bandRuns(unmeasuredAt, Math.max(0, firstMeasured)) : [];
  const stalls = sampled ? bandRuns((i) => sampled[i] === 0, 0) : [];

  return (
    <div className={className ? `min-w-0 select-none ${className}` : "min-w-0 select-none"}>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="inline-block w-2 h-2 rounded-full flex-none" style={{ background: hue0 }} aria-hidden />
        <span className="text-label font-semibold text-foreground truncate">{name}</span>
        {unit && <span className="text-micro text-muted-foreground">{unit}</span>}
        {/* One rung down the ladder (convention 12): only offered while a range is active,
            because the destination — the anchor log's date search — receives that range. */}
        {inspect && (
          <button
            type="button"
            onClick={inspect}
            title="Open this range in the Snapshots view's raw data search"
            className="inline-flex items-center gap-1 text-micro text-primary/75 hover:text-primary whitespace-nowrap"
          >
            <Table2 aria-hidden className="size-3" />
            snapshot records
          </button>
        )}
        {/* The pair legend — only when there IS a pair (one series needs no legend, its name is
            the title). */}
        {lines.length > 1 && (
          <span className="ml-auto inline-flex items-center gap-2 text-micro text-muted-foreground">
            {lines.map((l) => (
              <span key={l.label} className="inline-flex items-center gap-1">
                <svg width="14" height="4" aria-hidden>
                  <line x1="0" y1="2" x2="14" y2="2" stroke={l.hue ?? hue0} strokeWidth="2" strokeDasharray={typeof l.dash === "string" ? l.dash : l.dash ? "3 3" : undefined} />
                </svg>
                {l.label}
              </span>
            ))}
          </span>
        )}
        {lines.length === 1 && last != null && (
          // The readout reads as a SENTENCE tail, number first (user, 2026-09-09, two rounds:
          // "/day" then "Sep 8 · 1,863" were fragments the reader had to assemble; and the
          // sub-daily full date+time+UTC stamp overstated — the window is at most a day or a
          // month deep, so the hour alone places the bucket). With the head's prose unit it
          // composes: "Global snapshots per day … 1,863 on Sep 8". The connective is the
          // number's description; the title carries the precise claim for whoever hovers.
          // Full-precision stamps live on in the tooltip, where a POINT is being inspected.
          <span
            className="ml-auto inline-flex items-baseline gap-1 whitespace-nowrap"
            title={`The newest complete measured ${stepMs >= 86400000 ? "day" : stepMs >= 3600000 ? "hour" : "five-minute bucket"} (${stampOf(buckets[lastIdx])})`}
          >
            <span className="text-label text-foreground-dim tabular-nums">{format(last)}</span>
            <span className="text-micro text-muted-foreground">
              {stepMs < 86400000
                ? `at ${String(new Date(buckets[lastIdx]).getUTCHours()).padStart(2, "0")}:${String(new Date(buckets[lastIdx]).getUTCMinutes()).padStart(2, "0")}`
                : `on ${new Date(buckets[lastIdx]).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}`}
            </span>
          </span>
        )}
      </div>
      {!measured ? (
        <div className="h-[138px] grid place-items-center rounded-md border border-border border-dashed">
          <span className="text-label text-muted-foreground">no measurements in this window</span>
        </div>
      ) : (
        <div
          className={`relative rounded-md bg-[var(--panel-plate)] overflow-hidden${onRange ? " cursor-crosshair select-none" : ""}`}
          role="img"
          aria-label={`${name} — ${stepMs >= 86400000 ? "daily" : stepMs >= 3600000 ? "hourly" : "5-minute"} buckets, ${n} of them`}
        >
          <ResponsiveContainer width="100%" height={PLOT_H + AXIS_H}>
            <LineChart data={rows} margin={{ top: 10, right: 2, bottom: 4, left: 2 }} {...dragProps}>
              {/* The drag preview — the committed cut happens on the PAGE at release. */}
              {drag && (
                <ReferenceArea
                  x1={Math.min(drag.a, drag.b)}
                  x2={Math.max(drag.a, drag.b)}
                  fill="var(--primary)"
                  fillOpacity={0.12}
                  stroke="var(--primary)"
                  strokeOpacity={0.4}
                />
              )}
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
              {/* Both kinds paint the full tile via the custom shape (plot + axis strip; the
                  plate's overflow-hidden keeps the corners) — the outage owns its column. */}
              {holes.map((h) => (
                <ReferenceArea
                  key={`hole-${h.x1}`}
                  x1={h.x1}
                  x2={h.x2}
                  shape={({ x, width }: { x?: number; width?: number }) =>
                    x != null && width != null ? (
                      <rect x={x} y={0} width={width} height={PLOT_H + AXIS_H} fill="var(--muted-foreground)" fillOpacity={0.12} />
                    ) : (
                      <g />
                    )
                  }
                />
              ))}
              {stalls.map((h) => (
                <ReferenceArea
                  key={`stall-${h.x1}`}
                  x1={h.x1}
                  x2={h.x2}
                  shape={({ x, width }: { x?: number; width?: number }) =>
                    x != null && width != null ? (
                      <rect x={x} y={0} width={width} height={PLOT_H + AXIS_H} fill="var(--warn-soft)" fillOpacity={0.24} />
                    ) : (
                      <g />
                    )
                  }
                />
              ))}
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
                  strokeDasharray={typeof l.dash === "string" ? l.dash : l.dash ? "4 4" : undefined}
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
          <span aria-hidden className="absolute top-1 left-1.5 text-micro text-muted-foreground pointer-events-none tabular-nums">
            {format(max / 1.12)}
          </span>
        </div>
      )}
    </div>
  );
}
