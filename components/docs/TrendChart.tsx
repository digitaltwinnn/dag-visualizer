"use client";
import { memo, useId, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Area, CartesianGrid, ComposedChart, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { NodeStars } from "@/components/state/StateAtoms";
import { bucketAt, cursorFraction } from "@/src/data/trendWindow";

// THE TRENDS DOC'S ONE CHART PRIMITIVE — a small-multiple line chart over the /api/trends
// buckets, on RECHARTS (user, 2026-09-07: "why hand-roll charts if we have a neat library?" —
// and the vitals band's Sparkline had already established the recharts idiom, so the library
// was in the bundle all along; this file's first cut claimed otherwise and hand-rolled).
// Recharts lays out at pixel size, which retires the hand-rolled version's stretch hacks
// (non-scaling strokes, HTML-overlay dots); every colour it draws is a CSS token string, so
// the design system holds.
//
// The honesty rules are the store's, rendered: a null bucket is a GAP in the line
// (`connectNulls={false}` — never a zero, never an interpolation), an isolated measured point
// between gaps still shows (a dot, since no segment can reach it), a series with nothing
// measured says so in words instead of drawing an empty plot, and the head's right-hand
// readout is the newest measured bucket stamped with its own date — a reading is only honest
// while you can see the span it covers. Identity: the hue prop carries a network's own colour,
// but the NAME beside the chart is what identifies it — colour is never the only channel.

export interface TrendLine {
  label: string;
  points: (number | null)[];
  /** Dashed = a secondary reading of a group — a second channel beside colour, so the group
   *  survives grayscale. `true` = the standard dash; a string is a custom dasharray for a
   *  THIRD member (the layers chart: solid / dotted / dashed on one hue). */
  dash?: boolean | string;
  hue?: string;
}

const PLOT_H = 120;
const AXIS_H = 18;

// THE PLOT BOX, AS NUMBERS THE CHART AND ITS OVERLAY BOTH READ (2026-09-19). Recharts
// lays this plot area out from exactly three things — the LineChart's own margin, the XAxis's
// declared height, and the YAxis, which is `hide` and therefore reserves NOTHING (recharts skips
// a hidden axis when it accumulates the chart offset). So the box is knowable from this file
// alone: x runs [left, width − right], and the plot's own height is its `plotHeight` less the vertical
// margins, with the axis strip below it. That is what lets the shared cursor be a CSS `calc()`
// over a percentage of the plate rather than a measured pixel — no ResizeObserver, and it rides
// the 3D plane's projected scale for free.
// ⚠️ The margin must be READ from here by the chart too, never restated at the call site: the
// overlay's x is only right while the two agree.
const PLOT_MARGIN = { top: 10, right: 2, bottom: 4, left: 2 } as const;
/** The plot box's horizontal inset, both sides together — what a 100% width must give back. */
const PLOT_INSET_X = PLOT_MARGIN.left + PLOT_MARGIN.right;
/** The plot box's own height for a plot `plotH` tall, measured from the top margin: the axis strip
 *  sits below it. A function since the plot's height became a prop (`plotHeight`) — the cursor
 *  overlay and the chart still read the ONE margin. */
const plotInnerH = (plotH: number): number => plotH - PLOT_MARGIN.top - PLOT_MARGIN.bottom;

/** The default value formatter, hoisted out of the destructuring default so it is ONE reference
 *  for every chart that states no formatter of its own — a default written in the parameter list
 *  is a fresh function every render, which is exactly the prop churn the memoised plot below
 *  exists to stop. (`useTrendRoster` restates this same shape for the rails, by the same rule.) */
const PLAIN = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 1 });

/** A bucket instant in words, at the precision its own cadence earns. Module-level because both
 *  halves of this file read it — the head's readout title and the plot's tooltip. */
const stampOf = (ts: number, stepMs: number): string =>
  stepMs < 86400000
    ? new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }) + " UTC"
    : new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

