"use client";

import { useEffect } from "react";
import LiveStrip from "@/components/LiveStrip";

// The bottom live lane: the slim LiveStrip bar-chart (one bar per global tick, height = anchors).
// It's the network's global live heartbeat (the Global L0 snapshot stream) — view-independent, so
// it renders in EVERY view, including the scaffolded placeholder views (Network/Transactions/
// Staking), not just the 3D snapshot-bearing ones. NetworkData polls regardless of view, so the
// data is already there. Also publishes how much vertical space the bottom reserves
// (--bottom-reserve), which is constant now that the strip is always present.
export default function BottomStream() {
  useEffect(() => {
    document.documentElement.style.setProperty("--bottom-reserve", "130px");
  }, []);

  return <LiveStrip />;
}
