"use client";

import { netUrl } from "@/src/net/current";
import { reportPoll, touchPoll } from "@/src/data/api";
import { POLL } from "@/src/engine/config";
import { useEffect, useState } from "react";

// The trends store's window, client side (2026-09-08 — the vitals band's measured history).
// The useArchive idiom: one module-level cache shared by every consumer, an inflight promise
// so simultaneous mounts share one request, and — new here — a TTL matching the read route's
// own s-maxage, because unlike the archive census this window grows every five minutes. A
// mounted consumer refreshes on that clock; a remount inside the TTL (the band's RollSwap
// remounts its cells on every view switch) answers from the cache with no request at all.
//
// HONESTY (rule 10, the store's contract carried through): a null bucket is "not measured" —
// a sampling hole, tonight's cron outage — and consumers must render it as a GAP, never a
// zero (Sparkline breaks its line on null). The newest bucket is trimmed here because it is
// still FILLING: a partial sum charts as a collapse, the /trends page's own trim rule.

export interface TrendsWindowData {
  /** Bucket START instants, epoch ms UTC, oldest → newest — the still-filling newest trimmed. */
  buckets: number[];
  stepMs: number;
  /** null = not measured (a gap), 0 = measured none. */
  series: Record<string, (number | null)[]>;
}

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
    const j = (await r.json()) as {
      buckets: number[];
      stepMs: number;
      series: Record<string, (number | null)[]>;
    };
    // Trim the still-filling newest bucket — a partial sum reads as a crash in any counter
    // series. The bucket is partial iff "now" still falls inside it.
    const last = j.buckets.length - 1;
    const trim = last >= 0 && Date.now() < j.buckets[last] + j.stepMs ? last : j.buckets.length;
    const data: TrendsWindowData = {
      buckets: j.buckets.slice(0, trim),
      stepMs: j.stepMs,
      series: Object.fromEntries(Object.entries(j.series).map(([k, v]) => [k, v.slice(0, trim)])),
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

/** The newest `ms` of a window — how the 7d fetch serves a 24h chart: one request, the
 *  store's own hourly sums, no client-side re-bucketing (which would have to invent a rule
 *  for hours that are part-null). */
export function sliceWindow(data: TrendsWindowData, ms: number): TrendsWindowData {
  const cut = Date.now() - ms;
  let from = data.buckets.findIndex((t) => t + data.stepMs > cut);
  if (from < 0) from = data.buckets.length;
  if (from === 0) return data;
  return {
    buckets: data.buckets.slice(from),
    stepMs: data.stepMs,
    series: Object.fromEntries(Object.entries(data.series).map(([k, v]) => [k, v.slice(from)])),
  };
}

/** The measured window, or null while nothing has landed (first flight, or a failed fetch —
 *  the next tick or mount asks again; a consumer shows its own acquiring state meanwhile).
 *  A null `window` skips the fetch entirely — for consumers whose need is conditional (the
 *  idle cards' 30d reach), since a hook cannot be called conditionally. */
export default function useTrendsWindow(window: "24h" | "7d" | "30d" | "90d" | null): TrendsWindowData | null {
  const url = window ? netUrl(`/api/trends?window=${window}`) : null;
  const [data, setData] = useState<TrendsWindowData | null>(() => (url ? (cache.get(url)?.data ?? null) : null));
  useEffect(() => {
    if (!url) {
      setData(null);
      return;
    }
    touchPoll("api-trends"); // present in the pulse strip from first mount, as "acquiring"
    let dead = false;
    const pull = () => {
      const hit = fresh(url);
      if (hit) {
        setData(hit);
        return;
      }
      let p = inflight.get(url);
      if (!p) {
        p = load(url);
        inflight.set(url, p);
      }
      p.then((v) => {
        if (!dead && v) setData(v);
      });
    };
    pull();
    const t = setInterval(pull, POLL.trendsMs);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, [url]);
  return data;
}
