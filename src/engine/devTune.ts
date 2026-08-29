// The dev TUNING PANEL — mounted behind `?tune` (the ?stats idiom: dev-only tooling, never for
// real users; the tweakpane import is dynamic so the library stays out of the normal bundle).
//
// This module is ONLY the MANIFEST — which groups exist and where their values live. Every knob's
// range is colocated with the constant it bounds (a `*_TUNE_SCHEMA` next to its `*_TUNE_DEFAULTS`),
// and `tune.ts`'s generic walker renders any group, so adding a knob is one line in the owning
// module and NO edit here. See src/engine/tune.ts for the contract.
//
// The tree is STATIC — shared groups first, then one folder per view, all built once. A folder for
// a view you are not currently in simply sits collapsed; that costs a click and saves the panel
// having to track `mode`, subscribe to anything, or rebuild itself. Engine owns mount/dispose.
import type * as THREE from "three";
import type { LedgerView } from "./scene/views/LedgerView";
import type { HyperView } from "./scene/views/HyperView";
import { TETHER_TUNE_DEFAULTS, TETHER_TUNE_SCHEMA } from "./scene/views/HyperView";
import { RIBBON_TUNE_DEFAULTS, RIBBON_TUNE_SCHEMA } from "./scene/objects/Ribbons";
import { BAR_TUNE_DEFAULTS, BAR_TUNE_SCHEMA } from "./scene/objects/ByteBar";
import { GLOBAL_PLANE_TUNE_DEFAULTS, META_PLANE_TUNE_DEFAULTS, PLANE_TUNE_SCHEMA, GLASS_TUNE, GLASS_TUNE_DEFAULTS, GLASS_TUNE_SCHEMA } from "./scene/objects/SnapshotPlane";
import { TILE_TUNE_DEFAULTS, TILE_TUNE_SCHEMA } from "./scene/views/LedgerView";
import { FOCUS_TUNE, FOCUS_TUNE_DEFAULTS, FOCUS_ROW_SCHEMA, FOCUS_SHARED, FOCUS_SHARED_DEFAULTS, FOCUS_SHARED_SCHEMA } from "./domain/dimModel";
import { STAGE_LIGHTS, STAGE_LIGHT_DEFAULTS, STAGE_LIGHT_SCHEMA, type StagedView } from "./domain/stageLight";
import {
  SCENE_RIG, SCENE_RIG_DEFAULTS, RIG_ROW_SCHEMA,
  RIG_PAPER, RIG_PAPER_DEFAULTS, RIG_PAPER_SCHEMA,
} from "./domain/sceneRig";
import { LIGHT_TUNE, LIGHT_TUNE_DEFAULTS, LIGHT_TUNE_SCHEMA } from "./sceneColors";
import { setSceneLaneLight } from "../palette/identity";
import type { View3D } from "./domain/viewTransition";
import { CAM_ZOOM, RAILS_HIDDEN_DOLLY } from "./domain/cameraRig";
import {
  renderGroup, restoreTuned, savePersisted, setPersist, tuningPersisted, exportAll, dump,
  type TuneGroup,
} from "./tune";

export interface DevTuneTargets {
  ledger: LedgerView;
  hyper: HyperView;
  camera: THREE.PerspectiveCamera;
  controls: { target: THREE.Vector3 };
  /** Re-runs the Engine's whole theme thread — the light-look group lands its dials through it. */
  refreshTheme: () => void;
}

export interface DevTuneHandle {
  dispose(): void;
}

