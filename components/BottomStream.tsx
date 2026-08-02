"use client";

import LiveStrip from "@/components/LiveStrip";

// The bottom live lane: the slim LiveStrip bar-chart (one bar per global tick, height = anchors).
// It's the network's global live heartbeat (the Global L0 snapshot stream) — view-independent, so
// it renders in EVERY view, including the scaffolded placeholder views (Network/Transactions/
// Staking), not just the 3D snapshot-bearing ones. NetworkData polls regardless of view, so the
// data is already there. The vertical space this lane reserves is `--bottom-reserve` in
// globals.css — ONE value now that the strip is always present in the same footprint (it used to
// be published from here per view, which left two values for one token to drift apart).
export default function BottomStream() {
  return <LiveStrip />;
}
