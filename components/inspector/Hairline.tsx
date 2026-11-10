"use client";

import type { ReactNode } from "react";

import type { SparkGeometry } from "@/src/data/momentSpark";

// THE HISTORY CARDS' ONE HAIRLINE (user, 2026-11-09: "ensure both range and moment have the same
// visual style"). The Moment card's line (its reading in the next finer buckets) and the Range
// card's (its subject over a frame around the range) are ONE drawing: the same box, stroke, ink,
// peak dot and caption type. The geometry is pure and the caller's (`momentSpark.ts`,
// `rangeSpark.ts`); this only draws it. `context` is the faint part of a line whose emphasised part
// is `geometry` — the Range card's frame around its range; the Moment's line has none.
// THE LINE WEARS ITS SUBJECT'S COLOUR (user, 2026-11-09: "color the chartline based on the metagraph
// (parent card and/or filter)"): `hue` is the network the card's figure is about — the focused plane
// or the filter, the parent Metagraph card's subject (`cardNetwork`) — and the roster's own `hue`, so
// the line matches its plane; the whole network's line keeps the filter accent, else the primary.
// A NULL `geometry` is the line still loading (user, 2026-11-10): the same box at the same height,
// its band and caption standing, no ink — the line draws in over them when it lands, no jump.

/** The drawing's own box; the SVG stretches it to the card's width. */
export const HAIRLINE_W = 300;
export const HAIRLINE_H = 28;

function Ink({ g, faint }: { g: SparkGeometry; faint?: boolean }) {
  return (
    <g strokeOpacity={faint ? 0.35 : 1}>
      {/* The fill under the line, in its own ink (2026-11-09): the measured stretch reads as a shape. */}
      {g.area && <path d={g.area} fill="currentColor" fillOpacity={0.14} stroke="none" />}
      <path d={g.path} fill="none" stroke="currentColor" strokeWidth={faint ? 1 : 1.25} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {/* Points on the line drawn as zero-length round-capped strokes, so the SVG's horizontal
          stretch cannot squash them into ellipses: the busiest point, and any lone reading
          between two gaps (which has no segment of its own). */}
      {[...(g.peak ? [g.peak] : []), ...g.dots].map((p, i) => (
        <path key={i} d={`M${p.x},${p.y}h0`} stroke="currentColor" strokeWidth={i === 0 && g.peak ? 4.5 : 3} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      ))}
    </g>
  );
}

export default function Hairline({
  geometry,
  context,
  label,
  caption,
  hue,
  band,
}: {
  /** The line; null while it loads — the box keeps its height and draws no ink. */
  geometry: SparkGeometry | null;
  context?: SparkGeometry;
  /** The figure's accessible name: what the line is. */
  label: string;
  /** The caption row under the line, in the caption's own type (positioned by the caller). */
  caption: ReactNode;
  /** The subject network's identity hue; absent for the whole network. */
  hue?: string;
  /** A stretch of the box to wash, `[x0, x1]` in the box's units — the Range card's range, so it
   *  stands out from its frame as a region and not only as a brighter line. */
  band?: [number, number];
}) {
  return (
    <figure className="mt-2 mb-2" aria-label={label}>
      <svg
        viewBox={`0 0 ${HAIRLINE_W} ${HAIRLINE_H}`}
        preserveAspectRatio="none"
        className="block w-full overflow-visible text-[var(--filter-accent,var(--primary))]"
        style={{ height: HAIRLINE_H, ...(hue ? { color: hue } : {}) }}
        aria-hidden
      >
        {band && <rect x={band[0]} width={Math.max(2, band[1] - band[0])} y={-2} height={HAIRLINE_H + 4} fill="currentColor" fillOpacity={0.07} />}
        {context && <Ink g={context} faint />}
        {geometry && <Ink g={geometry} />}
      </svg>
      {/* One line tall whatever it holds: its marks are absolute, so a caption with neither frame end would
          collapse — and the box would jump when the line lands (user, 2026-11-10). */}
      <figcaption className="relative mt-0.5 flex min-h-[1lh] justify-between text-label text-muted-foreground tabular-nums">{caption}</figcaption>
    </figure>
  );
}