export async function mountDevTune(targets: DevTuneTargets): Promise<DevTuneHandle> {
  const { Pane } = await import("tweakpane");
  const { ledger, hyper, camera, controls, refreshTheme } = targets;

  // ---- the manifest ---------------------------------------------------------------------------
  // Shared groups: these shape EVERY view, so they sit above the per-view folders. Emphasis is
  // NOT one of them — dim/focus numbers are per-view values that central code applies (user,
  // 2026-08-11), so they live in the view folders below and only the focus TIER ranking, which
  // every view shares, stays up here.
  const shared: TuneGroup[] = [
    {
      title: "focus tiers",
      values: FOCUS_SHARED,
      defaults: FOCUS_SHARED_DEFAULTS,
      schema: FOCUS_SHARED_SCHEMA,
      home: "domain/dimModel.ts · FOCUS_SHARED_DEFAULTS",
    },
    {
      // Every dial reaches the LIGHT ground only (sceneColors.ts, the LightTune doc): in dark
      // the lane setter rewrites an unused memo, the ground override keeps its dark face, and
      // the Engine ignores bloomMul/bloomFloor while _bloomMul is 1.
      title: "light look",
      values: LIGHT_TUNE,
      defaults: LIGHT_TUNE_DEFAULTS,
      schema: LIGHT_TUNE_SCHEMA,
      home: "engine/sceneColors.ts · LIGHT_TUNE_DEFAULTS",
      onChange: () => {
        // The ground is a CSS token: override it INLINE as a light-dark() pair so the dark
        // face survives the override verbatim (a flat value would repaint dark too).
        document.documentElement.style.setProperty(
          "--scene-ground",
          `light-dark(oklch(${LIGHT_TUNE.groundL} 0.016 265), oklch(0.09 0.02 265))`,
        );
        setSceneLaneLight(LIGHT_TUNE.laneL, LIGHT_TUNE.laneC);
        refreshTheme();
      },
    },
    {
      // The rig's PAPER answer — four multipliers over whichever view's row won the frame. Shared
      // rather than per-view because it is a statement about the GROUND, not about a view: the page
      // is its own bounce card everywhere. Inert under dark, where every multiplier is 1 by
      // definition (the rows themselves are the dark look).
      title: "rig · paper",
      values: RIG_PAPER,
      defaults: RIG_PAPER_DEFAULTS,
      schema: RIG_PAPER_SCHEMA,
      home: "domain/sceneRig.ts · RIG_PAPER_DEFAULTS",
    },
  ];

  // Per-view groups. Only the views that STAGE a light get a spotlight folder — `StagedView` is
  // what says which, so a slider that moves nothing can't be built.
  const spotGroup = (view: StagedView): TuneGroup => ({
    title: `${view} · spotlight`,
    values: STAGE_LIGHTS[view],
    defaults: STAGE_LIGHT_DEFAULTS[view],
    schema: STAGE_LIGHT_SCHEMA,
    // No onChange: StageLight re-reads its row every frame, so an edit is live by construction.
    home: `domain/stageLight.ts · STAGE_LIGHT_DEFAULTS.${view}`,
  });

  // Every 3D view has one, same shape as the spotlight above: one row, one shared schema.
  const focusGroup = (view: View3D): TuneGroup => ({
    title: `${view} · focus & dim`,
    values: FOCUS_TUNE[view],
    defaults: FOCUS_TUNE_DEFAULTS[view],
    schema: FOCUS_ROW_SCHEMA,
    // No onChange: the dim formulas read the row per frame.
    home: `domain/dimModel.ts · FOCUS_TUNE_DEFAULTS.${view}`,
  });

  // The view's KEY/FILL/RIM. Every 3D view has one — unlike the spotlight, which only the views
  // that stage a claim get: a view is always lit, it just may not be spotlit. No onChange (SceneRig
  // re-blends the rows every frame).
  const rigGroup = (view: View3D): TuneGroup => ({
    title: `${view} · rig`,
    values: SCENE_RIG[view],
    defaults: SCENE_RIG_DEFAULTS[view],
    schema: RIG_ROW_SCHEMA,
    home: `domain/sceneRig.ts · SCENE_RIG_DEFAULTS.${view}`,
  });

  const perView: Record<string, TuneGroup[]> = {
    hyper: [
      focusGroup("hyper"),
      rigGroup("hyper"),
      spotGroup("hyper"),
      {
        title: "tethers",
        values: hyper.tetherTune,
        defaults: TETHER_TUNE_DEFAULTS,
        schema: TETHER_TUNE_SCHEMA,
        // The tip fades are baked into the shared vertex-colour attribute — re-bake on a change.
        // (`restOp` alone is read per frame, but one re-bake per edit costs nothing.)
        onChange: () => hyper.setTetherTune({}),
        home: "scene/views/HyperView.ts · TETHER_TUNE_DEFAULTS",
      },
    ],
    geo: [focusGroup("geo"), rigGroup("geo"), spotGroup("geo")],
    // Almost every dim number is read per frame, so the group needs no onChange — EXCEPT the
    // ledger's `dim`, which the ribbons bake into their vertex colours. Re-push the sheet there.
    ledger: [
      { ...focusGroup("ledger"), onChange: () => ledger.ribbons.setTune({}) },
      rigGroup("ledger"),
      {
        title: "ribbons",
        values: ledger.ribbons.tune,
        defaults: RIBBON_TUNE_DEFAULTS,
        schema: RIBBON_TUNE_SCHEMA,
        // Ribbon dim/brightness are baked into vertex colours — a change must rewrite the sheet.
        onChange: () => ledger.ribbons.setTune({}),
        home: "scene/objects/Ribbons.ts · RIBBON_TUNE_DEFAULTS",
      },
      {
        title: "global snapshots (bar)",
        values: ledger.bar.tune,
        defaults: BAR_TUNE_DEFAULTS,
        schema: BAR_TUNE_SCHEMA,
        home: "scene/objects/ByteBar.ts · BAR_TUNE_DEFAULTS",
      },
      {
        title: "metagraph snapshots (tiles)",
        values: ledger.tiles,
        defaults: TILE_TUNE_DEFAULTS,
        schema: TILE_TUNE_SCHEMA,
        home: "scene/views/LedgerView.ts · TILE_TUNE_DEFAULTS",
      },
      // The two plane channels — the SAME SnapshotPlane blueprint, tuned separately (user,
      // 2026-08-07): glass transparency + drop-off + the plane's own tray fill (read per frame).
      {
        title: "global plane",
        values: ledger.globalTune,
        defaults: GLOBAL_PLANE_TUNE_DEFAULTS,
        schema: PLANE_TUNE_SCHEMA,
        home: "scene/objects/SnapshotPlane.ts · GLOBAL_PLANE_TUNE_DEFAULTS",
      },
      {
        title: "metagraph planes",
        values: ledger.metaTune,
        defaults: META_PLANE_TUNE_DEFAULTS,
        schema: PLANE_TUNE_SCHEMA,
        home: "scene/objects/SnapshotPlane.ts · META_PLANE_TUNE_DEFAULTS",
      },
      // ONE set for the whole chamber, unlike the two channels above: this tunes what GLASS IS, not
      // how much presence a storey has. Read per frame, so no onChange. Inert under the dark ground,
      // where the panes take the flat additive whisper instead.
      {
        title: "day glass (light mode)",
        values: GLASS_TUNE,
        defaults: GLASS_TUNE_DEFAULTS,
        schema: GLASS_TUNE_SCHEMA,
        home: "scene/objects/SnapshotPlane.ts · GLASS_TUNE_DEFAULTS",
      },
      // The day glass's MOVABLE highlight. The chamber claims the light on a light ground only, so
      // this folder is inert under dark exactly as the one above it — it aims a reflection, not a
      // beam (nothing in the chamber is lit by three.js).
      spotGroup("ledger"),
    ],
  };

  const all = [...shared, ...Object.values(perView).flat()];

  // ---- build ----------------------------------------------------------------------------------
  // Restore BEFORE binding, so the sliders render at the restored values rather than snapping.
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
