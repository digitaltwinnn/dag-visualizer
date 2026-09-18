"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { WindowPicker } from "@/components/trendPickers";
import useTrendsSlice from "@/components/useTrendsSlice";
import useTrendsWindow from "@/components/useTrendsWindow";
import { globalSeries } from "@/src/data/trendSeries";
import { leadingTrim } from "@/src/data/trendWindow";
import {
  axisTicks,
  classifyPress,
  clampCursor,
  isDrag,
  msAtX,
  panRange,
  rangeFrom,
  stampInstant,
  stepCursor,
  tickLabel,
  trackRuns,
  windowSpan,
  xAtMs,
  type Span,
  type TrackGeom,
} from "@/src/data/trendTimeline";
import { useStore } from "@/src/store/store";

// THE BAND'S TIMELINE (2026-09-18) — what the vitals band holds in the History view, per the
// policy row `bandContent`. The three 3D structural views put read-only vitals cells here; this
// view puts the axis its planes are drawn against, because the thing a reader wants at the bottom
// edge of a stack of charts is the WHOLE measured span and a way to say "there".
//
// ⚠️ IT IS THE BAND'S ONE INTERACTIVE TENANT, and the band's own charter is unchanged. The plate
// stays `pointer-events-none` — "no clicking etc required on any visualization here at the bottom"
// (user, 2026-08-30) is a rule about the VITALS, which are readings, and it still governs them in
// every other view. A timeline is not a reading: a track you cannot press is a picture of a
// control. So pointer events are re-enabled on THIS component's own root and nowhere else, which
// leaves the plate's rule and the orbit-drag pass-through intact everywhere it applies.
//
// THREE SUBJECTS, ONE TRACK:
//   · the OVERVIEW — one quiet line of the GLOBAL series matching `trendMetric`, over the whole
//     measured span (`all`, leading-trimmed). It is not the planes repeated: it is the frame they
//     sit in, so it is the whole network at once and never one chain.
//   · the BRUSH — the span the stack is showing. `trendRange` when one stands, else the span the
//     window pill implies; for `all` NO RECTANGLE IS DRAWN, because the absence is the statement.
//   · the CURSOR — `trendCursorMs`, a COMMIT rather than a hover: it drives rail content, so it
//     survives the pointer leaving. Hovering previews a faint line LOCALLY and writes nothing
//     (rule 9: hovers preview, never commit).
//
// THE GESTURE SPLIT IS A DECISION: a CLICK sets the cursor, a DRAG brushes a range. Both want the
// whole track, and the alternative — a modifier key for one of them — is unreachable on touch,
// which is the surface this most needs to work on. Distance is the one discriminator every
// pointer type reports, so the press's TRAVEL decides which gesture it was.
//
// EVERY DECISION A POINTER MAKES IS `src/data/trendTimeline.ts`, tested there. This file is the
// shell: measure the track, read the store, draw, and route each event through those functions.

/** The plot's height inside the track box; the rest is the month strip. */
const LABEL_H = 13;
/** A month label needs about this much room before the next one is a smear. */
const TICK_GAP_PX = 44;
/** The narrowest a brush may DRAW. A one-hour window over a six-year track is a real span and a
 *  sub-pixel rectangle; the mark has to be findable or the band would say nothing about where the
 *  stack is looking. */
const MIN_BRUSH_PX = 3;

