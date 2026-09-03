"use client";

import { Activity } from "lucide-react";
import RailDock from "@/components/RailDock";
import { VitalsSheetBody } from "@/components/VitalsBand";
import { useBreakpoint } from "@/components/useBreakpoint";
import { useStore } from "@/src/store/store";
import { VIEW_POLICIES } from "@/src/engine/domain/viewPolicy";

// THE PHONE DOCK'S THIRD SECTION — Explore | Vitals | Details (user, 2026-09-03). The vitals'
// phone home used to be the filter strip's second row, which rode the top bar's grow-downward
// slot and so surfaced under WHICHEVER strip opened (the pulse strip included) — unrelated
// content in a dropdown. The dock is the honest parallel: vitals live on the BOTTOM edge on
// every tier (the desktop band, and now this sheet), and the strip keeps only what belongs to
// it (the phone homes of NetworkSwitch/ThemeToggle).
//
// It rides the same RailDock machinery as its two neighbours — one-sheet-at-a-time via
// `store.phoneDock`, drag-resize, flick-dismiss, the tap-outside collapse — passing only the
// middle-third geometry and its own mark. Phone-only by the same structural gate the dim uses
// (this component renders nothing elsewhere), and GATED ON `vitalsLane` like the band itself:
// a flat view's section would open onto nothing, and a dock section that opens onto nothing is
// the chevron-onto-nothing lie. The two half-docks read the same flag for their thirds, so the
// bar's geometry and this section's presence cannot disagree.
export default function VitalsDock() {
  const bp = useBreakpoint();
  const mode = useStore((s) => s.mode);
  const phoneDock = useStore((s) => s.phoneDock);
  const setPhoneDock = useStore((s) => s.setPhoneDock);
  const phoneSheetPx = useStore((s) => s.phoneSheetPx);
  const setPhoneSheetPx = useStore((s) => s.setPhoneSheetPx);
  if (bp !== "phone" || !VIEW_POLICIES[mode].vitalsLane) return null;
  return (
    <RailDock
      side="left"
      label="Vitals"
      trigger="bottom-bar-half"
      sheetSide="bottom"
      barGeom="w-1/3 left-1/3"
      barIcon={<Activity size={18} strokeWidth={1.75} aria-hidden="true" />}
      open={phoneDock === "vitals"}
      sheetPx={phoneSheetPx}
      onSheetPx={setPhoneSheetPx}
      onOpenChange={(next) => setPhoneDock(next ? "vitals" : null)}
    >
      <VitalsSheetBody />
    </RailDock>
  );
}
