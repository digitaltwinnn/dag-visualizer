"use client";

import { useEffect } from "react";
import { getNetwork } from "@/src/data/network";
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

  // When the user toggles Live on (or switches the filter while following), jump to
  // the latest relevant snapshot immediately.
  const following = useStore((s) => s.following);
  const filter = useStore((s) => s.filter);
  useEffect(() => {
    if (following) followLatest();
  }, [following, filter]);

  return null;
}
