"use client";

import { useMemo } from "react";

import TrendTrack from "@/components/TrendTrack";
import { WindowPicker } from "@/components/trendPickers";
import useTrendsSlice from "@/components/useTrendsSlice";
import useTrendsWindow from "@/components/useTrendsWindow";
import { stepFor } from "@/src/data/trendSeries";
import { leadingTrim } from "@/src/data/trendWindow";
import { useStore } from "@/src/store/store";

// THE BAND'S TIMELINE (2026-09-18) — what the vitals band holds in the History view, per the
// policy row `bandContent`. The three STRUCTURAL 3D views put read-only vitals cells here; this
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
// THE TRACK TAKES THE WHOLE BAND, AND THE PILLS SIT ON ITS TOP-RIGHT CORNER (user, 2026-09-26:
// "remove the text 'Cursor none picked', position the range bar on top of the bottom bar (right
// side) and use that extra space for the trends with the window over it"). The band held three
// columns — track, a CURSOR readout, the pills — and the readout's 16ch reserve plus the pills'
// column cost the track a third of the lane. Now the track spans the band and the pills stand
// ABOVE the plate's top-right corner, outside it (user, 2026-09-26, second round: over the corner
// they covered the newest buckets' peaks — "above the bottom section, not directly on top of it";
// the band's clip leaves its top edge open for exactly this); on the phone arm the
// pills keep their own row above the track, since six pills over a 390px track would hide a third
// of it. THE READOUT IS GONE: the absence of a cursor line IS "none picked" (the brush's own rule
// for ALL — no rectangle, because the absence is the statement), and a picked instant is STAMPED
// on the track beside its line (`TrendTrack`), so the band still says when, in its own paint.
//
// ⚠️ THE SHELL AND THE INSTRUMENT ARE TWO FILES (2026-09-18, at ~300 lines). This is the BAND
// TENANT: which payload, the window pills, the honesty states. The track — the SVG
// and every gesture over it — is `components/TrendTrack.tsx`, because its whole subject is a
// geometry it MEASURES ITSELF and nothing here has those numbers. Every decision a pointer makes
// is pure and tested in `src/data/trendTimeline.ts`, which is what keeps both halves thin.

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
  // ⚠️ MEMOISED, AND THE REVIEW'S REASON IS THE WHOLE POINT (2026-09-18, round 2). `leadingTrim`
  // returns its input unchanged ONLY when there is no leading gap; in the `all` window's normal
  // production state it cuts, allocating a fresh `buckets` array and `series` object every call.
  // This component subscribes to `trendCursorMs`, so it re-renders on every quantised scrub write
  // — and an un-memoised trim handed `TrendTrack` a NEW payload reference each time, invalidating
  // `geom`, `points`, `peak`, `runs` and `ticks` in one go. Every memo in the track was keyed on
  // exactly the reference this line was churning, which made them cost-free no-ops during the one
  // gesture they were added for.
  const overview = useMemo(() => (ov.data ? leadingTrim(ov.data) : null), [ov.data]);
  // THE STACK'S OWN GRAIN, from the one home that decides it (`planTrendFetch`/`assembleTrendSlice`
  // through `useTrendsSlice`). The readout's precision and the arrow keys' step both follow the
  // buckets on screen, so they have to come from the same answer the planes are drawn from rather
  // than from a second reading of the window. Every payload it names is already fetched by the
  // stack; the hook's module-level cache makes this call free.
  //
  // ⚠️ AND THE METRIC DECIDES WHICH OF THE SLICE'S TWO GRAINS THAT IS (`stepFor`, 2026-09-19).
  // `nodes` is a GAUGE — an hourly instrument even when the window's main payload is 5-minute —
  // so the planes and the cursor card run on the FLEET's buckets there. Reading `slice.stepMs`
  // here made this band the one roster consumer that did not: it quantised, keyboard-stepped and
  // stamped at five minutes over charts drawn in hours, so 11 of 12 ArrowRight presses moved
  // nothing visible and the band's stamp disagreed with the card's title.
  const slice = useTrendsSlice(windowId, range);
  const stepMs = stepFor(slice, metric);
  // AN ARRIVED-BUT-EMPTY PAYLOAD IS NOT A LOADING ONE. `leadingTrim` cuts a window with no
  // measured bucket at all to EMPTY (its own documented rule), and an empty window is still an
  // object — so presence alone cannot be the gate for drawing a track.
  const measured = overview != null && overview.buckets.length > 0;

  return (
    // THE ONE `pointer-events-auto` (see the header). Everything else in the band stays inert.
    // `relative` is the pills' containing block; the track fills the rest.
    <div className="pointer-events-auto relative flex-1 min-w-0 flex flex-col max-[700px]:gap-1.5">
      {/* THE PILLS, standing above the plate's top-right corner — first in DOM order so the phone
          arm, where they are static, puts them ABOVE the track (the document's own stacking idiom:
          the thumb wants the pills nearer the dock's edge than a full-width scrub target does). */}
      <div
        // The COMMAND BAR's glass under the pills (same `--topbar-glass`, same blur): the group
        // floats over the SCENE now, where the picker's own hairline-and-wash — right for a group
        // on a page — would let the ground's ink run through the words. `bottom-full` is the
        // tenant's top; the plate's padding plus `mb-3` clears its edge by a hairline's breath.
        className="absolute bottom-full right-0 mb-3 z-[1] rounded-lg [background:var(--topbar-glass)] backdrop-blur-sm max-[700px]:static max-[700px]:mb-0 max-[700px]:self-stretch max-[700px]:bg-transparent max-[700px]:backdrop-blur-none"
      >
        <WindowPicker
          className="bg-transparent"
          zoom={windowId}
          range={range}
          stepMs={stepMs}
          onPick={setTrendWindow}
          onClearRange={() => setTrendRange(null)}
        />
      </div>
      {/* THE TRACK's column, the whole band wide. */}
      <div className="flex-1 min-h-0 flex flex-col justify-center max-[700px]:min-h-[54px]">
        {/* HONESTY STATES (rule 10). THREE facts, not two — the third was a review find: an
            ARRIVED payload with nothing measured in it. `leadingTrim` answers that case with a
            ZERO-BUCKET window, which is truthy, so the track used to render a bare axis with
            gestures that silently did nothing. "Acquiring" and "nothing measured yet" are
            different facts and a reader waiting on the first would wait forever. The pills beside
            all three keep working. */}
        {!overview && !ov.error && (
          <span className="text-micro text-muted-foreground self-center">acquiring…</span>
        )}
        {!overview && ov.error && (
          <span className="text-micro text-muted-foreground self-center">
            The trends store is unreachable right now.
          </span>
        )}
        {overview && !measured && (
          <span className="text-micro text-muted-foreground self-center">nothing measured yet</span>
        )}
        {measured && (
          <TrendTrack
            overview={overview}
            metric={metric}
            windowId={windowId}
            range={range}
            cursorMs={cursorMs}
            stepMs={stepMs}
            setTrendRange={setTrendRange}
            setTrendCursor={setTrendCursor}
          />
        )}
      </div>
    </div>
  );
}
