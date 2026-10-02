// THE LEDGER'S NETWORK RUNG, RESOLVED (2026-10-02).
//
// In the Snapshots view the rung between a global tick and a metagraph snapshot used to have no
// state of its own — it WAS the app filter. Two rulings then collided: a snapshot row may not
// commit the filter (design 2026-09-26, decision 13), which left that rung empty under a committed
// snapshot; and the pager's ∨ from the tick "commits the filter as the step" (2026-09-15), which
// re-scoped the whole app from a card's pager. The user named both on 2026-10-02: the rung must
// be complete, and reaching it must not set "the filter".
//
// So the ledger has a commit of its own — `TickNetSel`, the network INSIDE a tick — and this is
// the one resolver every ledger surface reads: the rail's Metagraph rung, the chamber's coloured
// dim, the commit tilt, the pager. Everything outside the ledger keeps reading the filter.
import type { TickNetSel } from "@/src/data/types";

/** The network the ledger resolves against: the tick-local commit while ITS tick is the one on
 *  screen, else the app filter (`"all"` when neither names one). The finer commit wins inside
 *  its tick — it is the more recent and more specific gesture — and it can never outlive that
 *  tick: a different tick on screen, or none, falls straight back to the filter. */
export function ledgerNetwork(s: { filter: string; tickNet: TickNetSel | null; snapOrdinal: number | null }): string {
  if (s.tickNet && s.snapOrdinal != null && s.tickNet.globalOrdinal === s.snapOrdinal) return s.tickNet.metaId;
  return s.filter;
}

/** Tick-network identity — the network and the tick it is committed inside. */
export const sameTickNet = (a: TickNetSel | null, b: TickNetSel | null): boolean =>
  a === b || (!!a && !!b && a.metaId === b.metaId && a.globalOrdinal === b.globalOrdinal);