export default function TrendTimeline() {
  const metric = useStore((s) => s.trendMetric);
  const windowId = useStore((s) => s.trendWindow);
  const range = useStore((s) => s.trendRange);
  const cursorMs = useStore((s) => s.trendCursorMs);
  const setTrendWindow = useStore((s) => s.setTrendWindow);
  const setTrendRange = useStore((s) => s.setTrendRange);
  const setTrendCursor = useStore((s) => s.setTrendCursor);

  // THE OVERVIEW PAYLOAD — the `all` window, through the SAME shared-cache hook the stack and the
  // document read, so the track costs no request the page was not already making. Leading-trimmed
  // for the page's own rule: a window that opens months before measuring began would draw a long
  // runway of hole nobody dug.
  const ov = useTrendsWindow("all");
  const overview = ov.data ? leadingTrim(ov.data) : null;
  // THE STACK'S OWN GRAIN, from the one home that decides it (`planTrendFetch`/`assembleTrendSlice`
  // through `useTrendsSlice`). The readout's precision and the arrow keys' step both follow the
  // buckets on screen, so they have to come from the same answer the planes are drawn from rather
  // than from a second reading of the window. Every payload it names is already fetched by the
  // stack; the hook's module-level cache makes this call free.
  const { stepMs } = useTrendsSlice(windowId, range);

  // The track's measured size — the SVG is drawn at exact pixels, because every gesture below is
  // an x↔ms map and an aspect-scaled viewBox would put the cursor's line where it is not.
  //
  // ⚠️ A CALLBACK REF, NOT A REF PLUS AN EFFECT. The track only mounts once the overview payload
  // has landed, so an effect keyed on `[]` runs while `ref.current` is still null, bails, and
  // never runs again: the element then has a real width and the component believes it is 0, so
  // the SVG renders at width 0 and the band draws NOTHING. (Caught live, first screenshot — it is
  // the same "the node mounts a commit later" trap the sheets' `sceneCover` records.) A callback
  // ref makes the element itself the dependency.
  const [track, setTrack] = useState<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!track) return;
    const measure = () => setBox({ w: track.clientWidth, h: track.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    measure();
    return () => ro.disconnect();
  }, [track]);

  const buckets = overview?.buckets ?? [];
  const ovStep = overview?.stepMs ?? 86_400_000;
  const geom: TrackGeom = {
    width: box.w,
    fromMs: buckets.length ? buckets[0] : 0,
    toMs: buckets.length ? buckets[buckets.length - 1] + ovStep : 1,
  };

  // The live gesture. A ref, not state: a 60–120Hz pointer stream must not re-render, and the only
  // thing React needs to see is the range PREVIEW below.
  const press = useRef<{
    id: number;
    zone: ReturnType<typeof classifyPress>;
    startX: number;
    anchorMs: number;
    startRange: Span | null;
    moved: boolean;
    /** The span the gesture has reached. ⚠️ THE REF IS THE TRUTH, the `preview` state below is
     *  only the PAINT. React batches, so a press whose move and release land in one task would
     *  commit the stale `null` a state-only version still held — caught live while verifying pan
     *  and resize. State is what the frame shows; the gesture keeps its own answer. */
    span: Span | null;
  } | null>(null);
  // THE PREVIEW IS LOCAL, AND DELIBERATELY SO. A store write re-plans the fetch (`planTrendFetch`)
  // and can re-tier every plane, so writing one per pointermove would put a fetch storm behind a
  // drag. The committed range lands on release; what you see while dragging is what you will get,
  // because both come out of the same `rangeFrom`/`panRange`.
  const [preview, setPreview] = useState<Span | null>(null);
  // The hover's faint line — a PREVIEW, never a write (rule 9).
  const [hoverX, setHoverX] = useState<number | null>(null);

  const localX = (e: { clientX: number }) => {
    const r = track?.getBoundingClientRect();
    return r ? e.clientX - r.left : 0;
  };

  const onDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!buckets.length || box.w <= 0) return;
      const x = localX(e);
      // CAPTURE, so a drag that leaves the band keeps reporting (every gesture below clamps).
      // It throws NotFoundError when the id names no active pointer — losing capture degrades the
      // drag, it does not break it, so it must never take the press down with it.
      try {
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      } catch {
        /* no capture: the gesture still works while the pointer stays over the track */
      }
      // The hover preview stands down for the duration — a second faint line trailing the real
      // gesture reads as the instrument disagreeing with itself.
      setHoverX(null);
      press.current = {
        id: e.pointerId,
        zone: classifyPress(x, geom, range, cursorMs),
        startX: x,
        anchorMs: msAtX(x, geom),
        startRange: range,
        moved: false,
        span: null,
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buckets.length, box.w, geom.fromMs, geom.toMs, range, cursorMs, track],
  );

  const onMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const x = localX(e);
      const p = press.current;
      if (!p) {
        setHoverX(x);
        return;
      }
      if (!p.moved && !isDrag(x - p.startX)) return;
      p.moved = true;
      const at = msAtX(x, geom);
      if (p.zone.kind === "cursor") {
        // CONTINUOUS: the cursor costs no fetch — every plane just moves its reference line — so
        // it is written live and the stack tracks the finger.
        setTrendCursor(clampCursor(at, geom));
        return;
      }
      const next =
        p.zone.kind === "inside"
          ? p.startRange && panRange(p.startRange, at - p.anchorMs, geom)
          : p.zone.kind === "edge"
            // A resize is a brush anchored on the OPPOSITE edge — one function, three gestures.
            ? p.startRange && rangeFrom(p.zone.edge === "from" ? p.startRange.toMs : p.startRange.fromMs, at, geom)
            : rangeFrom(p.anchorMs, at, geom);
      if (!next) return;
      p.span = next;
      setPreview(next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [geom.fromMs, geom.toMs, geom.width, setTrendCursor, track],
  );

  const onUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const p = press.current;
      press.current = null;
      if (!p) return;
      try {
        if ((e.currentTarget as HTMLDivElement).hasPointerCapture?.(p.id)) {
          (e.currentTarget as HTMLDivElement).releasePointerCapture(p.id);
        }
      } catch {
        /* the pointer is already gone — nothing to release */
      }
      if (!p.moved) {
        // A PRESS THAT DID NOT TRAVEL IS A CLICK, wherever it landed — inside the brush included.
        // Setting the cursor is the one gesture a reader wants most often, so it gets the whole
        // track and the drag gestures get the travel.
        setTrendCursor(clampCursor(msAtX(localX(e), geom), geom));
        setPreview(null);
        return;
      }
      if (p.span) setTrendRange(p.span);
      setPreview(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [geom.fromMs, geom.toMs, geom.width, setTrendCursor, setTrendRange, track],
  );

  const onCancel = useCallback(() => {
    press.current = null;
    setPreview(null);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!buckets.length) return;
    if (e.key === "Escape") {
      if (range) {
        e.preventDefault();
        setTrendRange(null);
      }
      return;
    }
    const step = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
    if (step !== 0) {
      e.preventDefault();
      setTrendCursor(stepCursor(cursorMs, stepMs, step * (e.shiftKey ? 10 : 1), geom));
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      setTrendCursor(clampCursor(geom.fromMs, geom));
    } else if (e.key === "End") {
      e.preventDefault();
      setTrendCursor(clampCursor(geom.toMs, geom));
    }
  };

  // The brush on screen: the live preview beats the committed range, which beats the window's own
  // implied span. `all` implies nothing, and that absence IS the statement.
  const brush = preview ?? range ?? (buckets.length ? windowSpan(windowId, geom) : null);

  const plotH = Math.max(0, box.h - LABEL_H);
  const points = overview ? globalSeries(metric, overview.series) : [];
  const peak = points.reduce<number>((m, v) => (v != null && v > m ? v : m), 0);
  const runs = overview && box.w > 0 ? trackRuns(points, buckets, ovStep, geom, peak, plotH) : [];
  const ticks = overview && box.w > 0 ? axisTicks(buckets, ovStep, geom, TICK_GAP_PX) : [];

  const cursorX = cursorMs != null && buckets.length ? xAtMs(cursorMs, geom) : null;
  const cursorInSpan = cursorMs != null && cursorMs >= geom.fromMs && cursorMs < geom.toMs;

  const path = (run: { x: number; y: number }[]) =>
    run.map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(" ");

  return (
    // THE ONE `pointer-events-auto` (see the header). Everything else in the band stays inert.
    <div className="pointer-events-auto flex-1 min-w-0 flex items-stretch gap-3 max-[700px]:flex-col max-[700px]:gap-1.5">
      {/* THE TRACK. `order` only on the phone arm, where the pills take their own row ABOVE it —
          the document's own stacking idiom, and the thumb wants the pills nearer the dock's edge
          than a 300px-wide scrub target does. */}
      <div className="flex-1 min-w-0 flex flex-col justify-center max-[700px]:order-2 max-[700px]:min-h-[54px]">
        {!overview && !ov.error && (
          <span className="text-micro text-muted-foreground self-center" aria-hidden>
            acquiring…
          </span>
        )}
        {!overview && ov.error && (
          <span className="text-micro text-muted-foreground self-center">
            The trends store is unreachable right now.
          </span>
        )}
        {overview && (
          <div
            ref={setTrack}
            role="slider"
            tabIndex={0}
            aria-label="Time cursor over the measured history"
            aria-valuemin={geom.fromMs}
            aria-valuemax={geom.toMs}
            {...(cursorMs != null ? { "aria-valuenow": cursorMs } : {})}
            aria-valuetext={cursorMs != null ? stampInstant(cursorMs, stepMs) : "No instant picked"}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onCancel}
            onPointerLeave={() => setHoverX(null)}
            onKeyDown={onKeyDown}
            className={cn(
              // `touch-action: none` or the browser pans the page instead of handing us the drag.
              "relative flex-1 min-h-0 w-full touch-none select-none cursor-crosshair",
              "outline-none focus-visible:ring-1 focus-visible:ring-primary/60 rounded-sm",
            )}
          >
            {/* NO `overflow-visible`: the ink is CLIPPED to the track's own box, so a peak or a
                handle can never paint over the band's plate or out into the scene. */}
            <svg width={box.w} height={box.h} className="block" aria-hidden>
              {/* THE BASELINE — the track reads as an axis even where the series is all holes. */}
              <line x1={0} y1={plotH} x2={box.w} y2={plotH} stroke="var(--border)" strokeWidth={1} />
              {/* OUTSIDE THE BRUSH THE TRACK DIMS. Drawn as two veils over the ink rather than by
                  painting the ink twice: one rule, and the gaps stay gaps. */}
              {runs.map((run, i) => (
                <g key={i}>
                  {run.length === 1 ? (
                    // An ISOLATED measured point paints nothing as a line — TrendChart's own
                    // device: draw it as a dot so a single reading is not silently dropped.
                    <circle cx={run[0].x} cy={run[0].y} r={1.2} fill="var(--primary)" opacity={0.75} />
                  ) : (
                    <>
                      <path
                        d={`${path(run)} L${run[run.length - 1].x.toFixed(1)} ${plotH} L${run[0].x.toFixed(1)} ${plotH} Z`}
                        fill="var(--primary)"
                        opacity={0.12}
                      />
                      <path d={path(run)} fill="none" stroke="var(--primary)" strokeWidth={1} opacity={0.75} />
                    </>
                  )}
                </g>
              ))}
              {brush && box.w > 0 && (
                <>
                  <rect
                    x={0}
                    y={0}
                    width={Math.max(0, xAtMs(brush.fromMs, geom))}
                    height={plotH}
                    fill="var(--background)"
                    opacity={0.55}
                  />
                  <rect
                    x={xAtMs(brush.toMs, geom)}
                    y={0}
                    width={Math.max(0, box.w - xAtMs(brush.toMs, geom))}
                    height={plotH}
                    fill="var(--background)"
                    opacity={0.55}
                  />
                  {/* The brush itself: a hairline FRAME, never a fill — a filled rectangle over a
                      chart states a value it does not have. `MIN_BRUSH_PX` keeps a one-hour window
                      over a six-year track findable. */}
                  <rect
                    x={xAtMs(brush.fromMs, geom)}
                    y={0.5}
                    width={Math.max(MIN_BRUSH_PX, xAtMs(brush.toMs, geom) - xAtMs(brush.fromMs, geom))}
                    height={Math.max(0, plotH - 1)}
                    fill="none"
                    stroke="var(--primary)"
                    strokeWidth={1}
                    opacity={0.7}
                  />
                </>
              )}
              {/* THE MONTH MARKS, the charts' own granularity read at the overview's scale. */}
              {ticks.map((t) => {
                const x = xAtMs(t, geom);
                return (
                  <g key={t}>
                    <line x1={x} y1={plotH} x2={x} y2={plotH + 3} stroke="var(--border)" strokeWidth={1} />
                    <text
                      x={x}
                      y={box.h - 2}
                      textAnchor="middle"
                      className="fill-[var(--muted-foreground)] text-[9px] tracking-caps"
                    >
                      {tickLabel(t)}
                    </text>
                  </g>
                );
              })}
              {/* THE HOVER PREVIEW — local, faint, and it writes nothing. */}
              {hoverX != null && (
                <line x1={hoverX} y1={0} x2={hoverX} y2={plotH} stroke="var(--muted-foreground)" strokeWidth={1} opacity={0.35} />
              )}
              {/* THE CURSOR, in the structural accent, with a grab handle on the baseline. */}
              {cursorX != null && cursorInSpan && (
                <g>
                  <line x1={cursorX} y1={0} x2={cursorX} y2={plotH} stroke="var(--primary)" strokeWidth={1} />
                  <rect
                    x={cursorX - 3}
                    y={plotH - 6}
                    width={6}
                    height={8}
                    rx={1.5}
                    fill="var(--primary)"
                    className="cursor-ew-resize"
                  />
                </g>
              )}
            </svg>
          </div>
        )}
      </div>
      {/* THE READOUT AND THE PILLS. On the phone arm this row sits above the track and spreads. */}
      <div className="flex-none flex items-center gap-2 max-[700px]:order-1 max-[700px]:justify-between">
        <span className="flex flex-col leading-none gap-1 whitespace-nowrap">
          <span className="text-micro tracking-[0.1em] uppercase text-muted-foreground">Cursor</span>
          {/* NO INSTANT IS A STATE, NOT A BLANK (rule 10): the rail reads this channel, so the band
              says when nothing has been picked rather than showing an empty slot. */}
          <span className={cn("text-label tabular-nums", cursorMs != null ? "text-foreground" : "text-muted-foreground")}>
            {cursorMs != null ? stampInstant(cursorMs, stepMs) : "none picked"}
          </span>
        </span>
        <WindowPicker
          zoom={windowId}
          range={range}
          stepMs={stepMs}
          onPick={setTrendWindow}
          onClearRange={() => setTrendRange(null)}
        />
      </div>
    </div>
  );
}
