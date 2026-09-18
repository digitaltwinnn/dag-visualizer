"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { globalSeries } from "@/src/data/trendSeries";
import type { TrendsWindowData } from "@/src/data/trendWindow";
import {
  axisTicks,
  classifyPress,
  clampCursor,
  drawnSpan,
  isDrag,
  msAtX,
  panRange,
  rangeFrom,
  sameBucket,
  stampInstant,
  stepCursor,
  tickLabel,
  trackRuns,
  xAtMs,
  type Span,
  type TrackGeom,
} from "@/src/data/trendTimeline";
import type { TrendMetric } from "@/src/store/store";
import type { ZoomId } from "@/src/data/trendWindow";

// THE TIMELINE'S TRACK — the SVG and every gesture on it. Split out of
// `components/TrendTimeline.tsx` (2026-09-18) when that file passed ~300 lines: the shell is the
// band tenant (which payload, the readout, the window pills) and this is the instrument, and they
// share exactly one thing — the overview payload and the grain to stamp an instant at. Nothing
// here reads the store except through the props the shell hands it, so the whole gesture surface
// can be reasoned about as one function of (payload, range, cursor).
//
// THE GEOMETRY LIVES HERE because the track MEASURES ITSELF: `TrackGeom` is this element's own
// width married to the payload's span, and nothing above it has either number. Every decision a
// pointer makes over that geometry is pure and tested in `src/data/trendTimeline.ts`; this file
// is the wiring.
//
// ⚠️ THE GESTURE SPLIT: a CLICK sets the cursor, a DRAG brushes a range — press inside the span
// on screen to pan it, on an edge to resize it, Escape to clear it. Both gestures want the whole
// track, and the alternative (a modifier key for one of them) is unreachable on touch, which is
// the surface this most needs to work on. TRAVEL is the one discriminator every pointer type
// reports, so the press's distance decides which gesture it was.
//
// ⚠️ WHAT IS DRAWN IS WHAT IS GRABBED, and it is ONE expression (`drawnSpan`, review 2026-09-18).
// The paint used to fall back to the window pill's implied span while the hit test saw only the
// committed range, so in five of the six window states the rectangle on screen had edges that
// would not resize and an interior that would not pan. Both now read the same function, and
// panning or resizing a window-implied span COMMITS it as a `trendRange` — that is what the
// gesture means, and the pills then show the range chip as they do for any range. A press OUTSIDE
// the drawn span still starts a fresh brush.
//
// ⚠️ AND THE SCRUB WRITES ONCE PER BUCKET, not once per pointermove (`sameBucket`). Every write
// re-plans the fetch and re-renders five recharts plots for the whole stack, and two instants
// inside one bucket paint the identical frame — see the quantiser's own note.

/** The plot's height inside the track box; the rest is the month strip. */
const LABEL_H = 13;
/** A month label needs about this much room before the next one is a smear. */
const TICK_GAP_PX = 44;
/** The narrowest a brush may DRAW. A one-hour window over a six-year track is a real span and a
 *  sub-pixel rectangle; the mark has to be findable or the band would say nothing about where the
 *  stack is looking. */
const MIN_BRUSH_PX = 3;

