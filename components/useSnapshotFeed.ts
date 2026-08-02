"use client";

import { useEffect, useState } from "react";
import { getNetwork, initNetwork } from "@/src/data/network";
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
    // Boot-order-INDEPENDENT on purpose. `DataBridge` owns the boot, but this hook's consumer
    // (`LiveStrip`) lives inside `SectionShell`, which React renders — and whose effects therefore
    // run — BEFORE the bridge's. Reading `getNetwork()` alone returned null there and the effect
    // (deps `[max]`) never re-ran, so the strip silently sat on "Waiting for snapshots…" forever
    // while every other panel had live data (found in a browser pass, 2026-08-02; the old page
    // order happened to mount the bridge first, so the raw-layer redesign exposed it). `initNetwork`
    // is idempotent, so claiming the singleton here costs nothing and can't wedge on mount order.
    const net = getNetwork() ?? initNetwork();
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
