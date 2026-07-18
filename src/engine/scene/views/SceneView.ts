// The shared shape of a 3D-view furniture module (spec Part B #4): everything the Engine drives
// uniformly across views. Today that is the transition build/teardown alpha. HyperView and
// LedgerView implement it; GeoView is exempt (its geo-surface furniture rides Globe.setMorph's
// geoFades choke point, not its own alpha).
//
// Implementations own a `FadeSet` (scene/objects/FadeSet.ts) — the single owner of the view's
// furniture alpha: static materials (opacity = base × alpha, nothing else) register with it once
// at construction; per-frame DYNAMIC writes (eased glow, tile brightness, state-dependent floors)
// keep their own expressions but read the alpha from the SAME FadeSet instance. `setViewAlpha`
// forwards to `FadeSet.apply`. This is composition, not interface surface — the interface stays
// minimal (YAGNI); don't grow `SceneView` to expose the registry itself.
export interface SceneView {
  // 0..1 furniture opacity multiplier, fed per frame by the Engine during a view transition
  // (1 at rest in the lit view, 0 while the view is dark/parked).
  setViewAlpha(a: number): void;
}
