"use client";

import { useEffect } from "react";
import { getNetwork } from "@/src/data/network";
import { useStore } from "@/src/store/store";
import { followLatest } from "@/src/data/follow";

// Drives the "live" (auto-advancing) snapshot card. While following, re-point the inspector at
// the latest relevant snapshot on each new global snapshot and as the anchor index fills in. The
// ledger view follows live by default; once a snapshot is *selected* it's pinned and carries
// across views (a static selection, like the node card) until deselected. Renders nothing.
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

  // Live-following (the snapshot card auto-advancing to the tip) is a *ledger* behaviour, but a
  // selected snapshot now CARRIES ACROSS VIEWS like the node selection. So: the ledger goes live
  // only when you arrive with nothing selected (a snapshot/node carried in stays put); leaving the
  // ledger pins the current tip (following → false) so the snapshot carries as a static selection.
  useEffect(() => {
    if (mode === "ledger") {
      if (!useStore.getState().snap) setFollowing(true);
    } else {
      setFollowing(false);
    }
  }, [mode, setFollowing]);

  // When following (enter ledger) or the filter changes while in it, jump to the
  // latest relevant snapshot for the selection.
  useEffect(() => {
    if (following) followLatest();
  }, [following, filter]);

  return null;
}
