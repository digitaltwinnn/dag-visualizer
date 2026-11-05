// The dev TUNING PANEL — mounted behind `?tune` (the ?stats idiom: dev-only tooling, never for
// real users; the tweakpane import is dynamic so the library stays out of the normal bundle).
//
// This module is the MANIFEST — the one place a knob is declared. Production modules export plain
// constants and carry no panel metadata (src/engine/tune.ts is the contract), so a knob's range,
// its label and the folder it sits in all live here, and the shipped defaults are snapshotted by
// the panel itself at mount.
//
// The manifest is EMPTY today (user, 2026-11-05: "cleanup the ?tune attributes but keep the
// functionality for later"). What stays is the panel: the camera readout, export, reset and
// persistence. Re-adding a knob is one entry below — no edit in the owning module:
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
import { CAM_ZOOM, RAILS_HIDDEN_DOLLY, REST_ASPECT } from "./domain/cameraRig";
import {
  captureDefaults, renderGroup, restoreTuned, savePersisted, setPersist, tuningPersisted, exportAll, dump,
  type TuneGroup,
} from "./tune";

export interface DevTuneTargets {
  camera: THREE.PerspectiveCamera;
  controls: { target: THREE.Vector3 };
  /** Re-runs the Engine's whole theme thread — the re-bake lever for values that are not read per
   *  frame (see the header). Unused while the manifest is empty. */
  refreshTheme: () => void;
}

export interface DevTuneHandle {
  dispose(): void;
}

export async function mountDevTune(targets: DevTuneTargets): Promise<DevTuneHandle> {
  const { Pane } = await import("tweakpane");
  const { camera, controls } = targets;

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

  // ---- the live camera folder -----------------------------------------------------------------
  // A READOUT, not a set of sliders. Poses are only ~8 constants and each needs its own selection
  // state to even see, so dragging numbers is the slow way round; ORBITING to a pose you like and
  // reading it off is the fast one. OrbitControls owns the camera once a tween lands, so what the
  // mirror shows is exactly what you composed by hand.
  const cam = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 };
  const camFolder = pane.addFolder({ title: "camera (live)", expanded: true });
  for (const k of ["x", "y", "z", "tx", "ty", "tz"] as const) {
    camFolder.addBinding(cam, k, { readonly: true, format: (v: number) => v.toFixed(2) });
  }
  camFolder.addButton({ title: "capture ← live" }).on("click", () => {
    dump(
      `// camera — paste into a CameraFraming / FOCI entry in domain/cameraRig.ts\n` +
      `pos.set(${cam.x.toFixed(2)}, ${cam.y.toFixed(2)}, ${cam.z.toFixed(2)});\n` +
      `target.set(${cam.tx.toFixed(2)}, ${cam.ty.toFixed(2)}, ${cam.tz.toFixed(2)});\n` +
      `// ⚠️ RAW live numbers. The Engine composes levers onto a resolved pose before tweening, so\n` +
      `//    for a pose that takes them these are already lever'd and must be divided back out:\n` +
      `//      · dollyBack  ×${CAM_ZOOM} — every FOCI preset and framing EXCEPT nodeFraming/cohortFraming\n` +
      `//      · railsLean  ×${RAILS_HIDDEN_DOLLY} at MOST, and only while the rails are hidden. Exempt on the same\n` +
      `//        poses dollyBack is, and RAMPED by how close the pose orbits vs its view's resting one —\n` +
      `//        so at a deep rung its factor is near 1 and there is little to divide back out.\n` +
      `//      · aspectFit  ×√(${REST_ASPECT.toFixed(2)}/aspect) below the rest aspect (portrait) — identity on a\n` +
      `//        desktop viewport, so a desktop tuning session has nothing to divide back out.\n` +
      `//    hubFraming/hyperNodeFraming compose from the SUBJECT's own radial basis, so raw numbers\n` +
      `//    there describe one subject only — read them as a delta, not as constants.`,
    );
  });

  // The mirror runs on its own rAF: dev-only, self-contained, and it keeps the engine's render
  // loop free of panel work (the phase contract has no room for a HUD read).
  let raf = 0;
  const tick = () => {
    cam.x = camera.position.x; cam.y = camera.position.y; cam.z = camera.position.z;
    cam.tx = controls.target.x; cam.ty = controls.target.y; cam.tz = controls.target.z;
    camFolder.refresh();
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  // ---- panel-wide actions ---------------------------------------------------------------------
  pane.addBlade({ view: "separator" });
  pane.addButton({ title: "export ALL" }).on("click", () => dump(exportAll(all)));
  const persist = { keep: tuningPersisted() };
  pane.addBinding(persist, "keep", { label: "keep across reloads" }).on("change", () => {
    setPersist(persist.keep, all);
  });

  return {
    dispose: () => {
      cancelAnimationFrame(raf);
      pane.dispose();
    },
  };
}
