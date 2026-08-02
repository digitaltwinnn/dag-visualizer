"use client";

import { useEffect } from "react";
import { getNetwork } from "@/src/data/network";
import { useStore } from "@/src/store/store";
import { followLatest } from "@/src/data/follow";

// Drives the "live" (auto-advancing) snapshot card. While following, re-point the inspector at
// the latest relevant snapshot on each new global snapshot and as the anchor index fills in. The
// snapshot card is LEDGER-SCOPED (spec 2026-08-01): entering ledger with nothing selected follows
// live; leaving ledger clears the pin (Engine.setMode) and stops following (below). Renders nothing.
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

  // Live-following (the snapshot card auto-advancing to the tip) is a *ledger* behaviour.
  // The snapshot card is LEDGER-SCOPED (spec 2026-08-01): it clears when you leave the ledger
  // (Engine.setMode), so this only stops following to let the controller's effect bail gracefully.
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
