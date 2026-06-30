"use client";

import { useEffect, useState } from "react";
import { getNetwork } from "@/src/data/network";
import type { GlobalEvent, GlobalSnapshot } from "@/src/data/types";

// Shared Global L0 snapshot subscription — the live tail both the full ribbon
// (ledger) and the slim heartbeat strip (hyper/geo) read from, so they never drift.
// Snapshots arrive ~every 15s, so React state is fine here (Lane B). The anchor-tick
// state bumps when the anchor index fills in, forcing a re-render so derived fees/cues
// re-read getAnchor() (the value itself is internal — consumers just observe the render).
export function useSnapshotFeed(max: number) {
  const [snaps, setSnaps] = useState<GlobalSnapshot[]>([]);
  const [, setAnchorTick] = useState(0);

  useEffect(() => {
    const net = getNetwork();
    if (!net) return;

    // Seed from the buffer (the "reset" event may have fired before we mounted).
    setSnaps(net.globalSnapshots.slice(-max));

    const onGlobal = (evt: GlobalEvent) => {
      if (evt.reset) setSnaps((evt.snapshots ?? []).slice(-max));
      else if (evt.snapshot) {
        const snap = evt.snapshot;
        setSnaps((prev) => [...prev, snap].slice(-max));
      }
    };
    let raf = 0;
    const onAnchor = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setAnchorTick((t) => t + 1));
    };

    net.on("global", onGlobal);
    net.on("anchor", onAnchor);
    return () => {
      net.off("global", onGlobal);
      net.off("anchor", onAnchor);
      cancelAnimationFrame(raf);
    };
  }, [max]);

  return { snaps };
}
