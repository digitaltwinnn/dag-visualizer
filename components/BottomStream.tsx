"use client";

import { useEffect } from "react";
import { useStore } from "@/src/store/store";
import SnapshotRibbon from "@/components/SnapshotRibbon";
import LiveStrip from "@/components/LiveStrip";

// The bottom live lane. In the ledger view it's the full snapshot ribbon (the macro
// band of the timeline); in hyper/geo it's demoted to the slim LiveStrip so the dense
// instrument doesn't compete with each view's own panels. Also publishes how much
// vertical space the bottom reserves (--bottom-reserve) so the side rails grow back
// when only the slim strip is showing.
export default function BottomStream() {
  const full = useStore((s) => s.mode === "ledger");

  useEffect(() => {
    document.documentElement.style.setProperty("--bottom-reserve", full ? "170px" : "78px");
  }, [full]);

  return full ? <SnapshotRibbon /> : <LiveStrip />;
}
