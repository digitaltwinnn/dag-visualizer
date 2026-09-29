"use client";

import { useMemo, useRef } from "react";

import useTrendsWindow, { useTrendsRange } from "@/components/useTrendsWindow";
import {
  assembleTrendSlice,
  planTrendFetch,
  type TrendRange,
  type TrendSlice,
  type ZoomId,
} from "@/src/data/trendWindow";

// THE WINDOW/RANGE DATA PATH, REACT SIDE (2026-09-18) — the hook the Trends DOCUMENT and the 3D
// TREND STACK both read. It holds no decisions of its own: `planTrendFetch` says which payloads a
// window needs, this calls the fetch hooks the plan names, and `assembleTrendSlice` performs every
// cut. The two surfaces are TWO REGISTERS OF ONE RUNG (convention 12), and they already share the
// chart primitive (`components/docs/TrendChart.tsx`) and the per-network series maths
// (`src/data/trendSeries.ts`) — this is the third leg, so a window can no longer mean one thing on
// the page and another in the scene.
//
// ONE FETCH PATH WITH THE BAND (review, 2026-09-09 — the doc carried its own raw fetch and a
// second, divergent leading-trim): `useTrendsWindow` brings the shared cache (a rim-to-doc hop
// re-uses the vitals band's payload), the pulse-strip health reporting and the 5-minute refresh.
// It keeps the previous window's payload until the new one lands, which is what preserves the
// document's no-loading-flash rule on a zoom change.
//
// ⚠️ EVERY HOOK IS CALLED UNCONDITIONALLY, with the plan's `null` where it says "don't fetch" —
// both fetch hooks document that form, and it is the only way a conditional need can be expressed
// in React. A `null` zoom plans nothing at all, which is how a consumer that is not currently
// showing charts (the stack while the view is elsewhere) pays for no fetch.

export interface TrendsSlice extends TrendSlice {
  /** The CHARTS' own payload failed and nothing cached answers — say so in words rather than
   *  promising a number forever (the fetch hooks' "failure is a signal, not a silence" contract).
   *  It reports whichever leg the plan actually asked for: a window, or the range's tiles. */
  error: boolean;
  /** The charts are showing the PREVIOUS window while the new one loads (see the hold below). */
  stale: boolean;
}

/** The window on screen for one zoom (and an optional committed range), fetched and cut.
 *  `zoom: null` fetches nothing — see the header. */
export default function useTrendsSlice(zoom: ZoomId | null, range: TrendRange | null): TrendsSlice {
  const plan = planTrendFetch(zoom, range);
  const main = useTrendsWindow(plan.main.window);
  const mainTiles = useTrendsRange(plan.main.tiles);
  const fleet = useTrendsWindow(plan.fleet.window);
  const fleetTiles = useTrendsRange(plan.fleet.tiles);
  const daily = useTrendsWindow(plan.daily);

  const mainData = plan.main.tiles ? mainTiles.data : main.data;
  const fleetData = plan.fleet.tiles ? fleetTiles.data : fleet.data;
  const dailyData = daily.data;
  const fromMs = range?.fromMs ?? null;
  const toMs = range?.toMs ?? null;

  // ⚠️ MEMOISED, AND THE KEY IS NOT THE PLAN (review, 2026-09-18). `assembleTrendSlice` cuts,
  // trims and copies every series of a payload that is ~450 daily buckets wide — and this hook
  // runs on EVERY render of both its consumers, including the ones a time-cursor scrub causes,
  // where not one of its inputs has moved. The plan cannot be the key: `planTrendFetch` builds a
  // fresh object each call, so a plan-keyed memo would never hit. The identity-stable inputs are
  // the ZOOM, the range's two NUMBERS and the three payload REFERENCES (the fetch hooks hand back
  // the same object until a load replaces it), so those are the key and the plan is rebuilt
  // inside — it is a handful of object literals against an O(buckets × series) walk.
  //
  // Rebuilding the range from its two numbers is behaviour-identical: `planTrendFetch` reads only
  // `fromMs`/`toMs`, and the document's extra `metaId` (whose chart a drag was drawn on) travels
  // with the range elsewhere and reaches nothing in this path. The document's own behaviour is
  // therefore unchanged — same payloads, same cuts, same object shape.
  const slice = useMemo(
    () =>
      assembleTrendSlice(planTrendFetch(zoom, fromMs != null && toMs != null ? { fromMs, toMs } : null), {
        main: mainData,
        fleet: fleetData,
        daily: dailyData,
      }),
    [zoom, fromMs, toMs, mainData, fleetData, dailyData],
  );
  const error = plan.main.tiles ? mainTiles.error : main.error;
  // ⚠️ NEVER BLANK BETWEEN WINDOWS (user, 2026-09-29: "when we change the range, the chart goes
  // blank and then rebuilds"). A new window or range asks for a DIFFERENT payload — another tier,
  // or tiles — and until it lands the slice has no charts, so every plane drew nothing. The last
  // slice that HAD charts is held and handed back, marked `stale`, until the new one arrives; a
  // consumer may quiet it, never pretend it is the new window. A failure is not a wait: an error
  // shows the honest state instead of the old window standing in for an answer.
  const lastGood = useRef<TrendSlice | null>(null);
  if (slice.p) lastGood.current = slice;
  // Only while a window IS asked for: a null zoom means the consumer isn't showing charts at all.
  const held = zoom != null && !slice.p && !error && lastGood.current != null;
  return { ...(held ? lastGood.current! : slice), error, stale: held };
}
