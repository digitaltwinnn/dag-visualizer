"use client";

import type { ReactNode } from "react";

import type { SparkGeometry } from "@/src/data/momentSpark";

// THE HISTORY CARDS' ONE HAIRLINE (user, 2026-11-09: "ensure both range and moment have the same
// visual style"). The Moment card's line (its reading in the next finer buckets) and the Range
// card's (its subject over a frame around the range) are ONE drawing: the same box, stroke, ink,
// peak dot and caption type. The geometry is pure and the caller's (`momentSpark.ts`,
// `rangeSpark.ts`); this only draws it. `context` is the faint part of a line whose emphasised part
// is `geometry` — the Range card's frame around its range; the Moment's line has none.

/** The drawing's own box; the SVG stretches it to the card's width. */
export const HAIRLINE_W = 300;
export const HAIRLINE_H = 28;

function Ink({ g, faint }: { g: SparkGeometry; faint?: boolean }) {
  return (
    <g strokeOpacity={faint ? 0.35 : 1}>
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
}: {
  geometry: SparkGeometry;
  context?: SparkGeometry;
  /** The figure's accessible name: what the line is. */
  label: string;
  /** The caption row under the line, in the caption's own type (positioned by the caller). */
  caption: ReactNode;
}) {
  return (
    <figure className="mt-2 mb-2" aria-label={label}>
      <svg
        viewBox={`0 0 ${HAIRLINE_W} ${HAIRLINE_H}`}
        preserveAspectRatio="none"
        className="block w-full overflow-visible text-[var(--filter-accent,var(--primary))]"
        style={{ height: HAIRLINE_H }}
        aria-hidden
      >
        {context && <Ink g={context} faint />}
        <Ink g={geometry} />
      </svg>
      <figcaption className="relative mt-0.5 flex justify-between text-label text-muted-foreground tabular-nums">{caption}</figcaption>
    </figure>
  );
}
