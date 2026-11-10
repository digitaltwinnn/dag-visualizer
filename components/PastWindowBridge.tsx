"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/src/store/store";
import { POLL } from "@/src/engine/config";
import { buildPastWindow, getPastWindow, pastRetryDelay, pastWanted, setPastWindow, type PastWindowAnswer } from "@/src/data/pastWindow";
import { useSnapshotFeed } from "@/components/useSnapshotFeed";
import { VIEW_POLICIES } from "@/src/engine/domain/viewPolicy";

// THE ONE WRITER OF THE SNAPSHOTS VIEW'S PAST WINDOW (user, 2026-11-03: pinning a snapshot older
// than the live feed should "go back in time"; `docs/superpowers/specs/2026-11-03-snapshots-past-window-design.md`).
// It asks the one rule (`pastWanted`) whenever the view, the pin or the live feed's oldest snapshot
// moves, fetches `/api/ledger/window` around the pin, and holds the answer in the module beside
// `NetworkData` (`src/data/pastWindow.ts`) while the store carries only its status — as
// `RawSnapshotBridge` does for exact reads. A failed read leaves the view on the live feed and says
// so through the status; a pin the held window holds keeps it (the pager stepping inside).
export default function PastWindowBridge() {
  // The views whose selections live inside a global snapshot (convention 7: the policy row, not a mode).
  const ledger = useStore((s) => VIEW_POLICIES[s.mode].tickScoped);
  const following = useStore((s) => s.following);
  const register = useStore((s) => s.ledgerRegister);
  const pin = useStore((s) => s.snap?.data.ordinal ?? null);
  const setStatus = useStore((s) => s.setPastWindowStatus);
  const { snaps } = useSnapshotFeed(POLL.maxSnapshots, ledger);
  const liveOldest = snaps[0]?.ordinal ?? null;
  // The ordinal in flight, or the last one that failed: neither is asked for twice in a row.
  const asked = useRef<number | null>(null);
  // A scheduled retry: dropped when the reader moves on (another pin, live, another view). Kept in
  // a ref, not the effect's cleanup, since the effect re-runs on every live tick.
  const retry = useRef<number | null>(null);
  const dropRetry = () => {
    if (retry.current != null) window.clearTimeout(retry.current);
    retry.current = null;
  };
  useEffect(() => dropRetry, []);

  useEffect(() => {
    const held = getPastWindow();
    const want = pastWanted({ ledger, following, pin, liveOldest, held, register });
    if (want.kind === "keep") return;
    if (want.kind === "clear") {
      asked.current = null;
      dropRetry();
      setPastWindow(null);
      if (useStore.getState().pastWindow) setStatus(null);
      return;
    }
    const ordinal = want.ordinal;
    if (asked.current === ordinal) return;
    asked.current = ordinal;
    dropRetry();
    setStatus({ ordinal, from: null, to: null, status: "loading" });
    // The answer applies only while the reader still wants THIS pin; a later pin has asked anew.
    const current = () => useStore.getState().pastWindow?.ordinal === ordinal;
    // A FAILED READ IS TRIED AGAIN (user, 2026-11-03: "add a retry"), on `pastRetryDelay`'s
    // schedule, the explorer still saying it is reading; only when the budget is spent does the
    // view stand back on the live feed (an earlier pin's window included) and say so.
    const failed = (attempt: number) => {
      if (!current()) return;
      const delay = pastRetryDelay(attempt);
      if (delay != null) {
        retry.current = window.setTimeout(() => {
          retry.current = null;
          read(attempt + 1);
        }, delay);
        return;
      }
      setPastWindow(null);
      setStatus({ ordinal, from: null, to: null, status: "failed" });
    };
    const read = (attempt: number) => {
      if (!current()) return;
      fetch(`/api/ledger/window?ordinal=${ordinal}`)
        .then((r) => (r.ok ? (r.json() as Promise<PastWindowAnswer>) : null))
        .then((answer) => {
          if (!current()) return;
          const w = answer ? buildPastWindow(answer) : null;
          if (!w) return failed(attempt);
          setPastWindow(w);
          setStatus({ ordinal, from: w.from, to: w.to, status: "ready" });
        })
        .catch(() => failed(attempt));
    };
    read(0);
  }, [ledger, following, pin, liveOldest, register, setStatus]);

  return null;
}
