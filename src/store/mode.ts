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
