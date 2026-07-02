// The cold-start phase: BOOTING (connecting, cyan) → LIVE (handoff done) → NO-SIGNAL (never
// connected in time). `hasData` = a first real read landed (first snapshot or the metagraph list).
// LIVE latches at the call-site (useBootPhase) so a later feed drop doesn't re-show the overlay.
export type BootPhase = "booting" | "live" | "no-signal";

export function bootPhase(o: {
  engineReady: boolean;
  hasData: boolean;
  live: boolean;
  timedOut: boolean;
}): BootPhase {
  if (o.engineReady && o.hasData) return "live"; // scene up + first data → hand off
  if (o.timedOut && !o.live && !o.hasData) return "no-signal"; // never reached the network
  return "booting"; // still connecting / acquiring
}
