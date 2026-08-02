"use client";

import { useStore } from "@/src/store/store";
import { focusSlotId } from "@/components/railCards";

// Which ladder rung currently holds the FOCUS, for the EXPLORE rail (the facts rail derives the
// same answer from its own manifest — `focusSlotId` is the one definition both call). An explorer
// asks this to decide how loudly each committed row speaks: the focus rung wears the full
// selection mark, every coarser committed row wears the ancestor strength (`selectedRow`), so a
// drill-down list reads as a path with a head instead of a stack of equal selections.
//
// Returns the rail SLOT id ("context" / "country" / "cohort" / "composition" / "node" / "layer"),
// so callers name the rung the same way the rail does.
export function useLadderFocus(): string | null {
  const mode = useStore((s) => s.mode);
  const filter = useStore((s) => s.filter);
  const country = useStore((s) => s.country);
  const cohort = useStore((s) => s.cohort);
  const composition = useStore((s) => s.composition);
  const inspect = useStore((s) => s.inspect);
  const snap = useStore((s) => s.snap);
  const layer = useStore((s) => s.layer);
  return focusSlotId({ mode, filter, country, cohort, composition, inspect, snap, layer });
}
