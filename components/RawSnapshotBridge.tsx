"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/src/store/store";
import type { SnapshotExact, ChannelSnapDeep } from "@/src/data/types";
import { metaSnapDeepKey } from "@/src/data/types";

// Keeps the EXACT per-snapshot totals (fee + listed/unlisted breakdown) in the store for the
// snapshots currently in focus — the LIVE tick and any SELECTED one — by pulling them from
// /api/snapshot/[ordinal]. It's view-agnostic on purpose: the data lands in the store so the
// snapshot card (or anything else, in any view) can prefer exact figures over the polled floor.
// One fetch per ordinal, app-wide (the route is cached per ordinal too).
//
// Also backfills the previous few ticks' exact reads (paced at boot to avoid bursts) and
// fetches the deep channel decode for any selected metagraph snapshot.

const inflight = new Set<number>();
const deepInflight = new Set<string>();

// The byte bar needs a MEASURED width for every tick in the trail, and only the live tick is read
// as it happens. A cold page load therefore starts with a trail of unmeasured seams, so the bridge
// backfills the previous few ordinals ONCE, in the background, paced so it never bursts the route
// (each ordinal is immutable and cached for a day, so this is cheap after the first visitor).
export const BACKFILL_N = 8;
export const BACKFILL_GAP_MS = 450;

export function backfillOrdinals(
  latest: number | null,
  have: Readonly<Record<number, unknown>>,
  n: number = BACKFILL_N,
): number[] {
  if (latest == null) return [];
  const out: number[] = [];
  for (let i = 1; i <= n; i++) {
    const ord = latest - i;
    if (ord < 1) break;
    if (!have[ord]) out.push(ord);
  }
  return out;
}

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

export default function RawSnapshotBridge() {
  const liveOrd = useStore((s) => s.latestSnapshot?.ordinal ?? null);
  const selOrd = useStore((s) => s.snap?.data.ordinal ?? null);
  const deepSel = useStore((s) => s.metaSnap);
  const following = useStore((s) => s.following);
  const backfilled = useRef(false);

  useEffect(() => ensure(liveOrd), [liveOrd]);
  useEffect(() => ensure(selOrd), [selOrd]);

  // One-shot, on the first live tick.
  useEffect(() => {
    if (backfilled.current || liveOrd == null) return;
    backfilled.current = true;
    const queue = backfillOrdinals(liveOrd, useStore.getState().snapshotExact);
    let i = 0;
    const timer = setInterval(() => {
      if (i >= queue.length) {
        clearInterval(timer);
        return;
      }
      ensure(queue[i++]);
    }, BACKFILL_GAP_MS);
    return () => clearInterval(timer);
  }, [liveOrd]);

  // The deeper read: only ever for the ONE selected metagraph snapshot, never a poll.
  useEffect(() => {
    if (!deepSel) return;
    // The decode rule is CLICK-scoped (user, 2026-08-07): while following, the shown snapshot
    // was never clicked — fetching its ~2.5 MB decode per tick would turn the explicit-gesture
    // route into a poll. `following` is a DEPENDENCY, not just a guard: pinning via the LIVE
    // control (no metaSnap change) must fire the decode for the snapshot already on screen.
    if (following) return;
    const key = metaSnapDeepKey(deepSel.globalOrdinal, deepSel.metaId, deepSel.ordinal);
    const st = useStore.getState();
    if (st.metaSnapDeep[key] || deepInflight.has(key)) return;
    deepInflight.add(key);
    fetch(`/api/snapshot/${deepSel.globalOrdinal}/channel/${deepSel.metaId}?snap=${deepSel.ordinal}`)
      .then((r) => (r.ok ? (r.json() as Promise<ChannelSnapDeep>) : null))
      .then((d) => {
        // Store under the REQUESTED key: when the route fell back (an undecodable row asks
        // with 0), the decode's own identity would file it where the card never reads — the
        // decode itself stays untouched (2026-08-08: explicit key, no field override).
        if (d && typeof d.ordinal === "number") st.setMetaSnapDeep(d, key);
      })
      .catch(() => {})
      .finally(() => deepInflight.delete(key));
  }, [deepSel, following]);

  return null;
}
