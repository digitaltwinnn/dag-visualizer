// The dev TUNING PANEL — mounted behind `?tune` (the ?stats idiom: dev-only tooling, never for
// real users; the tweakpane import is dynamic so the library stays out of the normal bundle).
//
// This module is the MANIFEST — the one place a knob is declared. Production modules export plain
// constants and carry no panel metadata (src/engine/tune.ts is the contract), so a knob's range,
// its label and the folder it sits in all live here, and the shipped defaults are snapshotted by
// the panel itself at mount.
//
// The manifest is EMPTY, and so is the panel (user, 2026-11-05: "just an empty panel and framework,
// tests etc. as a placeholder for future tuning"). The framework — the generic walker, per-group
// export and reset, export ALL and opt-in persistence (tune.ts) — is kept and tested
// (tune.test.ts), and the panel-wide actions appear once the manifest holds a group. Re-adding a
// knob is one entry below — no edit in the owning module:
//
//   hyper: [{
//     title: "focus & dim",
//     values: FOCUS_ROWS.hyper,                       // the module's own constant, by reference
//     schema: { boost: { min: 0, max: 3, step: 0.05, label: "focus boost" } } satisfies TuneSchema<FocusRow>,
//     home: "domain/dimModel.ts · FOCUS_ROWS.hyper",  // where EXPORT says to paste the numbers
//   }],
//
// A value read per frame is live as soon as it is listed. A value baked at construction or event
// time (the ribbons' and tethers' vertex colours) adds `onChange: refreshTheme`, which re-runs every
// view's setColors — never a panel-only setter on the view.
//
// The tree is STATIC — shared groups first, then one folder per view, all built once. A folder for
// a view you are not currently in simply sits collapsed; that costs a click and saves the panel
// having to track `mode`, subscribe to anything, or rebuild itself. Engine owns mount/dispose.
import type * as THREE from "three";
import type { View3D } from "./domain/viewTransition";
import {
  captureDefaults, renderGroup, restoreTuned, savePersisted, setPersist, tuningPersisted, exportAll, dump,
  type TuneGroup,
} from "./tune";

/** What a manifest group can reach in the running Engine. Unused while the manifest is empty. */
export interface DevTuneTargets {
  camera: THREE.PerspectiveCamera;
  controls: { target: THREE.Vector3 };
  /** Re-runs the Engine's whole theme thread — the re-bake lever for values that are not read per
   *  frame (see the header). */
  refreshTheme: () => void;
}

export interface DevTuneHandle {
  dispose(): void;
}

// `_targets` is the manifest's reach into the Engine (DevTuneTargets) — unused while it is empty.
export async function mountDevTune(_targets: DevTuneTargets): Promise<DevTuneHandle> {
  const { Pane } = await import("tweakpane");

  // ---- the manifest ---------------------------------------------------------------------------
  // Shared groups shape EVERY view, so they sit above the per-view folders. A knob belongs to the
  // view whose look it changes, even when central code applies it (user, 2026-08-11) — emphasis and
  // lighting are per-view rows, so their groups go in the view folders below.
  const shared: TuneGroup[] = [];
  const perView: Record<View3D, TuneGroup[]> = { hyper: [], geo: [], ledger: [], trend: [] };

  const all = [...shared, ...Object.values(perView).flat()];

  // ---- build ----------------------------------------------------------------------------------
  // Defaults FIRST (the shipped look, before anything is written), then restore BEFORE binding, so
  // the sliders render at the restored values rather than snapping.
  captureDefaults(all);
  const restored = restoreTuned(all);
  const pane = new Pane({ title: "tune" });
  // Discoverability: the mount only happens on a full page LOAD with ?tune in the URL (the ?stats
  // idiom) — say so, so a missing panel is diagnosable from the console.
  console.info(`[tune] panel mounted — ?tune must be present at page load${restored ? " · restored a persisted session (RESET for the shipped look)" : ""}`);
  const el = pane.element.parentElement;
  if (el) {
    el.style.zIndex = "60"; // above the HUD rails
    el.style.top = "72px";  // clear the command bar
  }

  const onAnyChange = () => savePersisted(all);

  for (const g of shared) renderGroup(pane, g, onAnyChange);

  for (const [view, groups] of Object.entries(perView)) {
    if (groups.length === 0) continue; // no empty folders
    const vf = pane.addFolder({ title: view, expanded: false });
    for (const g of groups) renderGroup(vf, g, onAnyChange);
  }

  // ---- panel-wide actions ---------------------------------------------------------------------
  // Only once there is something to act on: an empty manifest is an empty panel.
  if (all.length > 0) {
    pane.addBlade({ view: "separator" });
    pane.addButton({ title: "export ALL" }).on("click", () => dump(exportAll(all)));
    const persist = { keep: tuningPersisted() };
    pane.addBinding(persist, "keep", { label: "keep across reloads" }).on("change", () => {
      setPersist(persist.keep, all);
    });
  }

  return { dispose: () => pane.dispose() };
}
