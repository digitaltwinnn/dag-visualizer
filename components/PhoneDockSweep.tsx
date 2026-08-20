"use client";

import type { CSSProperties } from "react";
import { useStore } from "@/src/store/store";
import { filterAccent } from "@/src/data/network";
import { PulseEdge } from "@/components/EdgePulse";
import { usePulseWindow } from "@/components/RailDock";

// Phone-only (<700px): the view/filter-SWITCH pulse for the persistent bottom dock, as ONE
// continuous sweep across the FULL WIDTH of the strip — left screen edge → right screen edge,
// seamless across the two halves' seam. The dock itself is two separate `RailDock` instances
// (ExploreRail's "Explore" + Inspector's "Details" bar-halves) styled to tile into one strip; a
// per-half carrier (aab8053) read as two sweeps meeting at the centre rather than one. Neither
// half OWNS the whole row, so this mounts once, at the page level (`app/page.tsx`), as a fixed
// sibling — the cleanest single owner for a signal that spans both.
//
// Reuses the exact shared recipe: `usePulseWindow` (RailDock's debounce/mount-window wrapper
// around `useEdgePulse`) on the SAME subject key RailThread/RailDock pulse on (`${mode}|${filter}`),
// and the same `.edge-pulse` CSS via `PulseEdge`. Geometry is RailDock's phone carrier trick — a
// vertical track rotated onto the horizontal edge — just widened from a HALF track (`50vw`, one
// per half) to the FULL track (`100vw`) and mounted once instead of twice, so the bright segment
// travels uninterrupted across the whole dock instead of two segments converging on the seam.
//
// POSITIONING (bug-fixed): the carrier must sit at the dock's TOP edge, and its rotation origin's
// Y must NOT depend on the `100vw` track length. Anchoring the carrier itself with `bottom` +
// `origin-top-left` is the trap — the top-left origin then lands at `100vh − bottom − 100vw`, i.e.
// ~100vw ABOVE the dock (mid-screen). So we mirror RailDock's per-half carriers exactly: a
// container fixed to the dock's own box (`bottom-0 h-[var(--phone-dock-h)]`, bottom-anchored like
// the dock so there's no vh/dvh drift), with the carrier `absolute top-[3px]` inside it — a
// height-independent origin pinned to the dock's top edge. `pointer-events-none` throughout —
// never intercepts taps on the halves beneath it.
export default function PhoneDockSweep() {
  const mode = useStore((s) => s.mode);
  const filter = useStore((s) => s.filter);
  const switchP = usePulseWindow(`${mode}|${filter}`);
  const accent = filterAccent(filter);
  if (!switchP.live) return null;
  return (
    <span
      className="hidden max-[700px]:block fixed z-[43] bottom-0 left-0 w-full h-[var(--phone-dock-h)] pointer-events-none"
      style={{ ["--spine" as string]: accent } as CSSProperties}
      aria-hidden
    >
      <span className="absolute top-[3px] left-0 w-[3px] h-[100vw] origin-top-left -rotate-90 [--pulse-len:45%]">
        <PulseEdge pulseKey={switchP.pulse} />
      </span>
    </span>
  );
}
