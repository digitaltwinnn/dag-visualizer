"use client";

import { netUrl } from "@/src/net/current";
import { reportPoll, touchPoll } from "@/src/data/api";
import { POLL } from "@/src/engine/config";
import { stitchWindows, tilesFor, type TrendsWindowData } from "@/src/data/trendWindow";
import { useEffect, useState } from "react";

// The trends store's window, client side (2026-09-08 — the vitals band's measured history;
// TrendsDoc rides it too since the 2026-09-09 review unified the two fetch paths). The
// useArchive idiom: one module-level cache shared by every consumer, an inflight promise so
// simultaneous mounts share one request, and a TTL matching the read route's own s-maxage.
// A mounted consumer refreshes on that clock; a remount inside the TTL answers from the
// cache with no request at all.
//
// The PAYLOAD IS SERVED UNTRIMMED — the honesty cuts (partial-bucket trim, leading trim,
// monthly sums) are named transforms in src/data/trendWindow.ts that each consumer applies
// per SERIES KIND: counters trim their partial edges, gauges keep today (the fleet charts'
// only current reading lives in the newest bucket — a load-time trim here once hid it).
//
// FAILURE IS A SIGNAL, NOT A SILENCE (the review's give-up finding): `error` goes true when
// a load attempt failed and nothing cached answers, so a consumer can fall back or state the
// outage instead of promising a number forever. The next tick retries; success clears it.

export type TrendsWindowState = { data: TrendsWindowData | null; error: boolean };

interface CacheSlot { at: number; data: TrendsWindowData }
const cache = new Map<string, CacheSlot>();
const inflight = new Map<string, Promise<TrendsWindowData | null>>();

async function load(url: string): Promise<TrendsWindowData | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) {
      reportPoll("api-trends", false);
      return null;
    }
    const j = (await r.json()) as { now?: number; buckets: number[]; stepMs: number; series: Record<string, (number | null)[]> };
    const data: TrendsWindowData = {
      buckets: j.buckets,
      stepMs: j.stepMs,
      series: j.series,
      // An older cached payload without the field: its receive time is the best honest bound.
      now: j.now ?? Date.now(),
    };
    cache.set(url, { at: Date.now(), data });
    reportPoll("api-trends", true);
    return data;
  } catch {
    reportPoll("api-trends", false);
    return null;
  } finally {
    inflight.delete(url);
  }
}

function fresh(url: string): TrendsWindowData | null {
  const slot = cache.get(url);
  return slot && Date.now() - slot.at < POLL.trendsMs ? slot.data : null;
}

/** The measured window plus the failure signal. A null `window` skips the fetch entirely —
 *  for consumers whose need is conditional, since a hook cannot be called conditionally. */
export default function useTrendsWindow(window: "24h" | "7d" | "30d" | "90d" | "1y" | "all" | null): TrendsWindowState {
  const url = window ? netUrl(`/api/trends?window=${window}`) : null;
  const [state, setState] = useState<TrendsWindowState>(() => ({
    data: url ? (cache.get(url)?.data ?? null) : null,
    error: false,
  }));
  useEffect(() => {
    if (!url) {
      setState({ data: null, error: false });
      return;
    }
    touchPoll("api-trends"); // present in the pulse strip from first mount, as "acquiring"
    let dead = false;
    const pull = () => {
      const hit = fresh(url);
      if (hit) {
        setState({ data: hit, error: false });
        return;
      }
      let p = inflight.get(url);
      if (!p) {
        p = load(url);
        inflight.set(url, p);
      }
      p.then((v) => {
        if (dead) return;
        // A failed load keeps whatever the cache last held (stale beats blank) and raises
        // the signal; a success replaces and clears it.
        setState((prev) => (v ? { data: v, error: false } : { data: prev.data ?? cache.get(url)?.data ?? null, error: true }));
      });
    };
    pull();
    const t = setInterval(pull, POLL.trendsMs);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, [url]);
  return url ? state : { data: null, error: false };
}

/** The RANGE fetch — the map-tile side of the observation ladder's zoom (2026-09-10): the
 *  few calendar-unit tiles a range touches, each through the same cache/inflight discipline
 *  as the windows (a complete unit is immutable and CDN-cached for a year, so re-zooming
 *  costs the browser cache at most), stitched into one window for the page to cut. */
export function useTrendsRange(
  req: { tier: "5m" | "1h"; fromMs: number; toMs: number } | null,
): TrendsWindowState {
  const key = req ? `${req.tier}:${tilesFor(req.tier, req.fromMs, req.toMs).join(",")}` : null;
  const [state, setState] = useState<TrendsWindowState>({ data: null, error: false });
  useEffect(() => {
    if (!key) {
      setState({ data: null, error: false });
      return;
    }
    touchPoll("api-trends");
    const [tier, units] = key.split(":");
    const urls = units.split(",").map((u) => netUrl(`/api/trends/tile/${tier}/${u}`));
    let dead = false;
    const pull = () => {
      void Promise.all(
        urls.map((u) => {
          const hit = fresh(u);
          if (hit) return Promise.resolve<TrendsWindowData | null>(hit);
          let p = inflight.get(u);
          if (!p) {
            p = load(u);
            inflight.set(u, p);
          }
          return p;
        }),
      ).then((tiles) => {
        if (dead) return;
        if (tiles.every((t): t is TrendsWindowData => t != null)) {
          setState({ data: stitchWindows(tiles), error: false });
        } else {
          // Stale beats blank, and the failure is a signal (the windows' own rule).
          setState((prev) => ({ data: prev.data, error: true }));
        }
      });
    };
    pull();
    const t = setInterval(pull, POLL.trendsMs);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, [key]);
  return key ? state : { data: null, error: false };
}
