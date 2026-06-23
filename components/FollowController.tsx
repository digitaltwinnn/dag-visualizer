"use client";

import { useEffect } from "react";
import { getNetwork } from "@/src/data/network";
import { useStore } from "@/src/store/store";
import { followLatest } from "@/src/data/follow";

// Drives the "live" snapshot card, which is the **ledger view's** signature card. While
// following, re-point the inspector at the latest relevant snapshot on each new global
// snapshot and as the anchor index fills in. Hyper/geo never auto-follow a snapshot —
// their signature cards are the metagraph live-activity and the node card. Renders nothing.
export default function FollowController() {
  useEffect(() => {
    const net = getNetwork();
    if (!net) return;
    const tick = () => {
      if (useStore.getState().following) followLatest();
    };
    let raf = 0;
    const onAnchor = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    net.on("global", tick);
    net.on("anchor", onAnchor);
    return () => {
      net.off("global", tick);
      net.off("anchor", onAnchor);
      cancelAnimationFrame(raf);
    };
  }, []);

  const mode = useStore((s) => s.mode);
  const following = useStore((s) => s.following);
  const filter = useStore((s) => s.filter);
  const setFollowing = useStore((s) => s.setFollowing);

  // Snapshot-following is on only in the ledger view (its live card). Entering ledger
  // goes real-time; leaving it stops (a clicked chip can still pin within ledger).
  useEffect(() => {
    setFollowing(mode === "ledger");
  }, [mode, setFollowing]);

  // When following (enter ledger) or the filter changes while in it, jump to the
  // latest relevant snapshot for the selection.
  useEffect(() => {
    if (following) followLatest();
  }, [following, filter]);

  return null;
}
