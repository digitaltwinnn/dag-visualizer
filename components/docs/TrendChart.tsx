"use client";
import { useId, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { bucketAt } from "@/src/data/trendWindow";

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

export default function TrendChart({
  name,
  unit,
  lines,
  buckets,
  stepMs = 86400000,
  format = (v) => v.toLocaleString(undefined, { maximumFractionDigits: 1 }),
  sampled,
  gaps,
  onRange,
  inspect,
  inspectCommits,
  readout,
  scaleMax,
  cursorMs,
  note,
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
  readout?: { value: number; word: string };
  /** THE SHARED TIME CURSOR (2026-09-18) — `store.trendCursorMs`, one instant every plane of the
   *  3D trend stack marks at once, so a reader comparing five chains is looking at the same
   *  moment on all of them. Drawn as a vertical rule at the bucket that CONTAINS the instant
   *  (`bucketAt`), never at the nearest one: a mark one bucket off is a chart naming the wrong
   *  day, which is the kind of quiet lie rule 10 exists to prevent. Outside this chart's own span
   *  — a chain measured over a shorter window than its neighbours — NOTHING is drawn, which is
   *  the honest answer: the instant is not in this chart. The document passes nothing and renders
   *  exactly as before. */
  cursorMs?: number | null;
  /** AN INSTRUMENT STATE THE SERIES CANNOT SAY (2026-09-18). When the caller knows something the
   *  points don't — most concretely that the payload this chart needs is still IN FLIGHT — it
   *  hands the words here and the plot is replaced by them, in the chart's own empty-state frame.
   *  Rule 10: an absent payload is a state stated in words, and "no measurements in this window"
   *  would be a different claim entirely — one about the data rather than about the reading. The
   *  head still renders, so the plane keeps its name, its unit and its frame while it waits. */
  note?: string;
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
  // The hatch pattern's SVG id — per chart instance (useId), sanitized because url(#…)
  // fragments dislike the ':' React ids carry.
  const hatchId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
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
  const measured = lines.some((l) => l.points.some((v) => v != null));
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
  const stampOf = (ts: number): string =>
    stepMs < 86400000
      ? new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }) + " UTC"
      : new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

  // The cursor's bucket on THIS chart's own axis — the chart owns its scale, so the lookup runs
  // against the buckets it was actually handed (a counter series trims its partial edges, so the
  // caller's array and this one are not the same).
  const cursorBucket = cursorMs == null ? null : bucketAt(buckets, stepMs, cursorMs);

  const hue0 = lines[0]?.hue ?? "var(--primary)";
  // The head's right-hand readout: the NEWEST MEASURED BUCKET, stamped with its own date —
  // an unlabeled number reads as anything (a total, an average), and it is neither.
  let lastIdx = -1;
  for (let i = (lines[0]?.points.length ?? 0) - 1; i >= 0; i--) {
    if (lines[0].points[i] != null) { lastIdx = i; break; }
  }
  const last = lastIdx >= 0 ? lines[0].points[lastIdx] : null;

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
            title={readout ? "The newest complete measured day, from the daily tier" : `The newest complete measured ${stepMs >= 86400000 ? "day" : stepMs >= 3600000 ? "hour" : "five-minute bucket"} (${stampOf(buckets[lastIdx])})`}
          >
            <span className="text-label text-foreground-dim tabular-nums">{format(readout ? readout.value : last)}</span>
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
          className={`relative rounded-md border border-border overflow-hidden${onRange ? " cursor-crosshair select-none touch-pan-y" : ""}`}
          role="img"
          aria-label={`${name} — ${stepMs >= 86400000 ? "daily" : stepMs >= 3600000 ? "hourly" : "5-minute"} buckets, ${n} of them`}
        >
          <ResponsiveContainer width="100%" height={PLOT_H + AXIS_H}>
            <LineChart data={rows} syncId="trends" syncMethod="value" margin={{ top: 10, right: 2, bottom: 4, left: 2 }} {...dragProps}>
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
                        <rect x={x} y={0} width={width} height={PLOT_H + AXIS_H} fill={`url(#${hatchId}-${h.x1})`} />
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
                      <rect x={x} y={0} width={width} height={PLOT_H + AXIS_H} fill="var(--muted-foreground)" fillOpacity={0.12} />
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
                      <rect x={x} y={0} width={width} height={PLOT_H + AXIS_H} fill="var(--warn-soft)" fillOpacity={0.24} />
                    ) : (
                      <g />
                    )
                  }
                />
              ))}
              {/* THE SHARED CURSOR, on the bucket that CONTAINS the instant. Structural accent,
                  one hairline, and no animation — it is a POSITION, and a position that eases in
                  lags the gesture that set it. (`ReferenceLine` takes no `isAnimationActive`:
                  unlike `Line` and `Tooltip` it has no animation to switch off, which is the
                  answer we wanted.) It takes no pointer events — the plot's own drag and hover
                  belong to the chart. */}
              {cursorBucket != null && (
                <ReferenceLine
                  x={cursorBucket}
                  stroke="var(--primary)"
                  strokeWidth={1}
                  style={{ pointerEvents: "none" }}
                />
              )}
              <Tooltip
                isAnimationActive={false}
                cursor={{ stroke: "var(--primary)", strokeOpacity: 0.4 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="rounded border border-border bg-[var(--panel)] px-1.5 py-0.5 text-micro text-foreground whitespace-nowrap tabular-nums">
                      <span className="text-muted-foreground">{stampOf(Number(label))}{" · "}</span>
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
            </LineChart>
          </ResponsiveContainer>
          {/* The y scale's one number, with its ROLE said (user, 2026-09-09: a bare number
              top-left beside the head's readout top-right was two unexplained values) — it
              is the window's peak, and the baseline is 0 by construction. */}
          <span aria-hidden className="absolute top-1 left-1.5 text-micro text-muted-foreground pointer-events-none tabular-nums">
            peak {format(ownMax)}
          </span>
        </div>
      )}
    </div>
  );
}
