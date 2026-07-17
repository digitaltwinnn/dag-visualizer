// The shared shape of a 3D-view furniture module (spec Part B #4): everything the Engine drives
// uniformly across views. Today that is the transition build/teardown alpha; Plan 2 adds the
// shared fade-registry + dispose hooks here. HyperView and LedgerView implement it; GeoView is
// exempt (its geo-surface furniture rides Globe.setMorph's geoFades choke point, not its own alpha).
export interface SceneView {
  // 0..1 furniture opacity multiplier, fed per frame by the Engine during a view transition
  // (1 at rest in the lit view, 0 while the view is dark/parked).
  setViewAlpha(a: number): void;
}
