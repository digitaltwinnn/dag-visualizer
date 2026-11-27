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
  const [state, setState] = useState<SubmittersState>(() => ({ data: url ? (cache.get(url)?.data ?? null) : null, error: false }));
  useEffect(() => {
    if (!url) {
      setState({ data: null, error: false });
      return;
    }
    touchPoll("api-submitters");
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
