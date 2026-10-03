"use client";

import { ArrowUpRight, Table2 } from "lucide-react";
import { INSTANT_ICON } from "@/components/icons";

import CardHead, { RailPane } from "@/components/CardHead";
import { PulseEdge, useEdgePulse } from "@/components/EdgePulse";
import { Lead, FactGroup, UnitMarks, CUT_ROW, TickerChip, figWidth } from "@/components/inspector/parts";
import { Separator } from "@/components/ui/separator";
import { SELECTED_ROW, selectionHue } from "@/components/selection";
import { openRecords, spanOfWindow } from "@/components/trendDoors";
import useTrendRoster, { NO_READING } from "@/components/useTrendRoster";
import useTrendsSlice from "@/components/useTrendsSlice";
import { subjectPairing, useHoverRelease } from "@/components/useSubjectPairing";
import { cn } from "@/lib/utils";
import { metagraphById } from "@/src/data/network";
import { instantNote, orderAt, placeInstant, rankAt, valueAt } from "@/src/data/trendSeries";
import { ageWords } from "@/src/util/relativeAge";
import { stampInstant } from "@/src/data/trendTimeline";
import { bucketAt } from "@/src/data/trendWindow";
import { trendPlaneActions } from "@/src/engine/domain/pickActions";
import { applyClickActions } from "@/src/store/applyClickActions";
import { useStore } from "@/src/store/store";

// THE CURSOR CARD (2026-09-19) — History's own facts slot, `instant`. The timeline commits one
// moment and this card reads the whole stack AT it: what the subject network measured there, where
// it stood among the others, and every layer's reading in one list. That is the view's whole
// proposition stated in words — five charts read at ONE instant rather than five separately.
//
// A CARD SLOT, NOT A LADDER RUNG (the two snapshot slots' precedent): no camera pose of its own,
// no deselect step, and its × just clears its channel. `setTrendCursor` is deliberately outside the
// pickActions table (`selectionBoundary.test.ts`'s scope note), so the × calls the setter.
//
// ⚠️ IT READS THE SAME ROSTER PASS THE PLANES DRAW FROM (`useTrendRoster`), axis trim included, so
// a value here always matches the chart it is about. The bucket is resolved by `bucketAt` —
// CONTAINMENT, never the nearest bucket — and a cursor outside the window on screen, or in a bucket
// nothing was measured in, is a GAP said in words (rule 10). Never interpolated, never a zero.
//
// ⚠️ AND THERE ARE TWO WAYS TO HAVE NO CHART, which is not a detail (2026-09-19). The band's track
// spans the whole measured history while these planes drop a counter's partial edge buckets, so the
// far RIGHT of the track — the most natural click there is — lands on a real, still-filling day that
// nothing draws. Answering that with "pick a wider window" is advice that cannot work. `placeInstant`
// tells the two apart and `instantNote` says which, both in src/data/trendSeries.ts with tests.
//
// ⚠️ AND IT MUST NOT RE-RENDER THE STACK. Both components subscribe narrowly to the same store
// fields and share `useTrendsSlice`'s module-level cache, so this card costs one extra React
// subtree per bucket change and no extra request.

/** How the LEAD names its subject: the focused plane, else the committed network, else nobody. */
function subjectOf(focus: string | null, filter: string, ranked: readonly string[]): string | null {
  if (focus && ranked.includes(focus)) return focus;
  return ranked.includes(filter) ? filter : null;
}

