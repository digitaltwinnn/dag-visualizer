"use client";

import { useStore } from "@/src/store/store";
import { focusSlotId } from "@/components/railCards";
import { useTickHasFilter } from "@/components/useTickHasFilter";

// Which ladder rung currently holds the FOCUS, for the EXPLORE rail (the facts rail derives the
// same answer from its own manifest — `focusSlotId` is the one definition both call). An explorer
// asks this to decide how loudly each committed row speaks: the focus rung wears the full
// selection mark, every coarser committed row wears the ancestor strength (`selectedRow`), so a
// drill-down list reads as a path with a head instead of a stack of equal selections.
//
// Returns the rail SLOT id ("context" / "country" / "cohort" / "composition" / "node"),
// so callers name the rung the same way the rail does.
export function useLadderFocus(): string | null {
  const mode = useStore((s) => s.mode);
  const filter = useStore((s) => s.filter);
  const tickNet = useStore((s) => s.tickNet);
  const country = useStore((s) => s.country);
  const cohort = useStore((s) => s.cohort);
  const composition = useStore((s) => s.composition);
  const inspect = useStore((s) => s.inspect);
  const snap = useStore((s) => s.snap);
  const metaSnap = useStore((s) => s.metaSnap);
  const selStack = useStore((s) => s.selStack);
  // History's own slot: the committed time cursor (`instant`). It is in the lane, so the focus
  // derivation has to see it or the cursor card can never be the box.
  const trendCursorMs = useStore((s) => s.trendCursorMs);
  const trendRange = useStore((s) => s.trendRange);
  const trendFocus = useStore((s) => s.trendFocus);
  const tickHasFilter = useTickHasFilter();
  return focusSlotId({ mode, filter, tickNet, tickHasFilter, country, cohort, composition, inspect, snap, metaSnap, trendCursorMs, trendRange, trendFocus, selStack });
}
