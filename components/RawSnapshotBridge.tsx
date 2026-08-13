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
      if (data && typeof data.totalFee === "number") st.setSnapshotExact(data);
      // On unavailable (transient blip / outside the served window) record the MISS instead of
      // storing nothing: the acquiring surfaces (fee node-stars, "resolving", "reading…") key
      // their give-up on it, so a failed read on a pinned tick terminates honestly instead of
      // twinkling forever with nothing in flight (rule 10). A later trigger (reselecting, the
      // next live tick) still retries exactly as before, and a landing read clears the miss.
      else st.setExactMiss(ordinal);
    })
    .catch(() => st.setExactMiss(ordinal))
    .finally(() => inflight.delete(ordinal));
}

export default function RawSnapshotBridge() {
  const liveOrd = useStore((s) => s.latestSnapshot?.ordinal ?? null);
  const selOrd = useStore((s) => s.snap?.data.ordinal ?? null);
  const deepSel = useStore((s) => s.metaSnap);
  const following = useStore((s) => s.following);
  const section = useStore((s) => s.section);
  const deepWanted = useStore((s) => s.deepWanted);
  const backfilled = useRef(false);

  useEffect(() => ensure(liveOrd), [liveOrd]);
  useEffect(() => ensure(selOrd), [selOrd]);

  // One-shot, on the first live tick. The timer lives in a ref and is NOT cleaned per dep
  // change (2026-08-08, review fix): the queue takes ~3.6s+ and the next tick lands in ~4s,
  // so a dep-scoped cleanup routinely truncated the backfill and left trail rows unmeasured.
  const backfillTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (backfilled.current || liveOrd == null) return;
    backfilled.current = true;
    const queue = backfillOrdinals(liveOrd, useStore.getState().snapshotExact);
    let i = 0;
    backfillTimer.current = setInterval(() => {
      if (i >= queue.length) {
        if (backfillTimer.current) clearInterval(backfillTimer.current);
        backfillTimer.current = null;
        return;
      }
      ensure(queue[i++]);
    }, BACKFILL_GAP_MS);
  }, [liveOrd]);
  useEffect(
    () => () => {
      if (backfillTimer.current) clearInterval(backfillTimer.current);
    },
    [],
  );

  // The deeper read: only ever for the ONE selected metagraph snapshot, never a poll.
  useEffect(() => {
    if (!deepSel) return;
    // The decode rule is CLICK-scoped (user, 2026-08-07): while following, the shown snapshot
    // was never clicked — fetching its ~2.5 MB decode per tick would turn the explicit-gesture
    // route into a poll. `following` is a DEPENDENCY, not just a guard: pinning via the LIVE
    // control (no metaSnap change) must fire the decode for the snapshot already on screen.
    if (following) return;
    const key = metaSnapDeepKey(deepSel.globalOrdinal, deepSel.metaId, deepSel.ordinal);
    // …and BEING PINNED IS NOT THE SAME AS ASKING (user, 2026-08-10). Selecting a snapshot used to
    // be the whole trigger, which made the read follow a BROWSE gesture: every pager step and
    // every explorer leaf fetched. Measured live, a single tick anchors up to 20 DOR snapshots, so
    // a swipe through that pager cost 20 × ~2.5 MB against Constellation's public L0 LB at ~1.8s
    // cold each. The gate is therefore the SURFACE, not the mode:
    //
    //   • the CARD states the SHAPE, so it never reads on its own — its `Read this snapshot`
    //     button writes `deepWanted`, and that is the whole request. One press, one read.
    //   • the RAW LAYER *is* the payload surface, so being there IS the request — nothing else
    //     is down there, and arriving took a deliberate depth change.
    //
    // Client cost is small either way (the decoded row is ~0.6–4.4 KB); what is being rationed is
    // the server's fetch of the whole global and the latency the user waits through.
    if (section !== "data" && deepWanted !== key) return;
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
  }, [deepSel, following, section, deepWanted]);

  return null;
}
