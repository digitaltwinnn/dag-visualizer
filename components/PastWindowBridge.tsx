"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/src/store/store";
import { NET, netUrl } from "@/src/net/current";
import { POLL } from "@/src/engine/config";
import { buildPastWindow, getPastWindow, pastWanted, setPastWindow, type PastWindowAnswer } from "@/src/data/pastWindow";
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
  const pin = useStore((s) => s.snap?.data.ordinal ?? null);
  const setStatus = useStore((s) => s.setPastWindowStatus);
  const { snaps } = useSnapshotFeed(POLL.maxSnapshots, ledger);
  const liveOldest = snaps[0]?.ordinal ?? null;
  // The ordinal in flight, or the last one that failed: neither is asked for twice in a row.
  const asked = useRef<number | null>(null);

  useEffect(() => {
    const held = getPastWindow();
    const want = pastWanted({ ledger, following, pin, liveOldest, held });
    if (want.kind === "keep") return;
    if (want.kind === "clear") {
      asked.current = null;
      setPastWindow(null);
      if (useStore.getState().pastWindow) setStatus(null);
      return;
    }
    const ordinal = want.ordinal;
    if (asked.current === ordinal) return;
    asked.current = ordinal;
    setStatus({ ordinal, from: null, to: null, status: "loading" });
    // The answer applies only while the reader still wants THIS pin; a later pin has asked anew.
    const current = () => useStore.getState().pastWindow?.ordinal === ordinal;
    fetch(netUrl(`/api/ledger/window?ordinal=${ordinal}`))
      .then((r) => (r.ok ? (r.json() as Promise<PastWindowAnswer>) : null))
      .then((answer) => {
        if (!current()) return;
        const w = answer ? buildPastWindow(answer, NET) : null;
        if (!w) {
          // A failed read stands the view back on the live feed (an earlier pin's window included).
          setPastWindow(null);
          setStatus({ ordinal, from: null, to: null, status: "failed" });
          return;
        }
        setPastWindow(w);
        setStatus({ ordinal, from: w.from, to: w.to, status: "ready" });
      })
      .catch(() => {
        if (!current()) return;
        setPastWindow(null);
        setStatus({ ordinal, from: null, to: null, status: "failed" });
      });
  }, [ledger, following, pin, liveOldest, setStatus]);

  return null;
}
