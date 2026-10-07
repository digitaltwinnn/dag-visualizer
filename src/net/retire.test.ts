import { describe, expect, it } from "vitest";
import { proposeRetirement, RETIRE_QUIET_DAYS } from "./retire";

// THE BAKE PROPOSES A RETIREMENT ONLY ON TWO FACTS AT ONCE (user, 2026-10-07: "can it be done when
// we bake/rebake the network?"). A false retirement costs history — the sampler stops reading the
// network — so one directory read is not proof: the network must be GONE from the directory AND
// its chain must have STOPPED. The date is the chain's last snapshot, not the day it was noticed.
describe("proposeRetirement", () => {
  const D = 86_400_000;
  const now = Date.UTC(2026, 10, 20, 12);
  const last = Date.UTC(2026, 10, 2, 9, 30); // 18 days before now

  it("gone from the directory AND quiet: retire on the day of its last snapshot", () => {
    expect(proposeRetirement({ listed: false, lastSnapshotMs: last, nowMs: now })).toEqual({ retireOn: "2026-11-02", warn: null });
  });
  it("gone but still anchoring: warn, never retire", () => {
    const r = proposeRetirement({ listed: false, lastSnapshotMs: now - 2 * D, nowMs: now });
    expect(r.retireOn).toBeNull();
    expect(r.warn).toMatch(/still anchoring/);
  });
  it("listed but quiet: warn, never retire", () => {
    const r = proposeRetirement({ listed: true, lastSnapshotMs: last, nowMs: now });
    expect(r.retireOn).toBeNull();
    expect(r.warn).toMatch(/silent/);
  });
  it("gone and the chain unreadable: warn, never retire on no evidence", () => {
    const r = proposeRetirement({ listed: false, lastSnapshotMs: null, nowMs: now });
    expect(r.retireOn).toBeNull();
    expect(r.warn).toMatch(/could not be read/);
  });
  it("listed and anchoring: nothing to say", () => {
    expect(proposeRetirement({ listed: true, lastSnapshotMs: now - D, nowMs: now })).toEqual({ retireOn: null, warn: null });
  });
  it("quiet means a week without a snapshot", () => {
    expect(RETIRE_QUIET_DAYS).toBe(7);
    expect(proposeRetirement({ listed: false, lastSnapshotMs: now - 6 * D, nowMs: now }).retireOn).toBeNull();
    expect(proposeRetirement({ listed: false, lastSnapshotMs: now - 8 * D, nowMs: now }).retireOn).not.toBeNull();
  });
});
