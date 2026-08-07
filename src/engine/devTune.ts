// The dev TUNING PANEL — mounted behind `?tune` (the ?stats idiom: dev-only tooling, never for
// real users; the tweakpane import is dynamic so the library stays out of the normal bundle).
// It binds LIVE controls onto the scene's tunable objects so the user can find the right values
// by eye and read them back off the panel — the chosen numbers then get baked into the
// *_TUNE_DEFAULTS constants they came from.
//
// Engine owns the mount/dispose; this module only builds the panel.
import type { Ribbons } from "./scene/objects/Ribbons";

export interface DevTuneTargets {
  ribbons: Ribbons;
}

export interface DevTuneHandle {
  dispose(): void;
}

export async function mountDevTune(targets: DevTuneTargets): Promise<DevTuneHandle> {
  const { Pane } = await import("tweakpane");
  const pane = new Pane({ title: "ledger tune" });
  const el = pane.element.parentElement;
  if (el) {
    el.style.zIndex = "60"; // above the HUD rails
    el.style.top = "72px";  // clear the command bar
  }

  const rf = pane.addFolder({ title: "ribbons" });
  const t = targets.ribbons.tune;
  rf.addBinding(t, "restOp", { min: 0, max: 1, step: 0.01, label: "opacity" });
  rf.addBinding(t, "dimOp", { min: 0, max: 0.5, step: 0.01, label: "dim opacity" });
  rf.addBinding(t, "brightness", { min: 0.1, max: 2, step: 0.05 });
  rf.addBinding(t, "curve", { min: 0, max: 1, step: 0.05 });
  rf.on("change", () => targets.ribbons.setTune({}));

  return { dispose: () => pane.dispose() };
}
