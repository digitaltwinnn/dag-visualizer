// The dev TUNING PANEL — mounted behind `?tune` (the ?stats idiom: dev-only tooling, never for
// real users; the tweakpane import is dynamic so the library stays out of the normal bundle).
// It binds LIVE controls onto the scene's tunable objects so the user can find the right values
// by eye and read them back off the panel — the chosen numbers then get baked into the
// *_TUNE_DEFAULTS constants they came from.
//
// Engine owns the mount/dispose; this module only builds the panel.
import type { LedgerView } from "./scene/views/LedgerView";

export interface DevTuneTargets {
  ledger: LedgerView;
}

export interface DevTuneHandle {
  dispose(): void;
}

export async function mountDevTune(targets: DevTuneTargets): Promise<DevTuneHandle> {
  const { Pane } = await import("tweakpane");
  const pane = new Pane({ title: "ledger tune" });
  // Discoverability: the mount only happens on a full page LOAD with ?tune in the URL (the
  // ?stats idiom) — say so, so a missing panel is diagnosable from the console.
  console.info("[tune] panel mounted — ?tune must be present at page load");
  const el = pane.element.parentElement;
  if (el) {
    el.style.zIndex = "60"; // above the HUD rails
    el.style.top = "72px";  // clear the command bar
  }

  const rf = pane.addFolder({ title: "ribbons" });
  const rt = targets.ledger.ribbons.tune;
  rf.addBinding(rt, "restOp", { min: 0, max: 1, step: 0.01, label: "opacity" });
  rf.addBinding(rt, "dimOp", { min: 0, max: 0.5, step: 0.01, label: "dim opacity" });
  rf.addBinding(rt, "brightness", { min: 0.1, max: 2, step: 0.05 });
  rf.addBinding(rt, "curve", { min: 0, max: 1, step: 0.05 });
  // The ribbon dim/brightness are baked into vertex colours — a change must rewrite the sheet.
  rf.on("change", () => targets.ledger.ribbons.setTune({}));

  // The global snapshots — the byte bar's band/seam opacities (read per frame, no rebuild).
  const bf = pane.addFolder({ title: "global snapshots (bar)" });
  const bt = targets.ledger.bar.tune;
  bf.addBinding(bt, "restOp", { min: 0, max: 1, step: 0.01, label: "opacity" });
  bf.addBinding(bt, "hotOp", { min: 0, max: 1, step: 0.01, label: "hot opacity" });
  bf.addBinding(bt, "dimOp", { min: 0, max: 0.5, step: 0.01, label: "dim opacity" });
  bf.addBinding(bt, "seamOp", { min: 0, max: 1, step: 0.01, label: "seam opacity" });

  // The metagraph snapshots — the lane tiles' brightness multipliers (read per frame).
  const tf = pane.addFolder({ title: "metagraph snapshots (tiles)" });
  const tt = targets.ledger.tiles;
  tf.addBinding(tt, "hot", { min: 0, max: 2.5, step: 0.05, label: "hot" });
  tf.addBinding(tt, "rest", { min: 0, max: 2, step: 0.05, label: "rest" });
  tf.addBinding(tt, "dim", { min: 0, max: 1, step: 0.01, label: "off-filter" });

  return { dispose: () => pane.dispose() };
}