export default function TrendChart({
  name,
  unit,
  lines,
  buckets,
  stepMs = 86400000,
  format = PLAIN,
  sampled,
  gaps,
  onRange,
  inspect,
  inspectCommits,
  readout,
  scaleMax,
  cursorMs,
  onPick,
  fill,
  plotHeight = PLOT_H,
  rollClassName,
  note,
  syncId = "trends",
  className,
  headClassName,
  headAction,
  headHover,
}: {
  name: string;
  /** The unit word the head carries once (" /day", " seconds", " total"…). */
  unit?: string;
  lines: TrendLine[];
  /** Bucket START instants (epoch ms UTC), oldest → newest — the API's own axis. */
  buckets: number[];
  /** The bucket width (the payload's own stepMs) — drives axis-mark granularity and the
   *  stamps' precision. Daily by default. */
  stepMs?: number;
  format?: (v: number) => string;
  /** A CLICK ON THE PLOT PICKS THE INSTANT under it (user, 2026-09-26: the cursor "should act
   *  on the charts in the scene… or maybe on both" — both, the timeline keeps its click). The
   *  x is the chart's own scale re-expressed from the click's fraction of the plot box, the
   *  inverse of the cursor overlay's `cursorFraction`, snapped to the bucket that contains it.
   *  Omitted (the document's charts, which brush ranges instead), a click does nothing. */
  onPick?: (ms: number) => void;
  /** A y-max imposed from OUTSIDE, so a run of charts can share one scale (TrendsDoc's
   *  per-network panels). Omitted, the chart scales to its own data — which is right for a
   *  chart read on its own and wrong for a column of charts read against each other. */
  scaleMax?: number;
  /** COVERAGE, for charts whose plotted values are DERIVED (user, 2026-09-09: DOR's 24H
   *  continuity wore far more amber than its neighbours — every quiet bucket's mean gap is
   *  null because there is nothing to divide, and the band read those as sampling outages).
   *  When given, a bucket is unmeasured iff sampled[i] is null; a null POINT over a sampled
   *  bucket is "no reading derivable here" — the line breaks, no amber. Omitted, the points
   *  themselves are the coverage (raw stored series carry their own nulls-as-holes). */
  sampled?: (number | null)[];
  /** The chain's own per-bucket WIDEST GAP (seconds — the gapMax series), for scaling the
   *  amber band to the chain's rhythm (user, 2026-09-10: a warning colour on a bursty
   *  chain's ordinary pauses was a diagnosis the words never made). See the band comment
   *  for the median-based threshold and its reasoning. */
  gaps?: (number | null)[];
  /** Drag-to-select a time range (the observation ladder's zoom, convention 12): mouse-down →
   *  drag → release hands the [fromMs, toMs] up, where the PAGE cuts every chart to it — one
   *  selection drives the whole column (the shared-axis rule), so this chart never cuts
   *  itself. Omitted (or a coarse pointer), the plot is read-only as before. */
  onRange?: (fromMs: number, toMs: number) => void;
  /** One step down the ladder: "open these buckets as records". Rendered as a small action in
   *  the head — the page passes it only while a range is active and the chart knows its chain. */
  inspect?: () => void;
  /** The network this chart's `inspect` COMMITS, in words (user, 2026-09-12 — "when I click
   *  'snapshot records' it sets filter to DOR?"): the raw layer's record search pages one
   *  chain at a time, so a per-network chart's door commits its own network on the way
   *  through. That is a visible change — the scene's dim, the dossier and the camera all
   *  answer it — so the control says so rather than letting the destination explain it. The
   *  global charts pass nothing: their door commits only what is already committed. */
  inspectCommits?: string;
  /** Overrides the head readout for COUNTER charts at day-denominated zooms (user,
   *  2026-09-09: "latest full hour" atop a 7-day view answered too fine a question) — the
   *  page hands the DAILY tier's own newest complete day, so no client re-summing invents a
   *  floor rule. Gauges and continuity keep their bucket readout: a gauge's day is not a sum,
   *  and a day-mean of gaps needs the weighting the store already did per bucket. */
  readout?: { value: number | null; word: string };
  /** THE SHARED TIME CURSOR (2026-09-18) — `store.trendCursorMs`, one instant every plane of the
   *  3D trend stack marks at once, so a reader comparing five chains is looking at the same
   *  moment on all of them. Drawn as a vertical rule at the bucket that CONTAINS the instant
   *  (`bucketAt`), never at the nearest one: a mark one bucket off is a chart naming the wrong
   *  day, which is the kind of quiet lie rule 10 exists to prevent. Outside this chart's own span
   *  — a chain measured over a shorter window than its neighbours — NOTHING is drawn, which is
   *  the honest answer: the instant is not in this chart. The document passes nothing and renders
   *  exactly as before.
   *
   *  ⚠️ IT IS THE ONE PROP THAT DOES NOT REACH THE PLOT (2026-09-19). Everything else
   *  here is chart data; this is a MARK on it, and it changes at gesture frequency. So it is drawn
   *  by this component as a CSS overlay beside the memoised plot rather than inside it — see the
   *  overlay's own comment, and `TrendPlot`'s, for the measurement that forced the split. */
  cursorMs?: number | null;
  /** THE AREA UNDER THE FIRST LINE, IN ITS OWN HUE (2026-09-19) — opt-in, and the 3D stack's
   *  planes are the only caller. A plane is a fully transparent body with one hairline, and a bare
   *  line floating in a scene reads as a wire rather than as a LAYER; the fill is what makes five
   *  planes read as translucent sheets receding in depth. The DOCUMENT passes nothing and renders
   *  the same `LineChart` it always did — the area needs recharts' `ComposedChart` (`Area` returns
   *  null in any other chart, recharts 3's own `chartName` guard), so the chart type is switched
   *  only when this is on.
   *
   *  ⚠️ IT IS A GAP WHERE THE LINE IS (rule 10). The area carries `connectNulls={false}` like the
   *  line, so an unmeasured bucket leaves a hole in the fill too — an area that bridged a gap, or
   *  dropped to the baseline across it, would draw a measurement nobody took. Only the FIRST line
   *  is filled: a dashed secondary reading is a second channel, and filling both would make the
   *  pair unreadable. */
  fill?: boolean;
  /** THE PLOT'S HEIGHT IN CSS PX (user, 2026-09-19: the History cards read as "quite horizontal /
   *  long, give them some more height"). The document's column wants short small-multiples — many
   *  charts, one shared axis, a dip followed down the page — so its default stands; a card in the
   *  History stack is ONE chart being read on its own and wants a plot with room in it. A plain
   *  number, so it holds the plot's memo still. */
  plotHeight?: number;
  /** THE PLOT ROLLS WHEN ITS SUBJECT CHANGES, AND THE FRAME DOES NOT (2026-09-19). Given, the
   *  recharts plot sits in a wrapper wearing these classes — a CSS TRANSITION the caller drives
   *  from outside (the History stack keys it off one attribute on its root, see
   *  `components/useStagedMeasure.ts`), playing inside the frame's own `overflow-hidden`. The card,
   *  its head and its hairline hold still, and the cursor overlay stays out of it (a position does
   *  not animate). NOT a remount: the first cut keyed the wrapper so an enter animation replayed,
   *  and five recharts plots mounting in the animation's first frames WAS the stutter. Absent,
   *  there is no wrapper at all and the document's DOM is what it always was. */
  rollClassName?: string;
  /** AN INSTRUMENT STATE THE SERIES CANNOT SAY (2026-09-18). When the caller knows something the
   *  points don't — most concretely that the payload this chart needs is still IN FLIGHT — it
   *  hands the words here and the plot is replaced by them, in the chart's own empty-state frame.
   *  Rule 10: an absent payload is a state stated in words, and "no measurements in this window"
   *  would be a different claim entirely — one about the data rather than about the reading. The
   *  head still renders, so the plane keeps its name, its unit and its frame while it waits. */
  note?: string;
  /** THE RECHARTS SYNC GROUP (2026-09-19). Charts sharing a `syncId` share hover state, which is
   *  what makes the document's column of small multiples read at one instant. It is a PROP because
   *  the two registers of this rung can be MOUNTED AT ONCE: opening RAW over the History view
   *  leaves the stack's five planes mounted behind the document, so one group would let a hover in
   *  the document re-render five hidden plots. The default is the document's own value, so nothing
   *  there changes; the stack passes its own. */
  syncId?: string;
  className?: string;
  /** Extra classes for the HEAD ROW alone (2026-09-18). The 3D trend stack's planes have no
   *  chrome of their own — the head IS each plane's header strip, the one part of a fully
   *  transparent plane that carries a plate so the network name and unit stay readable over the
   *  scene. One prop rather than a second head: the document's own head renders unchanged when
   *  nothing is passed, so both registers keep one chart implementation. */
  headClassName?: string;
  /** THE HEAD AS A TARGET (2026-09-18) — the 3D stack's header strip is what a reader presses to
   *  bring a plane forward, so the strip has to BE a control: focusable, activated by Enter and
   *  Space, and stating whether its plane is the focused one. The document passes nothing and its
   *  head stays a plain div.
   *
   *  ⚠️ `role="button"` rather than a real `<button>` element, deliberately: the head can already
   *  contain a button of its own (the `inspect` link), and a button inside a button is invalid
   *  HTML that browsers re-parse — the inner control would land OUTSIDE the outer one and stop
   *  working. The role plus tabIndex plus the key handler is the same contract without that trap.
   *  `label` says what the press will DO, and it must CONTAIN the strip's own visible words
   *  (WCAG 2.5.3, label in name): an `aria-label` REPLACES the accessible name, so a bare
   *  "Bring it forward" would leave speech input with no way to say this control's name and a
   *  screen-reader user hearing an action with no subject. The stack composes it as
   *  "<network> <unit> — <action>". `fromKey` tells the caller which path activated it — a
   *  pointer gesture can be a drag, a key press never is. */
  headAction?: { activate: (fromKey: boolean) => void; pressed: boolean; label: string };
  /** THE HEAD AS A PAIRED SUBJECT (2026-09-19) — the scene↔HUD hover pairing (convention 9) run
   *  over the strip, because the strip is the one part of a plane that takes pointer events at
   *  every depth. Handed in whole from `subjectPairing`, so hover and keyboard focus preview
   *  identically and the caller owns which channel is being previewed. The document passes
   *  nothing and its head pairs with nothing. */
  headHover?: {
    onMouseEnter: () => void;
    onMouseMove: () => void;
    onMouseLeave: () => void;
    onFocus: () => void;
    onBlur: () => void;
  };
}) {
  const n = buckets.length;
  const measured = lines.some((l) => l.points.some((v) => v != null));

  // The cursor's bucket on THIS chart's own axis — the chart owns its scale, so the lookup runs
  // against the buckets it was actually handed (a counter series trims its partial edges, so the
  // caller's array and this one are not the same).
  const cursorBucket = cursorMs == null ? null : bucketAt(buckets, stepMs, cursorMs);
  // …and WHERE that bucket sits on the plot, as a fraction of the plot box. `null` covers both
  // reasons there is nothing to draw at once — no cursor, or an instant this chart's span does
  // not contain (a chain measured over a shorter window than its neighbours).
  const cursorX = cursorFraction(buckets, cursorBucket);

  const hue0 = lines[0]?.hue ?? "var(--primary)";
  // The head's right-hand readout: the NEWEST MEASURED BUCKET, stamped with its own date —
  // an unlabeled number reads as anything (a total, an average), and it is neither.
  let lastIdx = -1;
  for (let i = (lines[0]?.points.length ?? 0) - 1; i >= 0; i--) {
    if (lines[0].points[i] != null) { lastIdx = i; break; }
  }
  const last = lastIdx >= 0 ? lines[0].points[lastIdx] : null;

  return (
    <div className={className ? `min-w-0 select-none ${className}` : "min-w-0 select-none"}>
      {/* ⚠️ THE HEAD WRAPS RATHER THAN CRUSHING ITS NAME (2026-09-14, found in the phone pass).
          Four things share this row — the series name, its unit, the records link and the
          readout — and only the name could shrink, so at 390px it was the one that paid:
          "Global snapshots" became "G…" while "per day" broke across two lines beside it, and
          the two nowrap items kept every pixel they asked for.
          The name, its dot and its unit are ONE group now (they are one phrase — a unit beside
          a truncated name says nothing), and the group does not shrink, so when the row runs
          out the LINK and the READOUT wrap to a second line instead. `max-w-full` is the
          backstop: a name longer than the whole row still truncates inside the group rather
          than overflowing it. Nothing changes at any width where the row already fit. */}
      <div
        className={cn("flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-1", headClassName)}
        {...headHover}
        {...(headAction && {
          role: "button",
          tabIndex: 0,
          "aria-pressed": headAction.pressed,
          "aria-label": headAction.label,
          onClick: (e: React.MouseEvent) => {
            // The plane BODY beneath runs the same activation (the stack's interactive plane), so
            // the strip's own click stops here — once per gesture, never twice.
            e.stopPropagation();
            // …and a nested control inside the head keeps its own click (the `inspect` records
            // link). The head is a div with `role="button"`, so a `closest` hit is always a real
            // nested element rather than the strip itself.
            if ((e.target as HTMLElement).closest("a,button")) return;
            headAction.activate(false);
          },
          // ⚠️ A NATIVE BUTTON'S KEY TIMING, because this only LOOKS like one (`role="button"` — see
          // the prop's note for why it cannot be a real `<button>`): ENTER fires on keydown, SPACE
          // fires on key UP and does nothing until then. Matching that is not pedantry — a reader
          // who presses Space, thinks better of it and moves off before releasing expects nothing
          // to have happened, which is the escape hatch every button on the page gives them.
          //
          // ⚠️ …WITH ONE DELIBERATE DIFFERENCE: A HELD ENTER COMMITS ONCE. A native button repeats
          // its activation while Enter is held, which is harmless because a button's action is
          // normally idempotent — and this one is a TOGGLE. Repeating it would flip the focus on
          // and off for as long as the key is down, each flip now also a camera resolve, and
          // whatever state the release happened to land on would be the result. So auto-repeat is
          // ignored: `e.repeat` is the browser saying "this is the same press continuing", and one
          // press is one commit. The default is still taken on every keydown, repeats included, or
          // the page scrolls under a held Space.
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key !== " " && e.key !== "Enter") return;
            e.preventDefault();
            if (e.key === "Enter" && !e.repeat) headAction.activate(true);
          },
          onKeyUp: (e: React.KeyboardEvent) => {
            if (e.key !== " ") return;
            e.preventDefault();
            headAction.activate(true);
          },
        })}
      >
        <span className="inline-flex items-baseline gap-2 min-w-0 max-w-full flex-none">
          <span className="inline-block w-2 h-2 rounded-full flex-none" style={{ background: hue0 }} aria-hidden />
          <span className="text-label font-semibold text-foreground truncate">{name}</span>
          {unit && <span className="text-micro text-muted-foreground whitespace-nowrap">{unit}</span>}
        </span>
        {/* One rung down the ladder (convention 12): only offered while a range is active,
            because the destination — the anchor log's date search — receives that range. */}
        {inspect && (
          <button
            type="button"
            onClick={inspect}
            title={
              inspectCommits
                ? `Open the snapshot records for ${inspectCommits} in this range — also selects it as the network`
                : "Open this range in the Snapshots view's raw data search"
            }
            // Reads as a LINK, not a label (user, 2026-09-09): primary ink + a trailing
            // arrow mark + hover underline — the app's "this goes somewhere" signals. Text
            // FIRST so the flex baseline is the text's (a leading icon was what knocked the
            // earlier cut off the head's baseline).
            className="inline-flex items-center gap-0.5 text-micro text-primary/80 hover:text-primary hover:underline underline-offset-2 whitespace-nowrap"
          >
            snapshot records
            <ArrowUpRight aria-hidden className="size-3" />
          </button>
        )}
        {/* The pair legend — only when there IS a pair (one series needs no legend, its name is
            the title). */}
        {lines.length > 1 && (
          <span className="ml-auto inline-flex items-center gap-2 text-micro text-muted-foreground">
            {lines.map((l) => (
              <span key={l.label} className="inline-flex items-center gap-1">
                <svg width="14" height="4" aria-hidden>
                  <line x1="0" y1="2" x2="14" y2="2" stroke={l.hue ?? hue0} strokeWidth="2" strokeDasharray={typeof l.dash === "string" ? l.dash : l.dash ? "3 3" : undefined} />
                </svg>
                {l.label}
              </span>
            ))}
          </span>
        )}
        {lines.length === 1 && last != null && (
          // The readout NAMES ITS RELATION to the window (user, 2026-09-09, third round of
          // this head: a number and a time still read as two facts — the words now say what
          // the number IS, "latest full day/hour/5 min", and the exact stamp lives on hover.
          // "Full" because partial edges are trimmed. ("Newest" was tried for one round on a
          // staleness nuance too thin to carry — user: "'newest' not 'latest'?" — the hover
          // stamp and the gray band are what actually say when the reading lags the clock.)
          <span
            className="ml-auto inline-flex items-baseline gap-1 whitespace-nowrap"
            title={readout ? "The newest complete measured day, from the daily tier" : `The newest complete measured ${stepMs >= 86400000 ? "day" : stepMs >= 3600000 ? "hour" : "five-minute bucket"} (${stampOf(buckets[lastIdx], stepMs)})`}
          >
            {/* A null readout value is ACQUIRING — the daily tier behind "latest full day" is still in
                flight — so the slot holds its place (NodeStars) rather than show a finer bucket
                under the day's word, or a number that isn't the day's. */}
            <span className="text-label text-foreground-dim tabular-nums">
              {readout ? (readout.value != null ? format(readout.value) : <NodeStars count={3} />) : format(last)}
            </span>
            <span className="text-micro text-muted-foreground">
              · {readout ? readout.word : `latest full ${stepMs >= 86400000 ? "day" : stepMs >= 3600000 ? "hour" : "5 min"}`}
            </span>
          </span>
        )}
      </div>
      {note || !measured ? (
        <div className="h-[138px] grid place-items-center rounded-md border border-border border-dashed">
          <span className="text-label text-muted-foreground">{note ?? "no measurements in this window"}</span>
        </div>
      ) : (
        <div
          className={`relative rounded-md border border-border overflow-hidden${onRange ? " cursor-crosshair select-none touch-pan-y" : ""}${onPick ? " cursor-crosshair" : ""}`}
          role="img"
          aria-label={`${name} — ${stepMs >= 86400000 ? "daily" : stepMs >= 3600000 ? "hourly" : "5-minute"} buckets, ${n} of them`}
          onClick={
            onPick && n > 0
              ? (e) => {
                  // The plot box is PLOT_MARGIN over this plate at any width (the overlay's rule),
                  // so the fraction needs no measurement beyond the plate's own rect.
                  const rect = e.currentTarget.getBoundingClientRect();
                  const f = Math.min(1, Math.max(0, (e.clientX - rect.left - PLOT_MARGIN.left) / Math.max(1, rect.width - PLOT_INSET_X)));
                  const ms = buckets[0]! + f * (buckets[n - 1]! - buckets[0]!);
                  onPick(bucketAt(buckets, stepMs, ms) ?? ms);
                  // The plane's own click (a focus toggle) must not fire for the same press.
                  e.stopPropagation();
                }
              : undefined
          }
        >
          {(() => {
            const plot = (
              <TrendPlot
                syncId={syncId}
                lines={lines}
                buckets={buckets}
                stepMs={stepMs}
                format={format}
                scaleMax={scaleMax}
                sampled={sampled}
                gaps={gaps}
                onRange={onRange}
                fill={fill}
                plotH={plotHeight}
              />
            );
            // `relative`, so the plot's own absolutely-placed readout keeps the box it had: the roll
            // is a transform, and a transformed element becomes the containing block of its
            // absolute descendants whether it asked to or not. A plain template string, NOT `cn()`:
            // the roll recipe carries several `[transition:…]` values under different variants and
            // twMerge must not be given the chance to "resolve" them.
            return rollClassName == null ? plot : <div className={`relative ${rollClassName}`}>{plot}</div>;
          })()}
          {/* THE SHARED CURSOR, AS AN OVERLAY RATHER THAN A RECHARTS CHILD
              (2026-09-19). It marks the bucket that CONTAINS the instant (`bucketAt`) or nothing at
              all — the `ReferenceLine`'s rule exactly, and rule 10's: a mark one bucket off is a
              chart naming the wrong day, in the one place a reader could never catch it. What
              changed is WHO DRAWS IT. Inside the chart, every cursor write re-rendered the whole
              recharts tree; five planes of that per bucket measured at 3-4 FPS across a scrub,
              which made this view's primary gesture unusable. Out here the plot is memoised and
              untouched, and a scrub moves ONE absolutely-positioned hairline.
              ⚠️ ITS X IS THE CHART'S OWN SCALE, RE-EXPRESSED IN CSS — not a second opinion about
              it. The XAxis is numeric over `["dataMin","dataMax"]`, so a bucket's position is a
              pure fraction of the plot box (`cursorFraction`), and the box is `PLOT_MARGIN` over a
              hidden YAxis that reserves nothing. `calc()` over a percentage of this plate is
              therefore exact at ANY width with no measurement and no ResizeObserver, which is also
              what lets it ride the 3D plane's projected scale.
              Structural accent, one hairline, no animation, no pointer events: it is a POSITION,
              and a position that eases in lags the gesture that set it. */}
          {cursorX != null && (
            <div
              aria-hidden
              className="absolute w-px bg-[var(--primary)] pointer-events-none"
              style={{
                top: PLOT_MARGIN.top,
                height: plotInnerH(plotHeight),
                left: `calc(${PLOT_MARGIN.left}px + ${cursorX} * (100% - ${PLOT_INSET_X}px))`,
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ---- THE PLOT, MEMOISED (2026-09-19) -----------------------------------------------
//
// THE SPLIT EXISTS FOR ONE MEASURED REASON. The History view's stack subscribes to the shared time
// cursor, and a scrub writes once per BUCKET — so before this split, dragging the timeline
// re-rendered five full recharts trees per step: measured at ~3-4 FPS over the `all` window, with
// ~93% of the cost in these charts. A HOVER did the same, because the stack also subscribes to the
// pairing channel. Neither gesture changes a single point of any series.
//
// So everything recharts draws lives HERE, behind `React.memo`, and its props are the SERIES and
// the axis and nothing else. The cursor and the hover are drawn OUTSIDE this boundary: the cursor
// as one absolutely-positioned hairline, the hover as the plane wrapper's own opacity. The memo is
// a plain shallow compare, deliberately — a custom comparator deep-comparing a thousand-bucket
// series on every render is the very cost it would be there to avoid, and it would HIDE prop churn
// instead of fixing it. The references hold still because their owners hold them still
// (`useTrendRoster`'s memoised pass, `TrendStack`'s memoised `lines` and `scaleMax`, and this
// file's hoisted `PLAIN`).
//
// ⚠️ IT RENDERS A FRAGMENT, NOT A BOX. The plate, its hairline, its `role="img"` and the cursor
// overlay all stay with the parent, so the DOM the Trends DOCUMENT produces is exactly what it was
// before the split — a wrapper here would have changed every chart's box on a page of dozens of
// them, for nothing.
//
// THE DRAG-TO-SELECT STATE MOVED IN WITH IT. The range brush is the plot's own gesture and the
// head has nothing to do with it, so its in-flight preview now re-renders only this subtree.
const TrendPlot = memo(function TrendPlot({
  syncId,
  lines,
  buckets,
  stepMs,
  format,
  scaleMax,
  sampled,
  gaps,
  onRange,
  fill,
  plotH,
}: {
  /** See the outer component's prop — a STRING, so it holds the memo still. */
  syncId: string;
  lines: TrendLine[];
  buckets: number[];
  stepMs: number;
  format: (v: number) => string;
  scaleMax?: number;
  sampled?: (number | null)[];
  gaps?: (number | null)[];
  onRange?: (fromMs: number, toMs: number) => void;
  /** See the outer component's prop — a plain boolean, so it holds the memo still. */
  fill?: boolean;
  /** The plot's height in CSS px (the outer `plotHeight`) — a number, so it holds the memo still. */
  plotH: number;
}) {
  const n = buckets.length;
  const hue0 = lines[0]?.hue ?? "var(--primary)";
  // The hatch pattern's SVG id — per chart instance (useId), sanitized because url(#…)
  // fragments dislike the ':' React ids carry.
  const hatchId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  /** The area gradient's id, off the same per-instance base — a paint server is referenced by
   *  document id, so two planes sharing one would have the second silently repaint the first. */
  const fillId = `${hatchId}-fill`;
  // ⚠️ THE CHART TYPE IS THE FILL'S ONLY COST, AND THE DOCUMENT NEVER PAYS IT. recharts 3's `Area`
  // returns null unless the chart names itself `AreaChart` or `ComposedChart`, and `chartName` is
  // the ONLY thing separating `LineChart` from `ComposedChart` in this version — same
  // `CartesianChart`, same defaults, same tooltip cursor. So the swap is inert for everything
  // below, and it is still made conditionally: with `fill` off the document renders the very
  // element it rendered before, which is a proof rather than a comparison.
  const Chart = fill ? ComposedChart : LineChart;
  // The in-flight drag, as bucket instants — preview only; the committed range lives on the
  // page (one selection, every chart). Cleared on release or when the pointer leaves.
  const [drag, setDrag] = useState<{ a: number; b: number } | null>(null);
  const dragProps = onRange
    ? {
        onMouseDown: (e: { activeLabel?: string | number }, ev?: { preventDefault?: () => void }) => {
          // preventDefault kills the NATIVE selection at its source: select-none only covers
          // the chart, and a drag that crossed its edge started selecting the page text
          // beyond it (user, 2026-09-09, round 2 of the selectable-chart bug).
          ev?.preventDefault?.();
          const ts = Number(e?.activeLabel);
          if (Number.isFinite(ts)) setDrag({ a: ts, b: ts });
        },
        onMouseMove: (e: { activeLabel?: string | number }) => {
          const ts = Number(e?.activeLabel);
          if (drag && Number.isFinite(ts)) setDrag({ a: drag.a, b: ts });
        },
        onMouseUp: () => {
          if (drag) {
            const lo = Math.min(drag.a, drag.b);
            const hi = Math.max(drag.a, drag.b);
            // A click (no travel) is not a range — require at least one full bucket.
            if (hi - lo >= stepMs) onRange(lo, hi + stepMs);
          }
          setDrag(null);
        },
        onMouseLeave: () => setDrag(null),
        // TOUCH mirrors the mouse drag (user, 2026-09-10 — the zoom must work on tablet and
        // phone). The plate's `touch-pan-y` splits the gestures: a horizontal drag selects,
        // a vertical swipe still scrolls the document. Touchstart may fire before recharts
        // has a coordinate, so the drag begins lazily on the first labelled event.
        onTouchStart: (e: { activeLabel?: string | number }) => {
          const ts = Number(e?.activeLabel);
          if (Number.isFinite(ts)) setDrag({ a: ts, b: ts });
        },
        onTouchMove: (e: { activeLabel?: string | number }) => {
          const ts = Number(e?.activeLabel);
          if (!Number.isFinite(ts)) return;
          setDrag((d) => (d ? { a: d.a, b: ts } : { a: ts, b: ts }));
        },
        onTouchEnd: () => {
          // The closure's `drag`, like onMouseUp — committing inside a setState updater
          // would double-fire under Strict Mode (updaters must stay pure).
          if (drag) {
            const lo = Math.min(drag.a, drag.b);
            const hi = Math.max(drag.a, drag.b);
            if (hi - lo >= stepMs) onRange(lo, hi + stepMs);
          }
          setDrag(null);
        },
      }
    : {};
  // ⚠️ THE PEAK READOUT IS THE CHART'S OWN, WHATEVER THE SCALE. `ownMax` is what this chart's
  // data reaches; `max` is the height it is drawn against, which a caller may impose to put a
  // column of charts on one scale. Keeping them separate is what lets a chart shrink to a sliver
  // and still say, in its own corner, how high it actually got — otherwise a shared scale would
  // flatten the small networks AND take away the number that says by how much.
  const ownMax = Math.max(1e-9, ...lines.flatMap((l) => l.points.filter((v): v is number => v != null)));
  const max = (scaleMax != null && scaleMax > 0 ? scaleMax : ownMax) * 1.12;

  const rows = buckets.map((ts, i) => {
    const row: Record<string, number | null> = { ts };
    for (const l of lines) row[l.label] = l.points[i];
    return row;
  });

  // Axis marks at the granularity the window can carry: months for a long daily window, days
  // for a week, weekly (Mondays) for a month of hours, six-hour marks inside a day.
  const spanMs = n > 1 ? buckets[n - 1] - buckets[0] : 0;
  const ticks: number[] = [];
  for (let i = 1; i < n; i++) {
    const d = new Date(buckets[i]);
    const prev = new Date(buckets[i - 1]);
    if (spanMs > 45 * 86400000) {
      if (prev.getUTCMonth() !== d.getUTCMonth()) ticks.push(buckets[i]);
    } else if (spanMs > 2 * 86400000) {
      if (prev.getUTCDate() !== d.getUTCDate() && (spanMs <= 9 * 86400000 || d.getUTCDay() === 1)) ticks.push(buckets[i]);
    } else if (d.getUTCHours() % 6 === 0 && d.getUTCMinutes() === 0 && !(prev.getUTCHours() === d.getUTCHours() && prev.getUTCDate() === d.getUTCDate())) {
      ticks.push(buckets[i]);
    }
  }
  const tickLabel = (ts: number): string => {
    const d = new Date(ts);
    if (spanMs > 45 * 86400000) return d.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });
    if (spanMs > 2 * 86400000) return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
    return `${String(d.getUTCHours()).padStart(2, "0")}:00`;
  };

  /** An isolated measured point (both neighbours null) gets a dot — no segment can reach it. */
  const isolated = (l: TrendLine, i: number): boolean =>
    l.points[i] != null && (i === 0 || l.points[i - 1] == null) && (i === n - 1 || l.points[i + 1] == null);

  // VERTICAL BANDS, THREE KINDS (user, 2026-09-09/10, one long arc — the 09-09 rounds set
  // the form and flipped the meaning ("switch it around"); 09-10 split the silence itself,
  // "is amber then the correct color?"): these charts are ABOUT the network, and a colour
  // is a claim, so each band claims exactly what is provable.
  //   AMBER — a measured silence EXCEPTIONAL for this chain: the run's ledger-proven pause
  //     (the resume bucket's own gapMax, else the run's span) exceeds the chain's threshold.
  //   GRAY (plain fill) — a measured silence WITHIN the chain's normal rhythm: sealed
  //     nothing, said quietly, because for a bursty chain that is ordinary texture.
  //   HATCHED — a stretch this app itself did not sample: a texture, not a tone, so our own
  //     coverage caveat can never be confused with a statement about the chain.
  //   The threshold is MEDIAN × 5 of the window's own per-bucket widest gaps — the median,
  //   not a high quantile, because a p95 needs ~100+ buckets and lets a big stall inside a
  //   small zoom become its own yardstick (the tail judging the tail); the median is stable
  //   from a dozen buckets and one monster gap cannot move it. Fewer than 12 gap samples
  //   (or no `gaps` series) falls back to every proven silence ambering — the pre-split
  //   vocabulary, which only ever OVER-warns.
  //   A bucket is unmeasured only when EVERY line has nothing there (a pair's one-sided null
  //   is that series' own gap), and the never-measured LEADING prefix is the instrument's
  //   birthdate — no band at all.
  const bandRunsIdx = (inRun: (i: number) => boolean, startAt: number): { s: number; e: number }[] => {
    const out: { s: number; e: number }[] = [];
    let start = -1;
    for (let i = startAt; i < n; i++) {
      if (inRun(i)) {
        if (start < 0) start = i;
      } else if (start >= 0) {
        out.push({ s: start, e: i - 1 });
        start = -1;
      }
    }
    if (start > 0) out.push({ s: start, e: n - 1 });
    return out;
  };
  const spanOf = (r: { s: number; e: number }): { x1: number; x2: number } => ({
    x1: buckets[Math.max(0, r.s - 1)],
    x2: buckets[Math.min(n - 1, r.e + 1)],
  });
  const unmeasuredAt = (i: number): boolean =>
    sampled ? sampled[i] == null : lines.every((l) => l.points[i] == null);
  const firstMeasured = buckets.findIndex((_, i) => !unmeasuredAt(i));
  const holes = (firstMeasured >= 0 ? bandRunsIdx(unmeasuredAt, Math.max(0, firstMeasured)) : []).map(spanOf);
  const gapSamples = gaps ? gaps.filter((v): v is number => v != null).sort((a, b) => a - b) : [];
  const gapThreshold = gapSamples.length >= 12 ? gapSamples[Math.floor(gapSamples.length / 2)] * 5 : null;
  const stallRuns = sampled ? bandRunsIdx((i) => sampled[i] === 0, 0) : [];
  const stallKind = (r: { s: number; e: number }): boolean => {
    if (gapThreshold == null) return true; // no baseline — over-warn, never under
    const proven = gaps?.[r.e + 1];
    const pause = proven != null ? proven : ((r.e - r.s + 1) * stepMs) / 1000;
    return pause > gapThreshold;
  };
  const stalls = stallRuns.filter((r) => stallKind(r)).map(spanOf);
  const quiets = stallRuns.filter((r) => !stallKind(r)).map(spanOf);

  return (
    <>
          <ResponsiveContainer width="100%" height={plotH + AXIS_H}>
            <Chart
              data={rows}
              syncId={syncId}
              syncMethod="value"
              margin={PLOT_MARGIN}
              // ⚠️ NO RECHARTS ACCESSIBILITY LAYER (user, 2026-09-19: "the charts are selectable and
              // get a white outline, that is not needed"). recharts 3 turns it on by default, which
              // makes every chart's <svg> a focusable `role="application"` — so a click on a chart
              // FOCUSED it and the browser drew its focus ring around the plot, on a surface with
              // nothing to operate. It was also a contradiction: the frame around this chart is
              // `role="img"` with a full label, and an application inside an image is two answers
              // to "what is this". The chart is an image; the controls are the head strip, the
              // timeline and the rail, each of which is a real, labelled target.
              accessibilityLayer={false}
              {...dragProps}
            >
              {/* THE FILL'S GRADIENT — light, not a slab. It runs from the line's own hue at the
                  area's top edge to nothing at the baseline, so a plane reads as a translucent
                  sheet rather than as a painted block, and five of them stacked stay legible
                  through each other. `--trend-fill-top` is a NUMBER token, so its per-ground value
                  is CSS's to decide (globals.css states both, by the `--ident-l` exception's own
                  mechanism): on paper the hue is ink and the same presence would read as a slab.
                  Colour is the hue string itself — a CSS variable or an identity oklch — so no
                  literal enters here (rule 3). */}
              {fill && (
                <defs>
                  <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={hue0} style={{ stopOpacity: "var(--trend-fill-top)" }} />
                    <stop offset="100%" stopColor={hue0} stopOpacity={0} />
                  </linearGradient>
                </defs>
              )}
              {/* The drag preview — the committed cut happens on the PAGE at release. */}
              {drag && (
                <ReferenceArea
                  x1={Math.min(drag.a, drag.b)}
                  x2={Math.max(drag.a, drag.b)}
                  fill="var(--primary)"
                  fillOpacity={0.12}
                  stroke="var(--primary)"
                  strokeOpacity={0.4}
                />
              )}
              <CartesianGrid
                vertical={false}
                stroke="var(--border)"
                strokeOpacity={0.5}
                horizontalCoordinatesGenerator={({ height }) => [height * 0.25, height * 0.5, height * 0.75]}
              />
              <XAxis
                dataKey="ts"
                type="number"
                domain={["dataMin", "dataMax"]}
                ticks={ticks}
                tickFormatter={tickLabel}
                axisLine={false}
                tickLine={false}
                height={AXIS_H}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              />
              <YAxis hide domain={[0, max]} />
              {/* Both kinds paint the full tile via the custom shape (plot + axis strip; the
                  plate's overflow-hidden keeps the corners) — the outage owns its column. */}
              {holes.map((h) => (
                <ReferenceArea
                  key={`hole-${h.x1}`}
                  x1={h.x1}
                  x2={h.x2}
                  shape={({ x, width }: { x?: number; width?: number }) =>
                    x != null && width != null ? (
                      // NOT-SAMPLED is a TEXTURE, not a tone (the band comment): diagonal
                      // hatching says "no reading here" the way a drawing voids a region,
                      // and can never be confused with the quiet-gray fill beside it.
                      <g>
                        <defs>
                          <pattern id={`${hatchId}-${h.x1}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--muted-foreground)" strokeWidth="1.5" strokeOpacity="0.3" />
                          </pattern>
                        </defs>
                        <rect x={x} y={0} width={width} height={plotH + AXIS_H} fill={`url(#${hatchId}-${h.x1})`} />
                      </g>
                    ) : (
                      <g />
                    )
                  }
                />
              ))}
              {quiets.map((h) => (
                <ReferenceArea
                  key={`quiet-${h.x1}`}
                  x1={h.x1}
                  x2={h.x2}
                  shape={({ x, width }: { x?: number; width?: number }) =>
                    x != null && width != null ? (
                      <rect x={x} y={0} width={width} height={plotH + AXIS_H} fill="var(--muted-foreground)" fillOpacity={0.12} />
                    ) : (
                      <g />
                    )
                  }
                />
              ))}
              {stalls.map((h) => (
                <ReferenceArea
                  key={`stall-${h.x1}`}
                  x1={h.x1}
                  x2={h.x2}
                  shape={({ x, width }: { x?: number; width?: number }) =>
                    x != null && width != null ? (
                      <rect x={x} y={0} width={width} height={plotH + AXIS_H} fill="var(--warn-soft)" fillOpacity={0.24} />
                    ) : (
                      <g />
                    )
                  }
                />
              ))}
              {/* THE AREA, UNDER THE FIRST LINE ONLY. It is drawn before the lines so the hairline
                  stays the plane's sharpest mark, and it takes no part in anything else: no
                  stroke of its own (the `Line` beside it IS the edge) and no dots.
                  `connectNulls={false}` and `baseValue={0}` are the two honesty props — a gap in
                  the series is a gap in the fill, and the fill's floor is the axis's own zero
                  rather than whatever the window's minimum happens to be.

                  ⚠️ WHAT KEEPS A HOVER TO ONE READING PER SERIES IS THE TOOLTIP'S OWN CONTENT, not
                  `tooltipType` (the first cut of this comment named the wrong
                  mechanism). The Area shares the Line's `dataKey`, so recharts hands the tooltip a
                  SECOND payload entry with the same key and the same value; the custom content
                  below iterates `lines` and looks each one up with `payload.find(e => e.dataKey
                  === l.label)`, which takes the first match, so the duplicate is never read.
                  `tooltipType="none"` is therefore inert HERE — recharts 3.9 honours it only in
                  `DefaultTooltipContent`, which filters out entries whose `type` is `"none"` — and
                  it stays as the declaration that this item is not a tooltip subject, load-bearing
                  the moment a caller drops the custom content. */}
              {fill && lines[0] && (
                <Area
                  dataKey={lines[0].label}
                  type="linear"
                  stroke="none"
                  fill={`url(#${fillId})`}
                  fillOpacity={1}
                  baseValue={0}
                  connectNulls={false}
                  isAnimationActive={false}
                  dot={false}
                  activeDot={false}
                  legendType="none"
                  tooltipType="none"
                />
              )}
              <Tooltip
                isAnimationActive={false}
                cursor={{ stroke: "var(--primary)", strokeOpacity: 0.4 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="rounded border border-border bg-[var(--panel)] px-1.5 py-0.5 text-micro text-foreground whitespace-nowrap tabular-nums">
                      <span className="text-muted-foreground">{stampOf(Number(label), stepMs)}{" · "}</span>
                      {lines.map((l, li) => {
                        const v = payload.find((e) => e.dataKey === l.label)?.value;
                        return (
                          <span key={l.label}>
                            {li > 0 && <span className="text-muted-foreground"> · </span>}
                            {lines.length > 1 && <span className="text-muted-foreground">{l.label} </span>}
                            {v != null ? format(Number(v)) : "—"}
                          </span>
                        );
                      })}
                    </div>
                  );
                }}
              />
              {lines.map((l) => (
                <Line
                  key={l.label}
                  dataKey={l.label}
                  type="linear"
                  stroke={l.hue ?? hue0}
                  strokeWidth={2}
                  strokeDasharray={typeof l.dash === "string" ? l.dash : l.dash ? "4 4" : undefined}
                  connectNulls={false}
                  isAnimationActive={false}
                  dot={(props: { key?: React.Key | null; index?: number; cx?: number; cy?: number }) => {
                    const { key, index, cx, cy } = props;
                    if (index == null || cx == null || cy == null || !isolated(l, index)) return <g key={key ?? undefined} />;
                    return <circle key={key ?? undefined} cx={cx} cy={cy} r={2.5} fill={l.hue ?? hue0} />;
                  }}
                />
              ))}
            </Chart>
          </ResponsiveContainer>
          {/* The y scale's one number, with its ROLE said (user, 2026-09-09: a bare number
              top-left beside the head's readout top-right was two unexplained values) — it
              is the window's peak, and the baseline is 0 by construction. */}
          <span aria-hidden className="absolute top-1 left-1.5 text-micro text-muted-foreground pointer-events-none tabular-nums">
            peak {format(ownMax)}
          </span>
    </>
  );
});
