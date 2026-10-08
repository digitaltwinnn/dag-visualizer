"use client";

import { INSTANT_ICON } from "@/components/icons";

import CardHead, { RailPane } from "@/components/CardHead";
import { PulseEdge, useEdgePulse } from "@/components/EdgePulse";
import { Lead, FactGroup, UnitMarks, CUT_ROW, figWidth } from "@/components/inspector/parts";
import { Separator } from "@/components/ui/separator";
import { SELECTED_ROW, selectionHue } from "@/components/selection";
import { spanOfWindow } from "@/components/trendDoors";
import RecordsDoor from "@/components/inspector/RecordsDoor";
import useTrendRoster, { NO_READING } from "@/components/useTrendRoster";
import useTrendsSlice from "@/components/useTrendsSlice";
import { subjectPairing, useHoverRelease } from "@/components/useSubjectPairing";
import { cn } from "@/lib/utils";
import { metagraphById } from "@/src/data/network";
import { anchorClause, instantNote, momentPhrase, orderAt, placeInstant, valueAt } from "@/src/data/trendSeries";
import { stampInstant } from "@/src/data/trendTimeline";
import { bucketAt, spanPhrase } from "@/src/data/trendWindow";
import { trendPlaneActions } from "@/src/engine/domain/pickActions";
import { applyClickActions } from "@/src/store/applyClickActions";
import { useStore } from "@/src/store/store";
import Stamp from "@/components/Stamp";

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
function subjectOf(focus: string | null, filter: string, ranked: readonly string[], has: (id: string) => boolean): string | null {
  // The focused plane, else the committed filter — any row the roster draws, the unranked
  // Unlisted row included.
  if (focus && (ranked.includes(focus) || has(focus))) return focus;
  return ranked.includes(filter) || has(filter) ? filter : null;
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

  const subject = subjectOf(focus, filter, ranked, (id) => id !== "dag" && rows.has(id));
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
  // WITH NO NETWORK AS THE SUBJECT, THE LEAD IS THE WHOLE NETWORK. The global row answers the same
  // question the planes answer per chain (`globalSeries`, one home with the band's own overview),
  // so a reader who has focused nothing still gets a reading rather than an invitation.
  const globalValue = cursorMs != null && !subject ? valueAt(roster.global, buckets, stepMs, cursorMs) : null;

  // The lead's one reading: the subject network's, else the whole network's — and who it is about.
  const lead = subject ? subjectValue : globalValue;
  const who = subject ? metagraphById(subject)?.ticker || rows.get(subject)?.name || subject : "All networks";
  const phrase = momentPhrase(metric, stepMs);
  // The SECOND CADENCE beside the spacing (2026-10-08): how many global snapshots carried this
  // chain in the moment. Only a network has it (the global row IS the ticks), and only where the
  // store measured it — the sampler writes it since that day; before, the clause is simply absent.
  const anchored = subject && cursorMs != null ? valueAt(rows.get(subject)?.anchors ?? [], buckets, stepMs, cursorMs) : null;

  // THE SPAN THIS CARD'S DOOR CARRIES IS THE MOMENT (the search pass, 2026-10-02). It handed the
  // brushed range, else the whole window on screen — the document's rule, where a chart's link is
  // about a span. But this card states ONE instant, and its door landed the reader a month away
  // from it (the 30-day window's first day). The bucket the cursor sits in is the span here; the
  // window is only the fallback for a cursor with no bucket.
  // …and it carries the card's own words for that span, which the log's chip repeats (2026-10-07).
  const windowSpanOnScreen = range ?? spanOfWindow(buckets, stepMs);
  const span =
    bucket != null
      ? { fromMs: bucket, toMs: bucket + stepMs, label: stampInstant(bucket, stepMs) }
      : windowSpanOnScreen && { ...windowSpanOnScreen, label: spanPhrase(windowId, range) };

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
              {/* A finer-than-daily moment is a clock time: drawn by `Stamp`, its zone a tag. */}
              {stepMs < 86_400_000 ? <Stamp ms={bucket ?? cursorMs} quietDate={false} /> : stampInstant(cursorMs, stepMs)}
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
          {/* THE LEAD: WHAT THE MOMENT WAS TO THE NETWORK ABOVE (user, 2026-10-07 — "what does this
              mean to the metagraph? that's what the section is for, relation to parent"). One
              sentence, the subject doing something in the moment's bucket ("DED anchored 7
              snapshots in those 5 minutes", `momentPhrase`); with no network committed the subject
              is every network. No age chip: the title already dates the moment, and beside a chip the
              sentence had ~22 characters a line and clipped (2026-10-07). */}
          {cursorMs != null && (
            <Lead lines={3}>
              {bucket != null && lead != null ? (
                <>
                  {who} {phrase.verb} <span className="font-medium text-foreground tabular-nums">{format(lead)}</span>{" "}
                  {anchored != null && (
                    <>
                      {anchorClause(anchored).before} <span className="font-medium text-foreground tabular-nums">{anchored.toLocaleString()}</span> {anchorClause(anchored).after}{" "}
                    </>
                  )}
                  {phrase.rest}
                </>
              ) : (
                <>No reading in this moment</>
              )}
            </Lead>
          )}
          {bucket != null && <Separator className="mb-2" />}
          {bucket == null ? (
            // AN HONEST TERMINAL, not an empty card. The sentence is `instantNote`'s: only the
            // out-of-window case offers a route, because only that one has a gesture that answers
            // it — the empty-state rule read strictly.
            <p className="text-label text-muted-foreground">{note}</p>
          ) : (
            <>
              {/* ── DETAIL: every layer at the cursor ────────────────────────────────────────
                  Ordered by the reading itself (`orderAt` — nulls last, ties stable), so the list
                  IS the ranking the lead states. Each row pairs and clicks exactly like a Network breakdown
                  row: the same channel, the same builder. */}
              {ranked.length > 1 && (
                <>
                  {/* WHAT THE LIST IS ABOUT, said once (design A): these are readings AT THE
                      INSTANT, in the bucket's own unit — the Networks list beside it averages a
                      span, and the two looked identical without this line. */}
                  <p className="mt-0 mb-0 flex items-baseline justify-between text-label tracking-caps uppercase text-muted-foreground">
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

              {/* ── THE ONE EXIT: the anchor log at this moment (`RecordsDoor`, shared with the
                  Range card above). */}
              <RecordsDoor subject={subject} span={span} what="moment" />
            </>
          )}
        </div>
      )}
      <PulseEdge pulseKey={pulseKey} rail="right" off={collapsed} />
    </RailPane>
  );
}
