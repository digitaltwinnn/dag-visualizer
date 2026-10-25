"use client";

import { useSyncExternalStore } from "react";

// A 1s re-render clock for the ticking relative-age asides (user, 2026-08-08 — the heartbeat
// must be felt on closed snapshot cards: the seconds count up between heartbeats and reset as
// a new snapshot lands). Shared by the global snapshot's aside, the metagraph snapshot's and the
// raw log's ages so the counters can't drift in behavior.
//
// ONE INTERVAL PER STEP, however many readers (review, 2026-10-25): the raw log mounts an age per
// row and per plate, and an interval each meant dozens of unsynchronised timers and a commit for
// every one; neighbouring ages also ticked at different moments. Readers subscribe to one clock
// per step, which runs only while something listens.
//
// ⚠️ THE SUBSCRIBE FUNCTION IS STABLE PER STEP. useSyncExternalStore re-subscribes whenever it gets
// a new function; an inline one re-subscribed every render, which stopped and restarted the clock
// with a fresh `now`, which re-rendered — a loop React aborted ("Maximum update depth") the first
// time this shipped. And a restart keeps the old `now` unless the clock was idle a full step.
type Clock = {
  now: number;
  subs: Set<() => void>;
  id: ReturnType<typeof setInterval> | null;
  subscribe: (cb: () => void) => () => void;
  get: () => number;
};
const clocks = new Map<number, Clock>();

function clockOf(stepMs: number): Clock {
  const have = clocks.get(stepMs);
  if (have) return have;
  const c: Clock = {
    now: Date.now(),
    subs: new Set(),
    id: null,
    subscribe: (cb) => {
      c.subs.add(cb);
      if (c.id == null) {
        const t = Date.now();
        if (t - c.now >= stepMs) c.now = t;
        c.id = setInterval(() => {
          c.now = Date.now();
          for (const f of c.subs) f();
        }, stepMs);
      }
      return () => {
        c.subs.delete(cb);
        if (!c.subs.size && c.id != null) {
          clearInterval(c.id);
          c.id = null;
        }
      };
    },
    get: () => c.now,
  };
  clocks.set(stepMs, c);
  return c;
}

export function useNowTick(stepMs: number): number {
  const c = clockOf(stepMs);
  return useSyncExternalStore(c.subscribe, c.get, c.get);
}
