"use client";

import { useEffect } from "react";
import { getNetwork, metagraphById } from "@/src/data/network";
import { useStore } from "@/src/store/store";
import { followLatest } from "@/src/data/follow";

// Drives the "live" snapshot card: while following, re-point the inspector at the
// latest relevant snapshot on each new global snapshot and as the anchor index fills
// in (ports the onGlobal/anchor → _followLatest wiring from main.js). Renders nothing.
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

  const following = useStore((s) => s.following);
  const filter = useStore((s) => s.filter);
  const setFollowing = useStore((s) => s.setFollowing);

  // Selecting a metagraph filter (chip OR hub click) goes real-time for it; All/L0/L1
  // pins (no auto-follow). Runs on filter change only.
  useEffect(() => {
    setFollowing(metagraphById(filter) != null);
  }, [filter, setFollowing]);

  // When following turns on (toggle / filter change), jump to the latest relevant snapshot.
  useEffect(() => {
    if (following) followLatest();
  }, [following, filter]);

  return null;
}
