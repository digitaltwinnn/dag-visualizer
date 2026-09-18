"use client";

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

  const slice = assembleTrendSlice(plan, {
    main: plan.main.tiles ? mainTiles.data : main.data,
    fleet: plan.fleet.tiles ? fleetTiles.data : fleet.data,
    daily: daily.data,
  });
  return { ...slice, error: plan.main.tiles ? mainTiles.error : main.error };
}
