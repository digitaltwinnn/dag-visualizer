"use client";

import { useEffect } from "react";
import VitalsBand from "@/components/VitalsBand";
import { useStore } from "@/src/store/store";
import { useBreakpoint } from "@/components/useBreakpoint";
import { VIEW_POLICIES } from "@/src/engine/domain/viewPolicy";

// The bottom lane — the VITALS BAND (2026-08-30, replacing the snapshots-only LiveStrip;
// docs/superpowers/plans/2026-08-30-vitals-bottom-band.md): each 3D view's own vitals as a slim
// row of read-only instrument cards, the declicked tick bar-chart riding along as one of the
// ledger's cells.
//
// ONE PUBLISHER. This component both mounts the band and writes `--bottom-reserve` (the vertical
// space the rails and the raw layer keep clear of it), from the SAME conditions — so the lane's
// presence and the space reserved for it cannot drift.
// The reserve is measured from the TOP OF THE FOOTER, not from the viewport bottom (2026-08-18):
// the band sits 10px above the site footer, and every consumer of this token subtracts
// `--footer-h` separately, so folding the footer in here would count it twice.
//
// Three gates beside the policy flag, each deliberate:
//  - SCENE-POSE ONLY (user, 2026-08-15, inherited from the strip): the raw layer pages history
//    arbitrarily deep, so a live instrument doesn't describe the surface it would float over —
//    and the raw layer (the phone pane especially) needs the space back.
//  - RAILS HIDDEN hides the band too (user, 2026-08-30): presentation mode shows just the 3D.
//  - PHONE never mounts it (the dock + sheet own that edge; the filter strip's second row
//    renders the same cards as a horizontal scroll instead — VitalsStripRow).
const RESERVE = 92; // 10px gap above the footer + the band's ~66px height + 16px clearance above it

export default function BottomStream() {
  const mode = useStore((s) => s.mode);
  const section = useStore((s) => s.section);
  const railsHidden = useStore((s) => s.railsHidden);
  const bp = useBreakpoint();
  const lane = VIEW_POLICIES[mode].vitalsLane && section === "scene" && !railsHidden && bp !== "phone";
  useEffect(() => {
    document.documentElement.style.setProperty("--bottom-reserve", lane ? `${RESERVE}px` : "0px");
    return () => document.documentElement.style.setProperty("--bottom-reserve", "0px");
  }, [lane]);
  return lane ? <VitalsBand /> : null;
}
