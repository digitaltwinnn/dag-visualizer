"use client";

import { useEffect, useState } from "react";
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
//  - PHONE never mounts it (the dock + sheet own that edge; the Vitals dock section hosts the
//    same cards there — VitalsSheetBody).
//  - SHORT VIEWPORTS yield it too (2026-09-03, the landscape-phone look): a phone held sideways
//    lands in the tablet tier at ~390px of height, where the bar + caption + band + footer left
//    the scene 184px — under half the viewport. Below 500px of height the band stands down and
//    the scene takes the 92px back; the vitals stay one rotation away. 500 clears every
//    landscape phone and touches no tablet (the shortest, an iPad mini landscape, is 744).
const RESERVE = 92; // 10px gap above the footer + the band's ~66px height + 16px clearance above it

export default function BottomStream() {
  const mode = useStore((s) => s.mode);
  const section = useStore((s) => s.section);
  const railsHidden = useStore((s) => s.railsHidden);
  const bp = useBreakpoint();
  // matchMedia, not a resize listener — flips exactly at the boundary, like useBreakpoint's own.
  const [short, setShort] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-height: 500px)");
    const apply = () => setShort(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  const lane = VIEW_POLICIES[mode].vitalsLane && section === "scene" && !railsHidden && bp !== "phone" && !short;
  useEffect(() => {
    document.documentElement.style.setProperty("--bottom-reserve", lane ? `${RESERVE}px` : "0px");
    return () => document.documentElement.style.setProperty("--bottom-reserve", "0px");
  }, [lane]);
  return lane ? <VitalsBand /> : null;
}
