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

/** THE SUBJECT A REGISTER SEATS BY ITSELF — the card slot its live follow fills and the callout
 *  names while the AI note is the box: the Metagraph snapshots register's live METAGRAPH SNAPSHOT
 *  (the newest read tick's newest), the Blocks register's live block, the Data blocks register's live
 *  data block (the live snapshot's first). Every register is ENTERED ON ITS NOTE, as every view is
 *  (user, 2026-11-09: "Each view opens on the Gate AI cards, each sub-view should do the same. The
 *  'default' callout should be a 'metagraph snapshot' | 'transaction block' | 'data block', when we
 *  close the AI card … the actual called out subject should be shown"): the seat is the card that
 *  opens when the note folds. One home for the store (a tick's rank drops on the way in), the
 *  rail's focus (`focusSlotId` — the filter is a lens beside a seat) and the live follow. */
export const REGISTER_SEAT: Readonly<Record<LedgerRegister, "metaSnap" | "block" | "dataBlock">> = { snapshots: "metaSnap", blocks: "block", data: "dataBlock" };
