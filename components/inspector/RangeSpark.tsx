"use client";

import Hairline, { HAIRLINE_H, HAIRLINE_W } from "@/components/inspector/Hairline";
import useTrendRoster from "@/components/useTrendRoster";
import useTrendsSlice from "@/components/useTrendsSlice";
import { captionMarks, litIndices, rangeFrame, rangeGeometry } from "@/src/data/rangeSpark";
import type { TrendMetric } from "@/src/store/store";
import { stampParts } from "@/src/util/localTime";

// THE RANGE'S HAIRLINE (user, 2026-11-09, design H) — the Range card's Start and End drawn: the
// subject's line over a frame around the range (`rangeFrame`: the shortest window pill holding it
// with context), the range in full ink and the frame faint, the range's dates under its ends. Every
// decision is `src/data/rangeSpark.ts`'s; `Hairline` draws it exactly as it draws the Moment's.
//
// The frame is a window pill, read through the same slice and roster pass the planes and the band
// read (`useTrendsSlice` / `useTrendRoster`, edge trim included), so it is usually already cached;
// until it lands, or when the frame measured nothing, the card draws NOTHING here (rule 10).

const D = 86_400_000;

/** A caption date, compact: the title above names the year. A span of two days or more is named
 *  by its UTC days (`localTime`'s rule); a shorter one by the reader's clock. */
function mark(ms: number, daily: boolean, year = false): string {
  return daily
    ? new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" })
    : new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

export default function RangeSpark({
  metric,
  filter,
  subject,
  span,
}: {
  metric: TrendMetric;
  filter: string;
  /** The network the card's figure is about, or null for the whole network (the card's own rule). */
  subject: string | null;
  span: { fromMs: number; toMs: number };
}) {
  const frame = rangeFrame(span, Date.now());
  const roster = useTrendRoster(useTrendsSlice(frame, null, "Range card hairline"), filter, metric);
  const points = subject ? roster.rows.get(subject)?.series.points : roster.global;
  const lit = points ? litIndices(roster.buckets, roster.stepMs, span) : null;
  const g = points && lit ? rangeGeometry(points, lit, HAIRLINE_W, HAIRLINE_H) : null;
  if (!points || !lit || !g) return null;

  const daily = span.toMs - span.fromMs >= 2 * D;
  // The end is exclusive: a day-named range names the day it reaches into.
  const start = mark(span.fromMs, daily);
  // A clock time names its zone (`localTime`'s rule; review 2026-11-09): the card's title is a UTC day,
  // so the zone rides the end mark, once.
  const end = mark(daily ? span.toMs - 1 : span.toMs, daily) + (daily ? "" : ` ${stampParts(span.toMs).zone}`);
  const m = captionMarks(points.length, lit);
  // A mark is centred on its point but kept inside the line's width: at 0% it starts there, at 100% it ends there.
  const at = (f: number) => ({ left: `${f * 100}%`, transform: `translateX(-${f * 100}%)` });
  const ends = m.kind === "ends" ? m.at : [m.at, m.at];
  // The frame's own ends, quiet, only where a range mark leaves them room.
  // A frame reaching into another year names it: "Nov 10" a year back reads as this November.
  const f0 = roster.buckets[0]!;
  const otherYear = new Date(f0).getUTCFullYear() !== new Date(span.toMs).getUTCFullYear();
  const frameStart = ends[0] > (otherYear ? 0.32 : 0.22) ? mark(f0, roster.stepMs >= D, otherYear) : null;
  const n = points.length;
  const bx = (i: number) => (n > 1 ? (i / (n - 1)) * HAIRLINE_W : HAIRLINE_W / 2);
  const frameEnd = ends[1] < 0.84 ? "now" : null;
  return (
    <Hairline
      geometry={g.lit}
      // The DAG's own hue for the whole network (the plane it stands for), as a network's for its own.
      hue={subject ? roster.rows.get(subject)?.hue : roster.total?.hue}
      band={[bx(lit[0]), bx(lit[1])]}
      context={g.context}
      label={`${subject ? "This network's" : "The whole network's"} readings around this range, the range itself drawn bolder`}
      caption={
        <>
          <span>{frameStart}</span>
          <span>{frameEnd}</span>
          {m.kind === "ends" ? (
            <>
              <span className="absolute top-0 whitespace-nowrap text-foreground" style={at(m.at[0])}>{start}</span>
              <span className="absolute top-0 whitespace-nowrap text-foreground" style={at(m.at[1])}>{end}</span>
            </>
          ) : (
            <span className="absolute top-0 whitespace-nowrap text-foreground" style={at(m.at)}>
              {start === end ? start : `${start} – ${end}`}
            </span>
          )}
        </>
      }
    />
  );
}
