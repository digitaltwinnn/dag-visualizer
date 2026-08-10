// The ONE stage-light lifecycle owner (spec A#3): every view's FocusSpot registers here; the
// Engine calls gate() once per frame with the per-view furniture alphas, and any view at
// alpha ≈ 0 has its spot blacked out CENTRALLY — a view can no longer "forget its spotOff"
// (the lingering-spotlight bug class). Views keep driving their LIT spot (aim + update);
// only the off-lifecycle is centralized.
import type { View3D } from "../../domain/viewTransition";
import type { FocusSpot } from "./FocusSpot";

export class StageLights {
  private spots = new Map<View3D, FocusSpot>();

  register(view: View3D, spot: FocusSpot): void {
    this.spots.set(view, spot);
  }

  // The registered spot, or undefined for a view that constructs none (the ledger). This class is
  // already the ONE place that knows which spot belongs to which view, so the `?tune` panel asks
  // here rather than growing an accessor on each view.
  get(view: View3D): FocusSpot | undefined {
    return this.spots.get(view);
  }

  // Per frame: black out every registered spot whose view is dark. Idempotent (blackout of
  // an already-dark spot is a no-op write), so no per-spot state tracking is needed.
  gate(alphas: Record<View3D, number>): void {
    for (const [view, spot] of this.spots) {
      if (alphas[view] <= 0.001) spot.blackout();
    }
  }
}
