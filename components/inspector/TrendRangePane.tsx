"use client";

import { RANGE_ICON } from "@/components/icons";

import CardHead, { RailPane } from "@/components/CardHead";
import { PulseEdge, useEdgePulse } from "@/components/EdgePulse";
import { Fact, FactGroup, Lead, QualifierChip } from "@/components/inspector/parts";
import Stamp from "@/components/Stamp";
import RecordsDoor from "@/components/inspector/RecordsDoor";
import useTrendRoster from "@/components/useTrendRoster";
import useTrendsSlice from "@/components/useTrendsSlice";
import { metagraphById } from "@/src/data/network";
import { rangePhrase, sumMeasured, TREND_METRICS } from "@/src/data/trendSeries";
import { spanPhrase } from "@/src/data/trendWindow";
import { ageWords } from "@/src/util/relativeAge";
import { useStore } from "@/src/store/store";

// THE RANGE CARD (user, 2026-10-07) — History's brushed span as a committed subject, the PARENT of
// the Moment below it ("range -> moment is also a logical parent - child relation"). Before it a
// range had no card at all: the charts redrew, the band drew the span, and the only way to its
// records was the command bar's RAW toggle, which nothing on screen pointed at.
//
// A CARD SLOT, NOT A LADDER RUNG — the Moment's own precedent: no camera pose, no deselect step,
// and the × clears the range through its setter (a setting's, exactly as the timeline's × does).
//
// The card says three things and nothing else: WHICH span (the title, in the explorer's own span
// words — `spanPhrase`), what that span was TO THE NETWORK ABOVE (one sentence, `rangePhrase` — a
// counter's total, a gauge's average), and the door to its records. The per-network breakdown is
// deliberately absent: the Networks list in the left rail already IS that list over this span.
//
// ⚠️ IT READS THE SAME ROSTER PASS THE PLANES DRAW FROM (`useTrendRoster`), edge trim included, so
// its total is the sum of exactly the buckets the chart above draws.

/** How the LEAD names its subject: the focused plane, else the committed network, else nobody. */
function subjectOf(focus: string | null, filter: string, ranked: readonly string[], has: (id: string) => boolean): string | null {
  // The focused plane, else the committed filter — any row the roster draws, the unranked
  // Unlisted row included.
  if (focus && (ranked.includes(focus) || has(focus))) return focus;
  return ranked.includes(filter) || has(filter) ? filter : null;
}

export default function TrendRangePane({
  onClose,
  collapsed,
  onToggle,
}: {
  onClose: () => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const range = useStore((s) => s.trendRange);
  const filter = useStore((s) => s.filter);
  const metric = useStore((s) => s.trendMetric);
  const focus = useStore((s) => s.trendFocus);
  const windowId = useStore((s) => s.trendWindow);

  const roster = useTrendRoster(useTrendsSlice(windowId, range), filter, metric);
  const { ranked, rows, format, stepMs } = roster;
  const pulseKey = useEdgePulse(range ? `${range.fromMs}-${range.toMs}` : null);

  const subject = subjectOf(focus, filter, ranked, (id) => id !== "dag" && rows.has(id));
  const who = subject ? metagraphById(subject)?.ticker || rows.get(subject)?.name || subject : "All networks";
  const points = subject ? (rows.get(subject)?.series.points ?? []) : roster.global;

  // A COUNTER is the span's total; a gauge and the spacing are its average (the roster's own span
  // reading, the figure the Networks list states).
  const counter = TREND_METRICS[metric].kind === "counter" && metric !== "continuity";
  const total = counter ? sumMeasured(points) : null;
  const value = counter ? (total?.sum ?? null) : subject ? (rows.get(subject)?.span ?? null) : (roster.total?.span ?? null);
  // How long ago the span ENDED — "until now" when it runs to the newest bucket (user, 2026-10-07:
  // "keep the N months ago on the range").
  const endAge = range ? Date.now() - range.toMs : null;
  const aside = endAge == null ? undefined : endAge < stepMs ? "until now" : `${ageWords(endAge)} ago`;
  const phrase = range ? rangePhrase(metric, total?.partial ?? false) : null;
  // THE SPAN'S OWN ROWS (user, 2026-10-07: "Start and end date should be in the card I think for
  // clarity"): a span of two days or more is named by its UTC days, with the year (a day-only label
  // is a UTC day); a shorter one by its clock times, drawn by `Stamp` with the zone as a tag.
  const longSpan = range ? range.toMs - range.fromMs >= 2 * 86_400_000 : false;
  const edge = (ms: number) =>
    longSpan ? new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : <Stamp ms={ms} />;

  return (
    <RailPane entry={collapsed}>
      <CardHead
        eyebrow="Range"
        title={
          range ? (
            <span className="inline-flex items-center gap-2">
              <RANGE_ICON aria-hidden className="size-4 flex-none text-[var(--filter-accent,var(--primary))]" />
              {/* The one span label — its days; the exact times and zone are the Start / End rows. */}
              {spanPhrase(windowId, range)}
            </span>
          ) : (
            "—"
          )
        }
        titleKey={range ? `${range.fromMs}-${range.toMs}` : undefined}
        // When the span ENDED rides the head (user, 2026-10-07: "move '10 days ago' in range card to
        // its header") — a qualifier on the title's span, so the lead's sentence has the width.
        aside={aside ? <QualifierChip className="tabular-nums">{aside}</QualifierChip> : undefined}
        onClose={onClose}
        collapsed={collapsed}
        onToggle={onToggle}
      />
      {!collapsed && range && phrase && (
        <div>
          {/* THE LEAD: what the span was to the network above, in one sentence (the Moment's
              grammar); when it ended rides the head. */}
          <Lead lines={3}>
            {value != null ? (
              <>
                {who} {phrase.verb} <span className="font-medium text-foreground tabular-nums">{format(value)}</span> {phrase.rest}
              </>
            ) : (
              <>No reading in this range</>
            )}
          </Lead>
          <FactGroup>
            <Fact label="Start">{edge(range.fromMs)}</Fact>
            {/* The end is exclusive, so a day-named span names the day it reaches into. */}
            <Fact label="End">{edge(longSpan ? range.toMs - 1 : range.toMs)}</Fact>
            <Fact label="Length">{ageWords(range.toMs - range.fromMs)}</Fact>
          </FactGroup>
          <RecordsDoor subject={subject} span={{ ...range, label: spanPhrase(windowId, range) }} what="range" />
        </div>
      )}
      <PulseEdge pulseKey={pulseKey} rail="right" off={collapsed} />
    </RailPane>
  );
}
