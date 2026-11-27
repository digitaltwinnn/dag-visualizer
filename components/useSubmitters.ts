"use client";
import { useFeedRead } from "@/components/useFeedRead";
import { reportPoll, touchPoll } from "@/src/data/api";
import { POLL } from "@/src/engine/config";
import type { SubmittersWindow } from "@/app/api/submitters/assemble";
import { useEffect, useState } from "react";

// Who submits a network's data (/api/submitters), client side — useTrendsWindow's discipline:
// one module cache keyed by URL (POLL.trendsMs freshness, the read route's own s-maxage), a shared
// in-flight promise, and failure as a signal (`error`) with stale data kept rather than blanked.

export type SubmittersQuery = { net: string; fromMs: number; toMs: number } | { net: string; window: "24h" };
export type SubmittersState = { data: SubmittersWindow | null; error: boolean };

// State is KEYED BY URL: the URL carries the network, so a stale answer from another url would show
// one network's organisations under another. Pure steps, so the rule is testable without a render.
export type Keyed = SubmittersState & { url: string | null };

/** What a load outcome does to the state for `url`: success replaces; failure keeps only `url`'s own
 *  last data (this url's prior state or its cache entry), never another url's. */
export function settle(prev: Keyed, url: string, v: SubmittersWindow | null, cached: SubmittersWindow | null): Keyed {
  if (v) return { url, data: v, error: false };
  return { url, data: (prev.url === url ? prev.data : null) ?? cached, error: true };
}

/** What the hook returns for `url`: its own state, else its cache entry, never another url's data. */
export function view(state: Keyed, url: string | null, cached: SubmittersWindow | null): SubmittersState {
  if (!url) return { data: null, error: false };
  return state.url === url ? { data: state.data, error: state.error } : { data: cached, error: false };
}

interface Slot { at: number; data: SubmittersWindow }
const cache = new Map<string, Slot>();
const inflight = new Map<string, Promise<SubmittersWindow | null>>();

export function submittersUrl(q: SubmittersQuery): string {
  const net = encodeURIComponent(q.net);
  return "window" in q ? `/api/submitters?net=${net}&window=${q.window}` : `/api/submitters?net=${net}&from=${q.fromMs}&to=${q.toMs}`;
}

async function load(url: string): Promise<SubmittersWindow | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) {
      reportPoll("api-submitters", false);
      return null;
    }
    const data = (await r.json()) as SubmittersWindow;
    cache.set(url, { at: Date.now(), data });
    reportPoll("api-submitters", true);
    return data;
  } catch {
    reportPoll("api-submitters", false);
    return null;
  } finally {
    inflight.delete(url);
  }
}

function fresh(url: string): SubmittersWindow | null {
  const s = cache.get(url);
  return s && Date.now() - s.at < POLL.trendsMs ? s.data : null;
}

/** A null query skips the fetch (a hook cannot be conditional). */
export default function useSubmitters(q: SubmittersQuery | null, who: string): SubmittersState {
  const url = q ? submittersUrl(q) : null;
  useFeedRead(["api-submitters"], who, url != null);
  const [state, setState] = useState<Keyed>(() => ({ url, data: url ? (cache.get(url)?.data ?? null) : null, error: false }));
  useEffect(() => {
    if (!url) {
      setState({ url: null, data: null, error: false });
      return;
    }
    touchPoll("api-submitters");
    let dead = false;
    const pull = () => {
      const hit = fresh(url);
      if (hit) {
        setState({ url, data: hit, error: false });
        return;
      }
      let p = inflight.get(url);
      if (!p) {
        p = load(url);
        inflight.set(url, p);
      }
      p.then((v) => {
        if (dead) return;
        setState((prev) => settle(prev, url, v, cache.get(url)?.data ?? null));
      });
    };
    pull();
    const t = setInterval(pull, POLL.trendsMs);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, [url]);
  return view(state, url, url ? (cache.get(url)?.data ?? null) : null);
}
