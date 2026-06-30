"use client";

import { useEffect } from "react";
import { useStore } from "@/src/store/store";
import LiveStrip from "@/components/LiveStrip";

// The bottom live lane: the slim LiveStrip bar-chart (one bar per global tick, height = anchors)
// in every snapshot-bearing view — hyper, geo AND ledger. (The old full SnapshotRibbon is gone;
// the ledger's own 3D layer stack is the timeline now, with this strip as the running chain.)
// Also publishes how much vertical space the bottom reserves (--bottom-reserve).
export default function BottomStream() {
  const mode = useStore((s) => s.mode);
  // The scaffolded placeholder views have no snapshot lane — hide it and give the space back.
  const hidden = mode !== "hyper" && mode !== "geo" && mode !== "ledger";

  useEffect(() => {
    document.documentElement.style.setProperty("--bottom-reserve", hidden ? "0px" : "130px");
  }, [hidden]);

  if (hidden) return null;
  return <LiveStrip />;
}
