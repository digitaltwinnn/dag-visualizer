// The TRAIL REWIND — the ledger's "the shown snapshot owns the front" subsystem (extracted from
// LedgerView 2026-08-08; behaviour unchanged). One offset slides the whole time trail +X so the
// PINNED/FOLLOWED row sits at the lead position:
//
//   · the EASE is only for the pin/unpin gesture itself;
//   · a tick advance while pinned shifts every slot AND the target by one SLOT_SP in the same
//     event — the offset JUMPS with it so the held row never moves (calm);
//   · when the FOLLOWED ordinal itself changes (filtered live mode — the network anchored a
//     fresh tick) the offset eases instead, so the trail glides forward to the new front;
//   · rows newer than the held row slide past the front edge and dissolve (`fadeAtX`, one slot
//     of travel).
//
// The two compose, and that is the whole of a filtered follow's tick handoff: the advance fires
// the JUMP (same ordinal, one slot back, so the held row does not move), and the store's follow
// then names the fresh ordinal at slot 0, so the target drops to 0 and the trail EASES back one
// slot in a single direction. A row arrives in ONE movement or the offset is fighting itself.
//
// The owner (LedgerView) applies `offset` to its groups/instances and multiplies brightnesses
// by `fadeAtX`; this class owns only the scalar state. Allocation-free per frame.
//
// This offset is the trail's ONE source of motion. It used to have a rival: a `holding` flag told
// the lane tiles to snap to their slot while a pin held the front and to ease their own stored x
// otherwise — but every other row-riding instrument (the byte bar, the ribbons, both label
// columns) reads `LEAD_X - slot * SLOT_SP` directly, so the ease was one instrument drifting off
// its own row rather than a motion the chamber had. It showed worst exactly where the flag
// dropped: a filtered follow's fresh anchor moves the held ordinal to slot 0, so `holding` went
// false in the same event that shifted every slot, and the tiles glided in a full slot late while
// their bars were already correct. Retired 2026-08-18 — tile x is derived, and the trail moves
// here or not at all.
import { SLOT_SP, frontAt } from "../../domain/ledgerModel";

export class TrailRewind {
  private _off = 0;
  private _pinnedOrd: number | null = null;
  private _slotPrev = -1;
  private _ordPrev: number | null = null;

  /** The current +X offset the whole trail wears. */
  get offset(): number {
    return this._off;
  }

  /** The COMMITTED (clicked) or FOLLOWED snapshot — the only thing the rewind tracks. */
  setPinned(ordinal: number | null): void {
    this._pinnedOrd = ordinal;
  }

  /** Advance one frame. `slotOf` resolves the held ordinal's CURRENT slot (−1 = not visible —
   *  the trail slides home). */
  update(dt: number, slotOf: (ordinal: number) => number): void {
    const slot = this._pinnedOrd != null ? slotOf(this._pinnedOrd) : -1;
    const target = slot > 0 ? slot * SLOT_SP : 0;
    // `>= 0` is "was the held row VISIBLE", and slot 0 — the LEAD — is visible. Written `> 0` it
    // excluded the one state a live follow actually sits in, which is what made the followed row
    // arrive in three movements instead of one (user, 2026-08-18: "active snapshot moves to the
    // back, then a bit to the front now and then arrives at its trail row"): the tick advance drew
    // it a full slot back, the missing jump let the offset ease up after it, and the store's follow
    // then landed on the new ordinal and unwound that ease. Only −1 (not visible) may skip the jump.
    if (slot > 0 && this._slotPrev >= 0 && slot !== this._slotPrev && this._pinnedOrd === this._ordPrev) {
      this._off += (slot - this._slotPrev) * SLOT_SP; // the calm jump — same ordinal, shifted slot
    }
    this._slotPrev = slot;
    this._ordPrev = this._pinnedOrd;
    this._off += (target - this._off) * Math.min(1, dt * 3.2);
    if (Math.abs(target - this._off) < 0.002) this._off = target;
  }

  /** 1 at/behind the lead position, dissolving within one slot of travel past the front edge.
   *  The math is `frontAt` in domain/ledgerModel — the byte bar reads it too, and the two must
   *  agree about where the chamber's front edge is. */
  fadeAtX(x: number): number {
    return frontAt(x);
  }
}
