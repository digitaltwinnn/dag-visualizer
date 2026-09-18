"use client";

import CardHead, { RailPane } from "@/components/CardHead";
import { PulseEdge, useEdgePulse } from "@/components/EdgePulse";
import { Fact, FactGroup, IdentityDot } from "@/components/inspector/parts";
import { SELECTED_ROW, selectionHue } from "@/components/selection";
import { openCharts, openRecords, spanOfWindow } from "@/components/trendDoors";
import { Button } from "@/components/ui/button";
import useTrendRoster, { NO_READING } from "@/components/useTrendRoster";
import useTrendsSlice from "@/components/useTrendsSlice";
import { subjectPairing } from "@/components/useSubjectPairing";
import { cn } from "@/lib/utils";
import { globalSeries, orderAt, rankAt, valueAt } from "@/src/data/trendSeries";
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

  const slice = useTrendsSlice(windowId, range);
  const roster = useTrendRoster(slice, filter, metric);
  const { ranked, rows, buckets, stepMs, unit, format } = roster;

  // THE BUCKET, not the instant, is this card's subject: two pointer positions inside one bucket
  // name the same reading, so the title's roll and the edge pulse fire once per bucket. `null`
  // whenever the cursor sits outside the window on screen — a real state, said below.
  const bucket = cursorMs != null ? bucketAt(buckets, stepMs, cursorMs) : null;
  const pulseKey = useEdgePulse(bucket);

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
  const globalValue =
    cursorMs != null && !subject
      ? valueAt(globalSeries(metric, (slice.p?.series ?? {}) as Record<string, (number | null)[]>), buckets, stepMs, cursorMs)
      : null;

  // The tier in words — the card's aside, so the body never has to caption its own precision.
  const tier = stepMs >= 86_400_000 ? "daily" : stepMs >= 3_600_000 ? "hourly" : "5 min";
  const fmt = (v: number | null) => (v != null ? format(v) : NO_READING);

  // THE SPAN A DOOR CARRIES: the brushed range if one stands, else the window on screen. One
  // helper, shared with the document (`components/trendDoors.ts`).
  const span = range ?? spanOfWindow(buckets, stepMs);

  return (
    <RailPane entry={collapsed}>
      <CardHead
        eyebrow="Instant"
        // The stamp is the timeline's own (`stampInstant`, src/data/trendTimeline.ts): the DATE at
        // the daily tier — an hour the charts cannot resolve would be invented precision — and the
        // date plus a UTC clock once the buckets are finer.
        title={cursorMs != null ? stampInstant(cursorMs, stepMs) : "—"}
        titleKey={bucket ?? cursorMs ?? undefined}
        aside={<span className="text-micro text-muted-foreground">{tier}</span>}
        onClose={onClose}
        collapsed={collapsed}
        onToggle={onToggle}
      />
      {!collapsed && (
        <div>
          {bucket == null ? (
            // AN HONEST TERMINAL, not an empty card: the cursor is a real commit that simply sits
            // outside the span these planes draw. Naming the gesture that fixes it is the
            // empty-state rule.
            <p className="text-label text-muted-foreground">
              This instant is outside the window on screen. Pick a wider window below, or move the cursor.
            </p>
          ) : (
            <>
              {/* ── LEAD: the one reading this card exists to say ───────────────────────────
                  Merged onto one line with its unit, the lead grammar's own rule (no "Value:"
                  label — the unit carries it), with the rank riding beside it. */}
              <p className="text-title font-semibold text-foreground">
                {subject ? (
                  <>
                    <span className="tabular-nums">{fmt(subjectValue)}</span>
                    {subjectValue != null && unit ? <span className="text-body font-normal text-muted-foreground"> {unit}</span> : null}
                    {rank && (
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
              </p>
              <p className="mt-0.5 text-label text-muted-foreground">
                {subject ? rows.get(subject)?.name : "Across the whole network"}
              </p>

              {/* ── DETAIL: every layer at the cursor ────────────────────────────────────────
                  Ordered by the reading itself (`orderAt` — nulls last, ties stable), so the list
                  IS the ranking the lead states. Each row pairs and clicks exactly like a Layers
                  row: the same channel, the same builder. */}
              {ranked.length > 1 && (
                <FactGroup className="mt-3">
                  {orderAt(readings).map((id) => {
                    const row = rows.get(id);
                    if (!row) return null;
                    const v = valueOf(id);
                    const on = id === subject;
                    const pair = subjectPairing(hoverFilter, id, setHoverFilter, row.hue);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => applyClickActions(trendPlaneActions(id, focus))}
                        title={`${row.name} · ${v != null ? `${format(v)}${unit ? ` ${unit}` : ""}` : NO_READING}`}
                        className={cn(
                          "nb-row -mx-1 px-1 py-[3px] rounded-sm cursor-pointer text-left bg-transparent border-0",
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
              )}

              {/* ── THE TWO EXITS, as the card's own controls ────────────────────────────────
                  One rung down the ladder and one register across it (convention 12). Both go
                  through `components/trendDoors.ts`, the shared home the Trends document calls
                  too, so the records door's four ordered steps are written once. Small text
                  Buttons — the shadcn boundary's own category for a card-foot control. */}
              <div className="mt-2 flex flex-wrap items-center gap-x-4">
                <Button
                  variant="link"
                  size="xs"
                  className="px-0"
                  disabled={!span}
                  title={
                    subject
                      ? "Opens the anchor log at this span, with this network in the search."
                      : "Opens the anchor log at this span, across every network."
                  }
                  onClick={() => openRecords(subject, span)}
                >
                  Snapshot records
                </Button>
                <Button
                  variant="link"
                  size="xs"
                  className="px-0"
                  title="Opens the measured history as a document — the same numbers in prose, with every metric side by side."
                  onClick={openCharts}
                >
                  All charts
                </Button>
              </div>
            </>
          )}
        </div>
      )}
      <PulseEdge pulseKey={pulseKey} rail="right" />
    </RailPane>
  );
}
