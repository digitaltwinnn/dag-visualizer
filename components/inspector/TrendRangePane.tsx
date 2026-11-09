"use client";

import { RANGE_ICON } from "@/components/icons";

import CardHead, { RailPane } from "@/components/CardHead";
import { PulseEdge, useEdgePulse } from "@/components/EdgePulse";
import { Fact, FactGroup, QualifierChip } from "@/components/inspector/parts";
import RecordsDoor from "@/components/inspector/RecordsDoor";
import RangeSpark from "@/components/inspector/RangeSpark";
import NoteKindChip from "@/components/notes/NoteKindChip";
import SubjectNote from "@/components/notes/SubjectNote";
import { notableDayOfRange } from "@/components/notes/noteDays";
import { useAiNote } from "@/components/notes/useAiNote";
import { rangeCardNoteReq } from "@/components/notes/subjectNote";
import useTrendRoster from "@/components/useTrendRoster";
import useTrendsSlice from "@/components/useTrendsSlice";
import { spanWord } from "@/src/data/trendSeries";
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
// words — `spanPhrase` — and drawn on its frame by the hairline), what that span was TO THE NETWORK ABOVE (a brushed range's own Gate AI
// note, `SubjectNote`, in the lead's place — the measured one-sentence lead it replaced went on
// 2026-10-30, user: "no fallback"), and the door to its records. The per-network breakdown is
// deliberately absent: the Networks list in the left rail already IS that list over this span.
//
// ⚠️ IT READS THE SAME ROSTER PASS THE PLANES DRAW FROM (`useTrendRoster`), edge trim included.

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

  const slice = useTrendsSlice(windowId, range, "Range card");
  const roster = useTrendRoster(slice, filter, metric);
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
  // A range that IS a notable day (a day row's commit, or a brush that landed on one) wears the
  // day's kind chip beside the span's (user, 2026-10-30; `NoteKindChip`).
  const { note: aiNote } = useAiNote();
  const notable = notableDayOfRange(aiNote.res?.state === "ok" ? aiNote.res.days : null, range);

  const subject = subjectOf(filter, focus, front, ranked, (id) => id !== "dag" && rows.has(id));
  // How long ago the span ENDED — "until now" when it runs to the newest bucket (user, 2026-10-07:
  // "keep the N months ago on the range").
  const endAge = span ? Date.now() - span.toMs : null;
  const aside = endAge == null ? undefined : endAge < stepMs ? "until now" : `${ageWords(endAge)} ago`;
  // THE SPAN'S START AND END (user, 2026-10-07: "Start and end date should be in the card I think
  // for clarity") are DRAWN since 2026-11-09 (design H, `RangeSpark`): the dates under the range's
  // two ends on the subject's own line, the Moment's hairline.
  // THE EXPLORER'S OWN FIGURE, AS A ROW (user, 2026-10-25: "add one line to the range card saying
  // the average per day — basically the exact same figure that is shown in the explorer bottom
  // section"): the subject row's `head` from the ONE roster pass the Networks list reads, in the
  // same formatter, under the same word the list's foot states (`spanWord`) — so the card and the
  // list cannot quote two numbers. Unscoped, it is the pinned DAG row's figure, the reading the
  // lead's "All networks" / "The hypergraph" names. Under a window shorter than a day the head is
  // the latest full day (the roster's `headKind`), exactly as the list's then is.
  const headRow = subject ? rows.get(subject) : roster.total;
  const headValue = headRow?.head ?? null;

  // AN EMPTY SPAN SAYS SO (rule 10; review 2026-10-30): the note's `none` renders nothing, so with
  // no figure either the card would state nothing at all. Only once the read has landed.
  const noReading = headValue == null && slice.p != null && !slice.stale && !roster.pending && !roster.dayPending;
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
        aside={
          aside || notable ? (
            <>
              {aside && <QualifierChip className="tabular-nums">{aside}</QualifierChip>}
              {notable && <NoteKindChip day={notable} />}
            </>
          ) : undefined
        }
        onClose={onClose}
        collapsed={collapsed}
        onToggle={onToggle}
      />
      {!collapsed && span && (
        <div>
          {/* THE RANGE'S OWN NOTE (spec 2026-10-29-subject-notes) is the lead (user, 2026-10-30: the
              measured sentence, "DOR anchored N snapshots in this range", is gone). A BRUSHED range
              reads its own; the WINDOW standing in reads the plane the card stands on over the
              pill, always (`rangeCardNoteReq`; user, 2026-10-30) — on the plane the deck stands on
              (`cardNetwork`), asked as it lands. */}
          <SubjectNote req={rangeCardNoteReq(cardNetwork(filter, focus, front), range, windowId)} />
          {/* START AND END, DRAWN (user, 2026-11-09, design H): the subject's line around the range,
              the range bolder and its dates under its ends — the Moment's own hairline. */}
          <RangeSpark metric={metric} filter={filter} subject={subject} span={span} />
          <FactGroup>
            <Fact label="Length">{ageWords(span.toMs - span.fromMs)}</Fact>
            {headValue != null ? (
              <Fact label={spanWord(metric)}>
                <span className="tabular-nums">{format(headValue)}</span>
              </Fact>
            ) : noReading ? (
              <Fact label={spanWord(metric)}>
                <span className="text-muted-foreground">No reading</span>
              </Fact>
            ) : null}
          </FactGroup>
          <RecordsDoor subject={subject} span={{ ...span, label: spanPhrase(windowId, range) }} />
        </div>
      )}
      <PulseEdge pulseKey={pulseKey} rail="right" off={collapsed} />
    </RailPane>
  );
}
