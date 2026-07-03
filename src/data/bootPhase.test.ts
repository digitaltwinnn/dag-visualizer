import { describe, it, expect } from "vitest";
import { bootPhase } from "./bootPhase";

describe("bootPhase", () => {
  it("is booting until BOTH the engine is ready and data has landed", () => {
    expect(bootPhase({ engineReady: false, engineFailed: false, hasData: false, live: false, timedOut: false })).toBe("booting");
    expect(bootPhase({ engineReady: true, engineFailed: false, hasData: false, live: true, timedOut: false })).toBe("booting");
    expect(bootPhase({ engineReady: false, engineFailed: false, hasData: true, live: true, timedOut: false })).toBe("booting");
  });
  it("is live once engine ready AND data present", () => {
    expect(bootPhase({ engineReady: true, engineFailed: false, hasData: true, live: true, timedOut: false })).toBe("live");
    // live wins even if a subsequent poll is mid-drop — data already arrived
    expect(bootPhase({ engineReady: true, engineFailed: false, hasData: true, live: false, timedOut: true })).toBe("live");
  });
  it("is no-signal only on timeout with no data and no live feed", () => {
    expect(bootPhase({ engineReady: true, engineFailed: false, hasData: false, live: false, timedOut: true })).toBe("no-signal");
    expect(bootPhase({ engineReady: false, engineFailed: false, hasData: false, live: false, timedOut: true })).toBe("no-signal");
  });
  it("is no-engine when the engine failed to start — even while data flows (avoids the booting wedge)", () => {
    expect(bootPhase({ engineReady: false, engineFailed: true, hasData: true, live: true, timedOut: false })).toBe("no-engine");
    expect(bootPhase({ engineReady: false, engineFailed: true, hasData: false, live: false, timedOut: false })).toBe("no-engine");
    // engineFailed takes precedence over a would-be no-signal
    expect(bootPhase({ engineReady: false, engineFailed: true, hasData: false, live: false, timedOut: true })).toBe("no-engine");
  });
});