export default function TrendInstantPane({
  onClose,
  collapsed,
  onToggle,
}: {
  onClose: () => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const cursorMs = useStore((s) => s.trendCursorMs);
  const filter = useStore((s) => s.filter);
  const metric = useStore((s) => s.trendMetric);
  const focus = useStore((s) => s.trendFocus);
  const windowId = useStore((s) => s.trendWindow);
  const range = useStore((s) => s.trendRange);
  const hoverFilter = useStore((s) => s.hoverFilter);
  const setHoverFilter = useStore((s) => s.setHoverFilter);

  const roster = useTrendRoster(useTrendsSlice(windowId, range), filter, metric);
  const { ranked, rows, buckets, stepMs, unit, format } = roster;

  // THE BUCKET, not the instant, is this card's subject: two pointer positions inside one bucket
  // name the same reading, so the title's roll and the edge pulse fire once per bucket. `null`
  // whenever the cursor sits outside the window on screen — a real state, said below.
  const bucket = cursorMs != null ? bucketAt(buckets, stepMs, cursorMs) : null;
  const pulseKey = useEdgePulse(bucket);
  // WHY there is no chart, when there is none. `null` cursor is its own case: the slot is a ghost
  // then and this card does not render at all.
  const note = cursorMs == null ? null : instantNote(placeInstant(cursorMs, buckets, roster.rawBuckets, stepMs), stepMs);

  const subject = subjectOf(focus, filter, ranked);
  // Every network's reading at the cursor, in ONE pass — the rank, the order and the rows all read
  // this array, so they cannot describe different instants.
  const readings = ranked.map((id) => ({
    id,
    value: cursorMs != null ? valueAt(rows.get(id)?.series.points ?? [], buckets, stepMs, cursorMs) : null,
  }));
  const valueOf = (id: string) => readings.find((r) => r.id === id)?.value ?? null;
  // The busiest network's reading at this instant — what a row's bar is a fraction of.
  const peak = readings.reduce((m, r) => (r.value != null && r.value > m ? r.value : m), 0);
  const subjectValue = subject ? valueOf(subject) : null;
  const rank = rankAt(readings.map((r) => r.value), subjectValue);
  // WITH NO NETWORK AS THE SUBJECT, THE LEAD IS THE WHOLE NETWORK. The global row answers the same
  // question the planes answer per chain (`globalSeries`, one home with the band's own overview),
  // so a reader who has focused nothing still gets a reading rather than an invitation.
  const globalValue = cursorMs != null && !subject ? valueAt(roster.global, buckets, stepMs, cursorMs) : null;

  // The tier no longer rides the aside (it said "daily" there until 2026-09-26; the aside is the
  // moment's AGE now) — the note below still names the precision where a reader needs it.
  const fmt = (v: number | null) => (v != null ? format(v) : NO_READING);

  // THE SPAN THIS CARD'S DOOR CARRIES IS THE MOMENT (the search pass, 2026-10-02). It handed the
  // brushed range, else the whole window on screen — the document's rule, where a chart's link is
  // about a span. But this card states ONE instant, and its door landed the reader a month away
  // from it (the 30-day window's first day). The bucket the cursor sits in is the span here; the
  // window is only the fallback for a cursor with no bucket.
  const span = bucket != null ? { fromMs: bucket, toMs: bucket + stepMs } : (range ?? spanOfWindow(buckets, stepMs));

  // THE UNMOUNT BACKSTOP (convention 9's other half): a row that leaves the roster under a
  // stationary pointer — a filter commit, a re-rank that drops it — never fires its own leave, and
  // this card unmounts wholesale on the × and on a view switch. Either way the channel must not be
  // left holding a subject nothing is pointing at.
  //
  // ⚠️ …AND MUST NOT BE CLEARED WHEN SOMEONE ELSE IS HOLDING IT. This card's roster is the WHOLE
  // roster, so without ownership its unmount would wipe a Networks row's live hover on the way out:
  // hover a row here, move onto the rail, close the card. The returned setter is what makes the
  // difference — the hook sees this card's writes and releases nothing else.
  const setHover = useHoverRelease(hoverFilter, ranked, setHoverFilter);

  return (
    <RailPane entry={collapsed}>
      <CardHead
        eyebrow="Moment"
        // The stamp is the timeline's own (`stampInstant`, src/data/trendTimeline.ts): the DATE at
        // the daily tier — an hour the charts cannot resolve would be invented precision — and the
        // date plus a UTC clock once the buckets are finer.
        // A POINT IN TIME, in the card's own grammar (design A, 2026-09-29): the crosshair — the
        // slot's own mark — then the instant as the headline. The Networks list states a SPAN;
        // this card states one moment, and the mark is what tells the two lists apart at a glance.
        title={
          cursorMs != null ? (
            <span className="inline-flex items-center gap-2">
              <INSTANT_ICON aria-hidden className="size-4 flex-none text-[var(--filter-accent,var(--primary))]" />
              {stampInstant(cursorMs, stepMs)}
            </span>
          ) : (
            "—"
          )
        }
        titleKey={bucket ?? cursorMs ?? undefined}
        // HOW LONG AGO the moment was, not the cadence (user, 2026-09-26): the reader is placing an
        // instant, and "3 months ago" places it; "daily" only said what the charts are cut in,
        // which the note below already says where it matters. Measured from the bucket's start.
        onClose={onClose}
        collapsed={collapsed}
        onToggle={onToggle}
      />
      {!collapsed && (
        <div>
          {/* THE LEAD (the card skeleton, 2026-10-02): how long ago the moment was. It rode the
              head's aside, which is a qualifier or a state on every card now — an age is what a
              card SAYS, first. Measured from the bucket's start, as before. */}
          {cursorMs != null && <Lead>{ageWords(Date.now() - (bucket ?? cursorMs))} ago.</Lead>}
          {bucket != null && <Separator className="mb-2" />}
          {bucket == null ? (
            // AN HONEST TERMINAL, not an empty card. The sentence is `instantNote`'s: only the
            // out-of-window case offers a route, because only that one has a gesture that answers
            // it — the empty-state rule read strictly.
            <p className="text-label text-muted-foreground">{note}</p>
          ) : (
            <>
              {/* ── LEAD: the one reading this card exists to say ───────────────────────────
                  Merged onto one line with its unit, the lead grammar's own rule (no "Value:"
                  label — the unit carries it), with the rank riding beside it. */}
              {/* The SCOPE rides the lead's own line, right-aligned (user, 2026-09-26: a row of its
                  own was one row too many) — the reading left, whose reading it is right. */}
              <p className="flex items-baseline justify-between gap-3 text-title font-semibold text-foreground">
                <span className="min-w-0">
                {subject ? (
                  <>
                    <span className="tabular-nums">{fmt(subjectValue)}</span>
                    {subjectValue != null && unit ? <span className="text-body font-normal text-muted-foreground"> {unit}</span> : null}
                    {/* The rank only where there is a field to rank in: under a filter the stack is
                        one network, and "1 of 1" says nothing (user, 2026-09-26). */}
                    {rank && rank.of > 1 && (
                      <span
                        className="ml-2 text-body font-normal text-muted-foreground"
                        title={`Ranked among the ${rank.of} network${rank.of === 1 ? "" : "s"} with a reading at this instant`}
                      >
                        <span className="tabular-nums">
                          {rank.rank} of {rank.of}
                        </span>
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="tabular-nums">{fmt(globalValue)}</span>
                    {globalValue != null && unit ? <span className="text-body font-normal text-muted-foreground"> {unit}</span> : null}
                  </>
                )}
                </span>
                {/* Under a filter the TICKER alone, as the one chip (`TickerChip`, 2026-10-02): the
                    dossier above names the network in full, and the lead line has one line's width. */}
                {subject ? (
                  <TickerChip
                    text={metagraphById(subject)?.ticker || rows.get(subject)?.name || subject}
                    hue={rows.get(subject)?.hue}
                    title={rows.get(subject)?.name}
                    className="self-center font-normal"
                  />
                ) : (
                  <span className="min-w-0 truncate text-right text-label font-normal text-muted-foreground">Across the whole network</span>
                )}
              </p>

              {/* ── DETAIL: every layer at the cursor ────────────────────────────────────────
                  Ordered by the reading itself (`orderAt` — nulls last, ties stable), so the list
                  IS the ranking the lead states. Each row pairs and clicks exactly like a Network breakdown
                  row: the same channel, the same builder. */}
              {ranked.length > 1 && (
                <>
                  {/* A resting division between the LEAD (the picked reading) and the roster
                      beneath it (user, 2026-09-26): the card-head rule's hairline. */}
                  <div aria-hidden className="mt-3 border-t border-border" />
                  {/* WHAT THE LIST IS ABOUT, said once (design A): these are readings AT THE
                      INSTANT, in the bucket's own unit — the Networks list beside it averages a
                      span, and the two looked identical without this line. */}
                  <p className="mt-2 mb-0 flex items-baseline justify-between text-label tracking-caps uppercase text-muted-foreground">
                    <span>At that moment</span>
                    {unit ? <span className="normal-case tracking-normal">{unit}</span> : null}
                  </p>
                  <FactGroup className="mt-1">
                  {orderAt(readings).map((id) => {
                    const row = rows.get(id);
                    if (!row) return null;
                    const v = valueOf(id);
                    const on = id === subject;
                    const pair = subjectPairing(hoverFilter, id, setHover, row.hue);
                    return (
                      <button
                        key={id}
                        type="button"
                        // The control's PRESSED state is the plane focus it toggles — not `on`,
                        // which also lights for the committed filter (a scope, not this button's
                        // doing).
                        aria-pressed={focus === id}
                        onClick={() => applyClickActions(trendPlaneActions(id, focus))}
                        title={`${row.name} · ${v != null ? `${format(v)}${unit ? ` ${unit}` : ""}` : NO_READING}`}
                        className={cn(
                          // `block w-full`: this is the one `.nb-row` whose content is a single
                          // flex row rather than its own flex children, so it has to claim the
                          // width the row grammar assumes (label left, value right, one line).
                          "nb-row block w-[calc(100%+8px)] -mx-1 px-1 py-[3px] rounded-sm cursor-pointer text-left bg-transparent border-0",
                          "hover:bg-wash-hover focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]",
                          on && SELECTED_ROW,
                          pair.paired && pair.className,
                        )}
                        style={{ ...(on ? selectionHue(row.hue) : undefined), ...pair.style }}
                        onMouseEnter={pair.onMouseEnter}
                        onMouseMove={pair.onMouseMove}
                        onMouseLeave={pair.onMouseLeave}
                        onFocus={pair.onFocus}
                        onBlur={pair.onBlur}
                      >
                        {/* THE BREAKDOWN TABLE'S ROW (`visuals.html`, user 2026-10-02): name ·
                            reading · bar. A reading is a rate, not a countable thing, so the
                            mark is a bar scaled to the busiest network at this instant; the bar
                            carries the hue the leading dot used to. */}
                        <span className={CUT_ROW} style={figWidth(readings.map((r) => (r.value != null ? format(r.value) : "—")))}>
                          <span className={cn("min-w-0 truncate", v == null ? "text-muted-foreground" : "text-foreground-dim")}>{row.name}</span>
                          <UnitMarks count={0} color={row.hue} units={false} frac={v != null && peak > 0 ? v / peak : 0} />
                          {/* One dash for an absent reading (the skeleton's empty rule); the row's title says "no reading". */}
                          <span className={cn("font-mono tabular-nums text-right", v == null ? "text-muted-foreground" : "text-foreground")}>{v != null ? format(v) : "—"}</span>
                        </span>
                      </button>
                    );
                  })}
                </FactGroup>
                </>
              )}

              {/* ── THE ONE EXIT, as the card's foot control (design 2026-09-26, `moment-door.html`
                  A). The card marks one instant and its one real door is the anchor log at this
                  span, through `components/trendDoors.ts` — the shared home the Trends document
                  calls too, so the records door's four ordered steps are written once. It is a
                  full-bleed control on the wash ladder every other control wears (user: the bare
                  text links read as prose). "All charts" went with it: the RAW toggle in the
                  command bar IS that door. */}
              <button
                type="button"
                disabled={!span}
                title={
                  subject && subject !== "dag"
                    ? "Opens the snapshot log at this moment, for this network."
                    : "Opens the snapshot log. To jump to this moment, pick a network in the top bar first."
                }
                onClick={() => openRecords(subject, span)}
                className={cn(
                  "mt-3 flex w-[calc(100%+2*var(--card-pad))] items-center gap-2.5 text-left text-body text-foreground cursor-pointer",
                  // THE CONTROL ENDS WHERE THE PLANK BEGINS (user, 2026-09-26, two rounds). A boxed
                  // card under a filter carries the sibling pager's plank at its foot, and the plank
                  // draws one inset hairline on its top edge; a control bleeding past that line wore
                  // it as an underline. So the bleed is the card's padding LESS the plank's strip
                  // (`--foot-mb`, which RailPager sets to 0; the card's padding otherwise), which puts
                  // the control's bottom edge exactly on the plank's hairline — its bottom border —
                  // and the corners square there (`--foot-radius`, which RailPager zeroes).
                  "-mx-[var(--card-pad)] px-[var(--card-pad)] py-2.5",
                  "mb-[var(--foot-mb,calc(0px-var(--card-pad)))]",
                  "rounded-b-[var(--foot-radius,calc(var(--radius)-1px))] border-t border-wash-strong [background:light-dark(var(--wash-soft),var(--wash-faint))] hover:[background:light-dark(var(--wash-hover),var(--wash-soft))]", // the Door's own per-ground wash (parts.tsx)
                  "disabled:opacity-45 disabled:pointer-events-none",
                  "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
                )}
              >
                <Table2 aria-hidden className="size-3.5 flex-none text-primary" />
                Snapshot records
                {/* The document's own door glyph (↗), not a chevron: › is the sibling pager's
                    step on the cards below, and one glyph must not mean two things (user). */}
                <ArrowUpRight aria-hidden className="ml-auto size-3.5 flex-none text-muted-foreground" />
              </button>
            </>
          )}
        </div>
      )}
      <PulseEdge pulseKey={pulseKey} rail="right" />
    </RailPane>
  );
}
