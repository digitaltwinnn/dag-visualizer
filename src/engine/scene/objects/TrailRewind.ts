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
// The owner (LedgerView) applies `offset` to its groups/instances and multiplies brightnesses
// by `fadeAtX`; this class owns only the scalar state. Allocation-free per frame.
import { LEAD_X } from "../../domain/ledgerLayout";
import { SLOT_SP } from "../../domain/ledgerModel";

export class TrailRewind {
  private _off = 0;
  private _pinnedOrd: number | null = null;
  private _slotPrev = -1;
  private _ordPrev: number | null = null;

  /** The current +X offset the whole trail wears. */
  get offset(): number {
    return this._off;
  }

  /** True while a rewind target holds the front — tile x must snap to its slot exactly (the
   *  generic per-tick ease would fight the jumped offset; the trail must read FROZEN). */
  get holding(): boolean {
    return this._pinnedOrd != null && this._slotPrev > 0;
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
    if (slot > 0 && this._slotPrev > 0 && slot !== this._slotPrev && this._pinnedOrd === this._ordPrev) {
      this._off += (slot - this._slotPrev) * SLOT_SP; // the calm jump — same ordinal, shifted slot
    }
    this._slotPrev = slot;
    this._ordPrev = this._pinnedOrd;
    this._off += (target - this._off) * Math.min(1, dt * 3.2);
    if (Math.abs(target - this._off) < 0.002) this._off = target;
  }

  /** 1 at/behind the lead position, dissolving within one slot of travel past the front edge. */
  fadeAtX(x: number): number {
    const over = (x - LEAD_X) / (SLOT_SP * 0.9);
    return over <= 0 ? 1 : Math.max(0, 1 - over);
  }
}