export default function TrendTrack({
  overview,
  metric,
  windowId,
  range,
  cursorMs,
  stepMs,
  setTrendRange,
  setTrendCursor,
}: {
  /** The whole measured span, already leading-trimmed. */
  overview: TrendsWindowData;
  metric: TrendMetric;
  windowId: ZoomId;
  range: Span | null;
  cursorMs: number | null;
  /** The bucket size the STACK is drawn at — the arrow keys' step and the readout's precision. */
  stepMs: number;
  setTrendRange: (r: Span | null) => void;
  setTrendCursor: (ms: number | null) => void;
}) {
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

  const buckets = overview.buckets;
  const ovStep = overview.stepMs;
  // MEMOISED so everything derived from it can be too: `geom` is the identity the ink, the ticks
  // and every gesture callback key on, and a fresh object per render would defeat all of them.
  const geom = useMemo<TrackGeom>(
    () => ({
      width: box.w,
      fromMs: buckets.length ? buckets[0] : 0,
      toMs: buckets.length ? buckets[buckets.length - 1] + ovStep : 1,
    }),
    [box.w, buckets, ovStep],
  );

  // The live gesture. A ref, not state: a 60–120Hz pointer stream must not re-render.
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
    /** The instant last WRITTEN to the store, for the scrub's per-bucket quantiser. Seeded from
     *  the COMMITTED cursor, not null: a handle drag starts on the bucket the cursor already
     *  occupies, so a null seed spent one guaranteed no-op write — the full stack re-render — on
     *  the first move of every scrub (review, 2026-09-18 round 2). Unread outside the cursor
     *  branch, which is why seeding it unconditionally costs nothing. */
    wroteMs: number | null;
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

  /** DISARM. Hoisted above the handlers because every one of them defers to it — a cancel, a
   *  lost capture, and the stale-button bail inside `onMove`. */
  const onCancel = useCallback(() => {
    press.current = null;
    setPreview(null);
  }, []);

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
      // THE SPAN ON SCREEN, not the committed range — see the header. `preview` is null at press
      // time by construction, so this is the same expression the paint reads one render later.
      const shown = drawnSpan(null, range, windowId, geom);
      press.current = {
        id: e.pointerId,
        zone: classifyPress(x, geom, shown, cursorMs),
        startX: x,
        anchorMs: msAtX(x, geom),
        startRange: shown,
        moved: false,
        span: null,
        wroteMs: cursorMs,
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buckets.length, box.w, geom, range, windowId, cursorMs, track],
  );

  const onMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const x = localX(e);
      const p = press.current;
      if (!p) {
        setHoverX(x);
        return;
      }
      // ⚠️ A RELEASE THIS ELEMENT NEVER SAW leaves the press armed, and the next hover would
      // silently continue the drag. A mouse reporting no buttons is that state, exactly — the
      // button went up somewhere we do not get events from (capture lost, a release outside the
      // window). `onLostPointerCapture` covers the other route. Touch has no button bitmask, so
      // the check names the pointer type rather than trusting `buttons` everywhere.
      if (e.pointerType === "mouse" && e.buttons === 0) {
        onCancel();
        setHoverX(x);
        return;
      }
      if (!p.moved && !isDrag(x - p.startX)) return;
      p.moved = true;
      const at = msAtX(x, geom);
      if (p.zone.kind === "cursor") {
        // ONCE PER BUCKET, not once per move (`sameBucket`): the planes mark the bucket CONTAINING
        // the instant, so two instants inside one bucket paint the identical frame — while each
        // store write re-plans the fetch and re-renders the whole stack.
        const next = clampCursor(at, geom);
        if (sameBucket(p.wroteMs, next, stepMs)) return;
        p.wroteMs = next;
        setTrendCursor(next);
        return;
      }
      const next =
        p.zone.kind === "inside"
          ? p.startRange && panRange(p.startRange, at - p.anchorMs, geom)
          : p.zone.kind === "edge"
            ? // A resize is a brush anchored on the OPPOSITE edge — one function, three gestures.
              p.startRange && rangeFrom(p.zone.edge === "from" ? p.startRange.toMs : p.startRange.fromMs, at, geom)
            : rangeFrom(p.anchorMs, at, geom);
      if (!next) return;
      p.span = next;
      setPreview(next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [geom, stepMs, setTrendCursor, onCancel, track],
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
        //
        // ⚠️ ONCE PER BUCKET HERE TOO (2026-09-19). The scrub has always quantised (`sameBucket`),
        // but a CLICK wrote whatever instant the pixel named — so two clicks inside one bucket,
        // which every surface reads as the same reading, still moved the channel. The right rail's
        // cursor card keys its title roll and its edge pulse on this value, so the second click
        // announced a new subject that was not new. One bucket, one write, whichever gesture.
        const next = clampCursor(msAtX(localX(e), geom), geom);
        if (!sameBucket(cursorMs, next, stepMs)) setTrendCursor(next);
        setPreview(null);
        return;
      }
      if (p.span) setTrendRange(p.span);
      setPreview(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [geom, cursorMs, stepMs, setTrendCursor, setTrendRange, track],
  );

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

  // THE SPAN ON SCREEN — the SAME call `onDown` hit-tests against, which is the whole point of
  // `drawnSpan` being a function rather than an expression written twice.
  const brush = buckets.length ? drawnSpan(preview, range, windowId, geom) : null;

  const plotH = Math.max(0, box.h - LABEL_H);
  // MEMOISED (review, 2026-09-18): these three walk the whole overview — ~450 daily buckets here,
  // and `globalSeries` copies every one of them — and the component re-renders on a plain HOVER
  // move (`setHoverX`), on every scrub write and on any store change the shell passes down. None
  // of that touches the payload, the metric or the box, so none of it should re-derive the ink.
  const points = useMemo(() => globalSeries(metric, overview.series), [metric, overview]);
  const peak = useMemo(() => points.reduce<number>((m, v) => (v != null && v > m ? v : m), 0), [points]);
  const runs = useMemo(
    () => (box.w > 0 ? trackRuns(points, buckets, ovStep, geom, peak, plotH) : []),
    [box.w, points, buckets, ovStep, geom, peak, plotH],
  );
  const ticks = useMemo(
    () => (box.w > 0 ? axisTicks(buckets, ovStep, geom, TICK_GAP_PX) : []),
    [box.w, buckets, ovStep, geom],
  );

  const cursorX = cursorMs != null && buckets.length ? xAtMs(cursorMs, geom) : null;
  const cursorInSpan = cursorMs != null && cursorMs >= geom.fromMs && cursorMs < geom.toMs;

  const path = (run: { x: number; y: number }[]) =>
    run.map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(" ");

  return (
    <div
      ref={setTrack}
      role="slider"
      tabIndex={0}
      aria-label="Time cursor over the measured history"
      aria-valuemin={geom.fromMs}
      aria-valuemax={geom.toMs}
      // ⚠️ `role="slider"` REQUIRES `aria-valuenow`, so it is always supplied — the span's start
      // when nothing is picked — and the HONESTY rides `aria-valuetext`, which is what a screen
      // reader actually announces. Omitting the number left the role's contract broken; putting
      // the fiction in the text would have broken rule 10. Each carries what it is for.
      aria-valuenow={cursorMs ?? geom.fromMs}
      aria-valuetext={cursorMs != null ? stampInstant(cursorMs, stepMs) : "No instant picked"}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onCancel}
      // The other way a release never arrives: the browser revokes the capture (a context menu, a
      // drag-and-drop takeover). Disarming here is what keeps the next hover from continuing it.
      onLostPointerCapture={onCancel}
      onPointerLeave={() => setHoverX(null)}
      onKeyDown={onKeyDown}
      className={cn(
        // `touch-action: none` or the browser pans the page instead of handing us the drag.
        "relative flex-1 min-h-0 w-full touch-none select-none cursor-crosshair",
        "outline-none focus-visible:ring-1 focus-visible:ring-primary/60 rounded-sm",
      )}
    >
      {/* NO `overflow-visible`: the ink is CLIPPED to the track's own box, so a peak or a handle
          can never paint over the band's plate or out into the scene. */}
      <svg width={box.w} height={box.h} className="block" aria-hidden>
        {/* THE BASELINE — the track reads as an axis even where the series is all holes. */}
        <line x1={0} y1={plotH} x2={box.w} y2={plotH} stroke="var(--border)" strokeWidth={1} />
        {runs.map((run, i) => (
          <g key={i}>
            {run.length === 1 ? (
              // An ISOLATED measured point paints nothing as a line — TrendChart's own device:
              // draw it as a dot so a single reading is not silently dropped.
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
            {/* OUTSIDE THE BRUSH THE TRACK DIMS. Two veils OVER the ink rather than the ink
                painted twice: one rule, and the gaps stay gaps. */}
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
            {/* The brush itself: a hairline FRAME, never a fill — a filled rectangle over a chart
                states a value it does not have. `MIN_BRUSH_PX` keeps a one-hour window over a
                six-year track findable. */}
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
  );
}
