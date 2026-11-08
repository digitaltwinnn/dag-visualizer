// THE VIEW UNION, as an import-free LEAF (2026-10-26) — the `unlistedId.ts` pattern. The store
// re-exports it unchanged; it lives here because the store reads `viewPolicy` (the view's entry
// plane) and `viewPolicy` names its rows by this union, so a type import back into the store
// would close a cycle (`noImportCycles.test.ts`).
export type Mode = "hyper" | "geo" | "ledger" | "trend" | "soon";

// The Snapshots view's REGISTERS (2026-11-05; three since D6, 2026-11-07 — user: "Threeway."): the
// same chamber read as its metagraph snapshots, as the transaction blocks inside them, or as the data
// blocks they carry. Homed beside `Mode` for the same reason — `viewPolicy` lists a view's registers and
// a type import back into the store would close a cycle. The store re-exports it.
export type LedgerRegister = "snapshots" | "blocks" | "data";

/** THE SUBJECT A REGISTER SEATS BY ITSELF — the card slot its live follow fills and the register is
 *  ENTERED on (user, 2026-11-08: "transaction block is the best card to open when we enter this
 *  view/mode"; "entering data blocks, open the data block card"): the Blocks register's live block,
 *  the Data blocks register's live data block (the live snapshot's first). Metagraph snapshots seats
 *  none: its live global and snapshot leave the note the box (R70). One home for the store (a tick's
 *  rank drops on the way in), the rail's focus (`focusSlotId`'s rest rule) and the view-entry pins
 *  (`LaneCollapseState.seats`). */
export const REGISTER_SEAT: Readonly<Record<LedgerRegister, "block" | "dataBlock" | null>> = { snapshots: null, blocks: "block", data: "dataBlock" };
