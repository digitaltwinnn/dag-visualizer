"use client";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

// THE TRENDS DOC'S ONE CHART PRIMITIVE — a small-multiple line chart over the /api/trends
// daily buckets (2026-09-06). Hand-rolled SVG like every chart in this app (the vitals band's
// Sparkline/TickBars precedent — recharts stays unused), so it speaks the token system natively.
//
// The honesty rules are the store's, rendered: a null bucket is a GAP in the line (not a zero,
// not an interpolation — the path breaks), an isolated measured point between gaps still shows
// (a dot, since no segment can reach it), and a series with nothing measured in the window says
// so in words instead of drawing an empty plot. Identity: the hue prop carries a network's own
// colour, but the NAME beside the chart is what identifies it — colour is never the only
// channel (the dataviz rule the vitals band already follows).
//
// Geometry: the plot is one SVG stretched to the panel (preserveAspectRatio="none" +
// non-scaling strokes), while every piece of TEXT is an HTML overlay — SVG text under a
// non-uniform stretch would distort, and HTML text wears the type tokens for free. The hover
// layer is a crosshair + readout chip (pointer events on the wrapper, nearest-bucket snap);
// charts without hover read as pictures, and this page is an instrument.

export interface TrendLine {
  label: string;
  points: (number | null)[];
  /** Dashed = the secondary reading of a pair (cadence max vs mean) — a second channel beside
   *  colour, so the pair survives grayscale. */
  dash?: boolean;
  hue?: string;
}

const W = 600;
const H = 120;
const PAD_Y = 6; // keeps the 2px stroke's extremes inside the box

function pathOf(points: (number | null)[], max: number): { d: string; dots: { i: number; v: number }[] } {
  const n = points.length;
  const x = (i: number) => (i / Math.max(1, n - 1)) * W;
  const y = (v: number) => H - PAD_Y - (v / max) * (H - 2 * PAD_Y);
  let d = "";
  const dots: { i: number; v: number }[] = [];
  for (let i = 0; i < n; i++) {
    const v = points[i];
    if (v == null) continue;
    const prev = i > 0 ? points[i - 1] : null;
    const next = i < n - 1 ? points[i + 1] : null;
    if (prev == null && next == null) dots.push({ i, v });
    else d += `${prev == null ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
  }
  return { d, dots };
}

export default function TrendChart({
  name,
  unit,
  lines,
  buckets,
  format = (v) => v.toLocaleString(undefined, { maximumFractionDigits: 1 }),
  className,
}: {
  name: string;
  /** The unit word the readout appends (" /day", " s", " DAG"…) — the label carries it once. */
  unit?: string;
  lines: TrendLine[];
  /** Bucket START instants (epoch ms UTC), oldest → newest — the API's own axis. */
  buckets: number[];
  format?: (v: number) => string;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const n = buckets.length;
  const measured = lines.some((l) => l.points.some((v) => v != null));
  const max = Math.max(1e-9, ...lines.flatMap((l) => l.points.filter((v): v is number => v != null))) * 1.05;

  const onMove = (e: React.PointerEvent) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r || n < 2) return;
    setHover(Math.min(n - 1, Math.max(0, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))));
  };

  // Month tick marks: the first bucket of each new UTC month, as fractions of the axis.
  const months: { frac: number; label: string }[] = [];
  for (let i = 1; i < n; i++) {
    const d = new Date(buckets[i]);
    const frac = i / (n - 1);
    // A label at the right edge would clip against the plot's overflow — skip it; the next
    // month gets its mark on the next visit.
    if (frac <= 0.93 && (d.getUTCDate() === 1 || new Date(buckets[i - 1]).getUTCMonth() !== d.getUTCMonth())) {
      months.push({ frac, label: d.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" }) });
    }
  }

  const hue0 = lines[0]?.hue ?? "var(--primary)";
  const last = lines[0]?.points.reduce<number | null>((acc, v) => (v != null ? v : acc), null);

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="inline-block w-2 h-2 rounded-full flex-none" style={{ background: hue0 }} aria-hidden />
        <span className="text-label font-semibold text-foreground truncate">{name}</span>
        {unit && <span className="text-micro text-muted-foreground">{unit}</span>}
        {/* The pair legend — only when there IS a pair (one series needs no legend, its name is the title). */}
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
          <span className="ml-auto text-label text-foreground-dim tabular-nums">{format(last)}</span>
        )}
      </div>
      {!measured ? (
        <div className="h-[120px] grid place-items-center rounded-md border border-border border-dashed">
          <span className="text-label text-muted-foreground">no measurements in this window</span>
        </div>
      ) : (
        <div
          ref={wrapRef}
          className="relative h-[120px] rounded-md overflow-hidden bg-[var(--panel-plate)]"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full"
            role="img"
            aria-label={`${name} — daily, ${buckets.length}-day window`}
          >
            {/* Recessive grid: three hairlines, no frame. */}
            {[0.25, 0.5, 0.75].map((f) => (
              <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.5" />
            ))}
            {lines.map((l) => {
              const { d, dots } = pathOf(l.points, max);
              const hue = l.hue ?? hue0;
              return (
                <g key={l.label}>
                  {d && (
                    <path d={d} fill="none" stroke={hue} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeDasharray={l.dash ? "4 4" : undefined} strokeLinejoin="round" />
                  )}
                  {dots.map((p) => (
                    <circle key={p.i} cx={(p.i / Math.max(1, n - 1)) * W} cy={H - PAD_Y - (p.v / max) * (H - 2 * PAD_Y)} r="2.5" fill={hue} />
                  ))}
                </g>
              );
            })}
          </svg>
          {/* Crosshair + readout — nearest bucket, clamped chip, no pointer events of its own. */}
          {hover != null && (
            <>
              <div
                aria-hidden
                className="absolute top-0 bottom-0 w-px bg-[var(--primary)] opacity-40 pointer-events-none"
                style={{ left: `${(hover / Math.max(1, n - 1)) * 100}%` }}
              />
              <div
                className="absolute top-1 pointer-events-none rounded border border-border bg-[var(--panel)] px-1.5 py-0.5 text-micro text-foreground whitespace-nowrap tabular-nums"
                style={hover / (n - 1) < 0.5 ? { left: `calc(${(hover / (n - 1)) * 100}% + 6px)` } : { right: `calc(${100 - (hover / (n - 1)) * 100}% + 6px)` }}
              >
                <span className="text-muted-foreground">
                  {new Date(buckets[hover]).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}
                  {" · "}
                </span>
                {lines.map((l, li) => (
                  <span key={l.label}>
                    {li > 0 && <span className="text-muted-foreground"> · </span>}
                    {lines.length > 1 && <span className="text-muted-foreground">{l.label} </span>}
                    {l.points[hover] != null ? format(l.points[hover]!) : "—"}
                  </span>
                ))}
              </div>
            </>
          )}
          {/* Month marks ride the plot's bottom edge. */}
          {months.map((m) => (
            <span key={m.frac} aria-hidden className="absolute bottom-0.5 text-micro text-muted-foreground pointer-events-none" style={{ left: `calc(${m.frac * 100}% + 3px)` }}>
              {m.label}
            </span>
          ))}
          {/* Y max label — the scale's one number; the baseline is 0 by construction. */}
          <span aria-hidden className="absolute top-0.5 left-1.5 text-micro text-muted-foreground pointer-events-none tabular-nums">
            {format(max / 1.05)}
          </span>
        </div>
      )}
    </div>
  );
}
