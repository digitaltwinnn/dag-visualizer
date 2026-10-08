"use client";

import { useStore } from "@/src/store/store";
import { VIEW_POLICIES, type ViewPolicy } from "@/src/engine/domain/viewPolicy";
import RecordsSurface from "@/components/datasection/RecordsSurface";
import TrendBucketsSurface from "@/components/datasection/TrendBucketsSurface";

// THE RAW LAYER'S DISPATCH — what RAW does is the VIEW's answer (`VIEW_POLICIES[mode].rawSurface`).
//
// RAW IS THE RECORDS in every view (user, 2026-10-07). A structural view shows its own records here
// ("records": the anchor log, the node roster); History shows the stored buckets of the measured
// history ("buckets", 2026-10-08 — for one day before that its RAW was a door onto the anchor log).
//
// Gate on the policy row, never on a mode (convention 7), and a MAP so a new answer is a compile
// error here instead of falling silently through. `components/rawSurfaceBoundary.test.ts` pins it.
const SURFACES: Record<ViewPolicy["rawSurface"], React.ComponentType> = {
  records: RecordsSurface,
  buckets: TrendBucketsSurface,
};

export default function DataSection() {
  const mode = useStore((s) => s.mode);
  const Surface = SURFACES[VIEW_POLICIES[mode].rawSurface];
  return <Surface />;
}
