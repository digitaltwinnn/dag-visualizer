"use client";

import { useEffect } from "react";
import { useStore } from "@/src/store/store";
import type { SnapshotExact } from "@/src/data/types";

// Keeps the EXACT per-snapshot totals (fee + listed/unlisted breakdown) in the store for the
// snapshots currently in focus — the LIVE tick and any SELECTED one — by pulling them from
// /api/snapshot/[ordinal]. It's view-agnostic on purpose: the data lands in the store so the
// snapshot card (or anything else, in any view) can prefer exact figures over the polled floor.
// One fetch per ordinal, app-wide (the route is cached per ordinal too).

const inflight = new Set<number>();

function ensure(ordinal: number | null | undefined) {
  if (ordinal == null) return;
  const st = useStore.getState();
  if (st.snapshotExact[ordinal] || inflight.has(ordinal)) return; // already have it / fetching
  inflight.add(ordinal);
  fetch(`/api/snapshot/${ordinal}`)
    .then((r) => (r.ok ? (r.json() as Promise<SnapshotExact>) : null))
    .then((data) => {
      // On unavailable (pruned/not-yet-there) store nothing — leaves the tick on the polled floor
      // and lets a later trigger (e.g. selecting it) retry.
      if (data && typeof data.totalFee === "number") st.setSnapshotExact(data);
    })
    .catch(() => {})
    .finally(() => inflight.delete(ordinal));
}

export default function SnapshotExactBridge() {
  const liveOrd = useStore((s) => s.latestSnapshot?.ordinal ?? null);
  const selOrd = useStore((s) => s.snap?.data.ordinal ?? null);
  useEffect(() => ensure(liveOrd), [liveOrd]);
  useEffect(() => ensure(selOrd), [selOrd]);
  return null;
}
