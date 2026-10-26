// THE VIEW UNION, as an import-free LEAF (2026-10-26) — the `unlistedId.ts` pattern. The store
// re-exports it unchanged; it lives here because the store reads `viewPolicy` (the view's entry
// plane) and `viewPolicy` names its rows by this union, so a type import back into the store
// would close a cycle (`noImportCycles.test.ts`).
export type Mode = "hyper" | "geo" | "ledger" | "trend" | "soon";
