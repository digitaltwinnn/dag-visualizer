// The cold-start phase: BOOTING (connecting, cyan) → LIVE (handoff done) → NO-SIGNAL (never
// connected in time) → NO-ENGINE (the 3D engine couldn't start — e.g. WebGL unavailable).
// `sceneReady` = the hypergraph scene is structurally COMPLETE (metagraph nodes AND DAG core nodes
// both placed) — the overlay holds until then so the scene reveals fully-formed, with no node
// pop-in. `hasData` = a first real read landed (first snapshot or the metagraph list); it only
// backs the timeout fallback below. LIVE latches at the call-site (useBootPhase) so a later feed
// drop doesn't re-show the overlay.
export type BootPhase = "booting" | "live" | "no-signal" | "no-engine";

export function bootPhase(o: {
  engineReady: boolean;
  engineFailed: boolean;
  sceneReady: boolean;
  hasData: boolean;
  live: boolean;
  timedOut: boolean;
}): BootPhase {
  // Engine start failed: report it even while data flows — engineReady will never arrive, so
  // without this branch the phase would sit on "booting" forever (a blank-canvas wedge).
  if (o.engineFailed) return "no-engine";
  if (o.engineReady && o.sceneReady) return "live"; // scene fully placed → clean fully-formed reveal
  // Fallback: we connected (engine up + some data) but the scene never fully assembled within the
  // timeout (a slow/missing feed). Reveal the partial scene rather than hold "Connecting…" forever.
  if (o.engineReady && o.timedOut && o.hasData) return "live";
  if (o.timedOut && !o.live && !o.hasData) return "no-signal"; // never reached the network
  return "booting"; // still connecting / assembling
}
