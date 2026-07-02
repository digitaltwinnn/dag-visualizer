// The cold-start phase: BOOTING (connecting, cyan) → LIVE (handoff done) → NO-SIGNAL (never
// connected in time) → NO-ENGINE (the 3D engine couldn't start — e.g. WebGL unavailable).
// `hasData` = a first real read landed (first snapshot or the metagraph list). LIVE latches at the
// call-site (useBootPhase) so a later feed drop doesn't re-show the overlay.
export type BootPhase = "booting" | "live" | "no-signal" | "no-engine";

export function bootPhase(o: {
  engineReady: boolean;
  engineFailed: boolean;
  hasData: boolean;
  live: boolean;
  timedOut: boolean;
}): BootPhase {
  // Engine start failed: report it even while data flows — engineReady will never arrive, so
  // without this branch the phase would sit on "booting" forever (a blank-canvas wedge).
  if (o.engineFailed) return "no-engine";
  if (o.engineReady && o.hasData) return "live"; // scene up + first data → hand off
  if (o.timedOut && !o.live && !o.hasData) return "no-signal"; // never reached the network
  return "booting"; // still connecting / acquiring
}
