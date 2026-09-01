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
  update(dt: number, slotOf: (ordinal: number) => number, advanced = false): void {
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
    // ⚠️ AN UNHELD TRAIL USED TO SNAP (user, 2026-09-01: "the bytebars move backwards, direction
    // of the trail, a bit abruptly — can you slow that movement down?"). Every row is drawn at
    // `LEAD_X − slot * SLOT_SP`, so when a tick advances each slot increments and the row's x
    // TELEPORTS one slot back in a single frame. The jump above hides that for the HELD row only,
    // which is why a follow looks calm and an unheld trail does not.
    //
    // The cure is the mechanism that already exists: push the offset forward by the slot the trail
    // just gained, so the frame renders every row where it already was, and let the damper below
    // carry it back. One movement, in one direction — the invariant this class is built on.
    //
    // ⚠️ `else`, NEVER both: on an advance WITH a held row the jump above has already accounted for
    // that same slot, and adding this on top would step the trail two slots for one tick.
    else if (advanced) this._off += SLOT_SP;
    this._slotPrev = slot;
    this._ordPrev = this._pinnedOrd;
    // 2.0, down from 3.2: with the glide above this is now the trail's VISIBLE per-tick motion
    // rather than a correction nobody was meant to watch, and at 3.2 it arrived in ~1s, which read
    // as the snap it replaced. Ticks are ~28 s apart, so an unhurried ~2 s costs nothing.
    this._off += (target - this._off) * Math.min(1, dt * 2.0);
    if (Math.abs(target - this._off) < 0.002) this._off = target;
  }

  /** 1 at/behind the lead position, fully dissolved by the chamber's front rim. The math is
   *  `frontAt` in domain/ledgerModel — the byte bar reads it too, and the two must agree about
   *  where the chamber's front edge is. */
  fadeAtX(x: number): number {
    return frontAt(x);
  }
}
