"use client";

import { useEffect } from "react";
import LiveStrip from "@/components/LiveStrip";
import { useStore } from "@/src/store/store";
import { VIEW_POLICIES } from "@/src/engine/domain/viewPolicy";

// The bottom live lane — the LiveStrip's tick bar-chart, one bar per global tick, height = anchors.
//
// SNAPSHOTS-ONLY (user, 2026-08-12). A bar-chart over ticks is a TIME instrument, and the three 3D
// views are complementary projections of one network: hyper = who/what, geo = where, ledger = when.
// Only the *when* view has an axis to plot on, so only it mounts the lane; hyper and geo used to
// carry a node-count readout in the same footprint to keep the lane from reading as blank, which
// answered the wrong question — a per-network node tally is structure, and structure is already the
// subject of the view above it. The lane is simply absent there, and the space comes back.
//
// ONE PUBLISHER. This component both mounts the strip and writes `--bottom-reserve` (the vertical
// space the rails and the raw layer keep clear of it), from the SAME policy flag — so the lane's
// presence and the space reserved for it cannot drift. That is what the previous arrangement got
// wrong in the other direction: the reserve was published per view from here while the strip was
// always mounted, which left two values for one token.
const RESERVE = 130; // 16px bottom inset + the strip's 98px height + 16px clearance above it

export default function BottomStream() {
  const mode = useStore((s) => s.mode);
  const lane = VIEW_POLICIES[mode].timeLane;
  useEffect(() => {
    document.documentElement.style.setProperty("--bottom-reserve", lane ? `${RESERVE}px` : "0px");
    return () => document.documentElement.style.setProperty("--bottom-reserve", "0px");
  }, [lane]);
  return lane ? <LiveStrip /> : null;
}
