"use client";

import { useEffect, useState } from "react";

// A 1s re-render clock for the ticking relative-age asides (user, 2026-08-08 — the heartbeat
// must be felt on closed snapshot cards: the seconds count up between heartbeats and reset as
// a new snapshot lands). Interval-driven state, cleaned up on unmount. Shared by the global
// snapshot's aside (SnapshotAside) and the metagraph snapshot's (MetaSnapPane) so the two
// counters can't drift in behavior.
export function useNowTick(stepMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), stepMs);
    return () => clearInterval(id);
  }, [stepMs]);
  return now;
}
