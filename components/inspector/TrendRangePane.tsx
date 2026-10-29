"use client";

import { RANGE_ICON } from "@/components/icons";

import CardHead, { RailPane } from "@/components/CardHead";
import { PulseEdge, useEdgePulse } from "@/components/EdgePulse";
import { Fact, FactGroup, Lead, QualifierChip } from "@/components/inspector/parts";
import Stamp from "@/components/Stamp";
import RecordsDoor from "@/components/inspector/RecordsDoor";
import SubjectNote from "@/components/notes/SubjectNote";
import { rangeNoteReq } from "@/components/notes/subjectNote";
import useTrendRoster from "@/components/useTrendRoster";
import useTrendsSlice from "@/components/useTrendsSlice";
import { metagraphById } from "@/src/data/network";
import { UNLISTED_ID } from "@/src/data/unlisted";
import { GLOBAL_READING, rangePhrase, spanWord, sumMeasured, TREND_METRICS } from "@/src/data/trendSeries";
import { spanPhrase, windowSpan } from "@/src/data/trendWindow";
import { ageWords } from "@/src/util/relativeAge";
import { cardNetwork } from "@/src/engine/domain/trendStack";
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

/** How the LEAD names its subject. */
function subjectOf(filter: string, focus: string | null, front: string | null, ranked: readonly string[], has: (id: string) => boolean): string | null {
  // THE NETWORK THE DECK STANDS ON — `cardNetwork`, the one rule the Metagraph card, the explorer's
  // highlighted row and this lead all read (user, 2026-10-25: "the range talks about all networks
  // but the DOR row in explorer is selected and chart displayed — it should always be in sync with
  // the selection"): the focused plane, else the committed filter, else the plane in FRONT. Any row
  // the roster draws counts, the unranked Unlisted row included; the DAG's own plane (and All, with
  // no stack mounted) answers null, and the lead states the hypergraph's reading.
  const net = cardNetwork(filter, focus, front);
  return net !== "all" && (ranked.includes(net) || has(net)) ? net : null;
}

