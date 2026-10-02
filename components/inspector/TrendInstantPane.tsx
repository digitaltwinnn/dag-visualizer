"use client";

import { ArrowUpRight, Table2 } from "lucide-react";
import { INSTANT_ICON } from "@/components/icons";

import CardHead, { RailPane } from "@/components/CardHead";
import { PulseEdge, useEdgePulse } from "@/components/EdgePulse";
import { Fact, FactGroup, IdentityDot } from "@/components/inspector/parts";
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
  const subjectValue = subject ? valueOf(subject) : null;
  const rank = rankAt(readings.map((r) => r.value), subjectValue);
  // WITH NO NETWORK AS THE SUBJECT, THE LEAD IS THE WHOLE NETWORK. The global row answers the same
  // question the planes answer per chain (`globalSeries`, one home with the band's own overview),
  // so a reader who has focused nothing still gets a reading rather than an invitation.
  const globalValue = cursorMs != null && !subject ? valueAt(roster.global, buckets, stepMs, cursorMs) : null;

  // The tier no longer rides the aside (it said "daily" there until 2026-09-26; the aside is the
  // moment's AGE now) — the note below still names the precision where a reader needs it.
  const fmt = (v: number | null) => (v != null ? format(v) : NO_READING);

  // THE SPAN A DOOR CARRIES: the brushed range if one stands, else the window on screen. One
  // helper, shared with the document (`components/trendDoors.ts`).
  const span = range ?? spanOfWindow(buckets, stepMs);

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
        aside={
          <span className="text-label text-muted-foreground">
            {cursorMs != null ? `${ageWords(Date.now() - (bucket ?? cursorMs))} ago` : null}
          </span>
        }
        onClose={onClose}
        collapsed={collapsed}
        onToggle={onToggle}
      />
      {!collapsed && (
        <div>
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
                        className="text-body font-normal text-muted-foreground"
                        title={`Ranked among the ${rank.of} network${rank.of === 1 ? "" : "s"} with a reading at this instant`}
                      >
                        {" · "}
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
                <span
                  className="min-w-0 truncate text-right text-label font-normal text-muted-foreground"
                  title={subject ? rows.get(subject)?.name : undefined}
                  // The ticker in its network's hue (user, 2026-09-26) — the dossier aside's own rule.
                  style={subject ? { color: rows.get(subject)?.hue } : undefined}
                >
                  {/* Under a filter the TICKER alone (user, 2026-09-26): the dossier above already
                      names the network in full, and the lead line has one line's width. */}
                  {subject ? (metagraphById(subject)?.ticker || rows.get(subject)?.name) : "Across the whole network"}
                </span>
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
                          "nb-row block w-full -mx-1 px-1 py-[3px] rounded-sm cursor-pointer text-left bg-transparent border-0",
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
                        <Fact
                          // PHRASING CONTENT inside a <button> (see `Fact`'s own note): a div row
                          // here is a content-model violation, and the span is the same box.
                          as="span"
                          label={
                            <span className="inline-flex items-center gap-2">
                              <IdentityDot hue={row.hue} />
                              <span className="truncate">{row.name}</span>
                            </span>
                          }
                        >
                          <span className={cn(v == null && "text-muted-foreground")}>{fmt(v)}</span>
                        </Fact>
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
                    ? "Opens the anchor log at this span, with this network in the search."
                    : "Opens the anchor log at this span, across every network."
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
                  "rounded-b-[var(--foot-radius,calc(var(--radius)-1px))] border-t border-wash-strong bg-wash-faint hover:bg-wash-soft",
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
