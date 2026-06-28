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
  const mode = useStore((s) => s.mode);
  const full = mode === "ledger";
  // The scaffolded placeholder views have no snapshot lane — hide it and give the space back.
  const hidden = mode !== "hyper" && mode !== "geo" && mode !== "ledger";

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--bottom-reserve",
      hidden ? "0px" : full ? "170px" : "130px",
    );
  }, [full, hidden]);

  if (hidden) return null;
  return full ? <SnapshotRibbon /> : <LiveStrip />;
}
