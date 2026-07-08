import { describe, it, expect } from "vitest";
import { bootPhase } from "./bootPhase";

describe("bootPhase", () => {
  it("is booting until BOTH the engine is ready and the scene is fully placed", () => {
    expect(bootPhase({ engineReady: false, engineFailed: false, sceneReady: false, hasData: false, live: false, timedOut: false })).toBe("booting");
    // engine up + first data landed, but nodes not yet placed → still booting (the fix: no reveal on
    // a partial signal, so the scene never pops in on top of an already-shown core)
    expect(bootPhase({ engineReady: true, engineFailed: false, sceneReady: false, hasData: true, live: true, timedOut: false })).toBe("booting");
    // scene placed but engine's first frame not yet painted → still booting
    expect(bootPhase({ engineReady: false, engineFailed: false, sceneReady: true, hasData: true, live: true, timedOut: false })).toBe("booting");
  });
  it("is live only once engine ready AND the scene is structurally complete", () => {
    expect(bootPhase({ engineReady: true, engineFailed: false, sceneReady: true, hasData: true, live: true, timedOut: false })).toBe("live");
    // live wins even if a subsequent poll is mid-drop — the scene already assembled
    expect(bootPhase({ engineReady: true, engineFailed: false, sceneReady: true, hasData: true, live: false, timedOut: true })).toBe("live");
  });
  it("falls back to a partial reveal on timeout: connected with data but the scene never fully assembled", () => {
    // we reached the network (hasData) and the engine painted, but a slow/missing feed left the
    // scene incomplete past the timeout — reveal what we have rather than hold "Connecting…" forever
    expect(bootPhase({ engineReady: true, engineFailed: false, sceneReady: false, hasData: true, live: false, timedOut: true })).toBe("live");
    // before the timeout, an incomplete scene stays booting (no premature partial reveal)
    expect(bootPhase({ engineReady: true, engineFailed: false, sceneReady: false, hasData: true, live: false, timedOut: false })).toBe("booting");
  });
  it("is no-signal only on timeout with no data and no live feed", () => {
    expect(bootPhase({ engineReady: true, engineFailed: false, sceneReady: false, hasData: false, live: false, timedOut: true })).toBe("no-signal");
    expect(bootPhase({ engineReady: false, engineFailed: false, sceneReady: false, hasData: false, live: false, timedOut: true })).toBe("no-signal");
  });
  it("is no-engine when the engine failed to start — even while data flows (avoids the booting wedge)", () => {
    expect(bootPhase({ engineReady: false, engineFailed: true, sceneReady: false, hasData: true, live: true, timedOut: false })).toBe("no-engine");
    expect(bootPhase({ engineReady: false, engineFailed: true, sceneReady: false, hasData: false, live: false, timedOut: false })).toBe("no-engine");
    // engineFailed takes precedence over a would-be no-signal
    expect(bootPhase({ engineReady: false, engineFailed: true, sceneReady: false, hasData: false, live: false, timedOut: true })).toBe("no-engine");
  });
});
