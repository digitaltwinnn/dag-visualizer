// The rewind's MOTION CONTRACT, which is scalar and therefore testable: a held row arrives in ONE
// movement. Two bugs in two days came from the same place — an instrument keeping its own idea of
// where its row is (the lane tiles' stored `x`, retired 2026-08-18) and the offset easing toward a
// target it was about to abandon (the `> 0` guard below, same day). Both read to the user as a row
// that wobbles into place, so the assertions here are all about DIRECTION and standing still, never
// about the easing constant.
//
// `slotOf` is the model's own resolver: 0 is the live lead, −1 is not visible. A frame with dt = 1
// drives `min(1, dt * 3.2)` to 1, which settles the ease in one call — that is a test convenience,
// not a claim about the rate.
import { describe, expect, it } from "vitest";
import { LEAD_X } from "../../domain/ledgerLayout";
import { SLOT_SP } from "../../domain/ledgerModel";
import { TrailRewind } from "./TrailRewind";

/** Where a row actually draws: its slot is the only source of x, plus the trail's offset. */
const rowX = (slot: number, offset: number) => LEAD_X - slot * SLOT_SP + offset;

const FRAME = 1 / 60;

describe("TrailRewind", () => {
  it("holds a row AT THE LEAD still through a tick advance", () => {
    // The regression: a filtered live follow sits at slot 0, so a guard of `> 0` skipped the jump
    // for the one state it lives in and the row fell a slot back before easing after itself.
    const r = new TrailRewind();
    r.setPinned(100);
    r.update(1, () => 0);
    expect(r.offset).toBe(0);
    const before = rowX(0, r.offset);

    r.update(FRAME, () => 1); // the tick advanced; still following 100
    expect(rowX(1, r.offset)).toBeCloseTo(before, 6);
  });

  it("holds a row BEHIND the lead still through a tick advance", () => {
    const r = new TrailRewind();
    r.setPinned(100);
    r.update(1, () => 3);
    const before = rowX(3, r.offset);

    r.update(FRAME, () => 4);
    expect(rowX(4, r.offset)).toBeCloseTo(before, 6);
  });

  it("EASES for the pin gesture itself, never jumping", () => {
    const r = new TrailRewind();
    r.setPinned(100); // pinning an older row is the user's own gesture — it should be seen moving
    r.update(FRAME, () => 3);
    expect(r.offset).toBeGreaterThan(0);
    expect(r.offset).toBeLessThan(SLOT_SP);
  });

  it("hands off to a fresh anchor in ONE direction", () => {
    // The filtered-follow handoff: the advance fires the jump, then the follow names the new
    // ordinal at slot 0 and the trail eases home. Non-monotone here IS the user's wobble.
    const r = new TrailRewind();
    r.setPinned(100);
    r.update(1, () => 0);
    r.update(FRAME, () => 1);
    expect(r.offset).toBeCloseTo(SLOT_SP, 6);

    r.setPinned(101);
    const slotOf = (ord: number) => (ord === 101 ? 0 : 1);
    let prev = r.offset;
    for (let i = 0; i < 60; i++) {
      r.update(FRAME, slotOf);
      expect(r.offset).toBeLessThanOrEqual(prev);
      prev = r.offset;
    }
    expect(r.offset).toBeLessThan(SLOT_SP * 0.5);
  });

  it("slides home when the held row leaves the trail, and when nothing is held", () => {
    const r = new TrailRewind();
    r.setPinned(100);
    r.update(1, () => 3);
    expect(r.offset).toBeGreaterThan(0);

    r.update(1, () => -1); // aged off the horizon
    expect(r.offset).toBe(0);

    r.setPinned(null);
    r.update(1, () => 3);
    expect(r.offset).toBe(0);
  });
});
