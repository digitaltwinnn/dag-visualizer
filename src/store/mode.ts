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

/** THE SUBJECT A REGISTER'S LIVE FOLLOW SEATS BY ITSELF — the Blocks register's live block, the Data
 *  blocks register's live data block (the live snapshot's first). Metagraph snapshots seats none of
 *  its own: its live global and snapshot are the plain follow's. A seat is a LENS-PROOF card: under
 *  a network filter it stays the box below the filter's folded Metagraph card (`focusSlotId`). */
export const REGISTER_SEAT: Readonly<Record<LedgerRegister, "block" | "dataBlock" | null>> = { snapshots: null, blocks: "block", data: "dataBlock" };

/** THE CARD UNDER A REGISTER'S AI NOTE — the subject the callout names while the note is the box and
 *  the card folding the note opens (user, 2026-11-09: "the 'default' callout should be a … 'transaction
 *  block' …", then "changed my mind, for view-mode metagraph snapshots and data blocks the default
 *  callout when AI cards is shown should be the global snapshot"): the global snapshot in Metagraph
 *  snapshots and Data blocks, the live block in Transaction blocks (no global is drawn there, D3).
 *  One home for `focusSlotId`'s rest and `calloutSubject`'s rest rule, so the two never disagree. */
export const REGISTER_REST: Readonly<Record<LedgerRegister, "snap" | "block">> = { snapshots: "snap", blocks: "block", data: "snap" };