export default function TrendRangePane({
  onClose,
  collapsed,
  onToggle,
}: {
  /** Absent while the card stands on the window: there is no range to clear. */
  onClose?: () => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const range = useStore((s) => s.trendRange);
  const filter = useStore((s) => s.filter);
  const metric = useStore((s) => s.trendMetric);
  const focus = useStore((s) => s.trendFocus);
  const front = useStore((s) => s.trendFront);
  const windowId = useStore((s) => s.trendWindow);

  const roster = useTrendRoster(useTrendsSlice(windowId, range, "Range card"), filter, metric);
  const { ranked, rows, format, stepMs } = roster;
  // THE WINDOW STANDS WHEN NOTHING IS BRUSHED (user, 2026-10-08): the card is the span on screen —
  // the brushed range, else the pill's trailing span ending now, else (ALL, which has no fixed
  // span) the measured axis itself. The key is the manifest's: a brush or a pill hop pulses once.
  const axis = roster.rawBuckets;
  // The trailing window's start SNAPS TO THE BUCKET STEP (the PR review): built from the clock on
  // every render it drifted a few seconds per poll, and a short window's Start row is a clock.
  const trailing = windowSpan(windowId, null, Date.now());
  const span =
    range ??
    (trailing ? { fromMs: Math.floor(trailing.fromMs / stepMs) * stepMs, toMs: trailing.toMs } : null) ??
    (axis.length ? { fromMs: axis[0]!, toMs: axis[axis.length - 1]! + stepMs } : null);
  const spanKey = range ? `${range.fromMs}-${range.toMs}` : `window:${windowId}`;
  const pulseKey = useEdgePulse(spanKey);

  const subject = subjectOf(filter, focus, front, ranked, (id) => id !== "dag" && rows.has(id));
  // THE UNSCOPED SUBJECT IS NAMED BY WHAT THE FIGURE IS (user, 2026-10-24: "'all networks created
  // a snapshot every 13s on average', is it really 'all networks'?"): for the three measures whose
  // total IS the networks added up (`GLOBAL_READING` — snapshots, fees, data) it is all networks;
  // for the hypergraph's OWN readings — its nodes, its blocks, its snapshot spacing — it is the
  // hypergraph, the same split the explorer's pinned DAG row makes with its "total" tag.
  const who = subject
    ? metagraphById(subject)?.ticker || rows.get(subject)?.name || subject
    : GLOBAL_READING[metric] === "total" ? "All networks" : "The hypergraph";
  // THE TOTAL IS SUMMED OVER EXACTLY [start, end) from the payload itself (the branch review's I8):
  // the drawn series drop a counter's partial EDGE buckets, which for a range snapped to whole days
  // dropped its whole first day. A snapped range's edges are whole, so nothing is trimmed here; a
  // bucket that starts before the range is left out rather than counted partially.
  const rawAll = subject ? (rows.get(subject)?.rawPoints ?? []) : roster.rawGlobal;
  const points = !span ? [] : rawAll.filter((_, i) => axis[i]! >= span.fromMs && axis[i]! < span.toMs);

  // A COUNTER is the span's total; a gauge and the spacing are its average (the roster's own span
  // reading, the figure the Networks list states).
  const counter = TREND_METRICS[metric].kind === "counter" && metric !== "continuity";
  const total = counter ? sumMeasured(points) : null;
  const value = counter ? (total?.sum ?? null) : subject ? (rows.get(subject)?.span ?? null) : (roster.total?.span ?? null);
  // How long ago the span ENDED — "until now" when it runs to the newest bucket (user, 2026-10-07:
  // "keep the N months ago on the range").
  const endAge = span ? Date.now() - span.toMs : null;
  const aside = endAge == null ? undefined : endAge < stepMs ? "until now" : `${ageWords(endAge)} ago`;
  const phrase = span ? rangePhrase(metric, total?.partial ?? false, !subject) : null;
  // THE SPAN'S OWN ROWS (user, 2026-10-07: "Start and end date should be in the card I think for
  // clarity"): a span of two days or more is named by its UTC days, with the year (a day-only label
  // is a UTC day); a shorter one by its clock times, drawn by `Stamp` with the zone as a tag.
  const longSpan = span ? span.toMs - span.fromMs >= 2 * 86_400_000 : false;
  // THE EXPLORER'S OWN FIGURE, AS A ROW (user, 2026-10-25: "add one line to the range card saying
  // the average per day — basically the exact same figure that is shown in the explorer bottom
  // section"): the subject row's `head` from the ONE roster pass the Networks list reads, in the
  // same formatter, under the same word the list's foot states (`spanWord`) — so the card and the
  // list cannot quote two numbers. Unscoped, it is the pinned DAG row's figure, the reading the
  // lead's "All networks" / "The hypergraph" names. Under a window shorter than a day the head is
  // the latest full day (the roster's `headKind`), exactly as the list's then is.
  const headRow = subject ? rows.get(subject) : roster.total;
  const headValue = headRow?.head ?? null;
  const edge = (ms: number) =>
    longSpan ? new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : <Stamp ms={ms} />;

  return (
    <RailPane entry={collapsed}>
      <CardHead
        eyebrow="Range"
        title={
          <span className="inline-flex items-center gap-2">
            <RANGE_ICON aria-hidden className="size-4 flex-none text-[var(--filter-accent,var(--primary))]" />
            {/* The one span label — its days, or the window pill's own words; the exact times and
                zone are the Start / End rows. */}
            {spanPhrase(windowId, range)}
          </span>
        }
        titleKey={spanKey}
        // When the span ENDED rides the head (user, 2026-10-07: "move '10 days ago' in range card to
        // its header") — a qualifier on the title's span, so the lead's sentence has the width.
        aside={aside ? <QualifierChip className="tabular-nums">{aside}</QualifierChip> : undefined}
        onClose={onClose}
        collapsed={collapsed}
        onToggle={onToggle}
      />
      {!collapsed && span && phrase && (
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
          {/* THE RANGE'S OWN NOTE (spec 2026-10-29-subject-notes): only a BRUSHED range has one —
              the window standing in is the top Gate AI card's note — on the plane the deck stands
              on (`cardNetwork`, the lead's own rule), asked as the brush lands. */}
          {range ? (
            <SubjectNote req={rangeNoteReq(cardNetwork(filter, focus, front), range, (id) => id === UNLISTED_ID)} span={spanPhrase(windowId, range)} />
          ) : null}
          <FactGroup>
            <Fact label="Start">{edge(span.fromMs)}</Fact>
            {/* The end is exclusive, so a day-named span names the day it reaches into. A trailing
                window ends now, and says so rather than printing a clock that drifts each poll. */}
            <Fact label="End">{range ? edge(longSpan ? span.toMs - 1 : span.toMs) : "now"}</Fact>
            <Fact label="Length">{ageWords(span.toMs - span.fromMs)}</Fact>
            {headValue != null && (
              <Fact label={spanWord(metric)}>
                <span className="tabular-nums">{format(headValue)}</span>
              </Fact>
            )}
          </FactGroup>
          <RecordsDoor subject={subject} span={{ ...span, label: spanPhrase(windowId, range) }} />
        </div>
      )}
      <PulseEdge pulseKey={pulseKey} rail="right" off={collapsed} />
    </RailPane>
  );
}
