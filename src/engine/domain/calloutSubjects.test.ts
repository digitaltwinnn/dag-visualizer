import { describe, it, expect } from "vitest";
import { calloutSubjects, type CalloutSubjectsInput } from "./calloutSubjects";

// THE SNAPSHOTS VIEW'S SCENE LABELS, as one decision both owners consult (2026-11-07): which subject
// the upper label names, and whether the global's label stands beside it.

const base: CalloutSubjectsInput = {
  register: "snapshots",
  boxedCard: null,
  hasNode: false,
  hasSnap: true,
  hasMetaSnap: false,
  hasBlock: false,
  hasDataBlock: false,
  lane: false,
};
const at = (over: Partial<CalloutSubjectsInput>) => calloutSubjects({ ...base, ...over });

describe("calloutSubjects — the box leads", () => {
  it("a boxed node owns the scene alone, in every register", () => {
    for (const register of ["snapshots", "blocks", "data"] as const) {
      expect(at({ register, boxedCard: "node", hasNode: true, hasMetaSnap: true, hasBlock: true, hasDataBlock: true, lane: true })).toEqual({ first: "node", second: null });
    }
  });
  it("a boxed Metagraph card labels its lane — in Transaction blocks too (the block label stood there)", () => {
    expect(at({ boxedCard: "context", lane: true, hasMetaSnap: true })).toEqual({ first: "lane", second: "global" });
    expect(at({ register: "blocks", boxedCard: "context", lane: true, hasBlock: true })).toEqual({ first: "lane", second: null });
    expect(at({ register: "data", boxedCard: "context", lane: true, hasDataBlock: true, hasMetaSnap: true })).toEqual({ first: "lane", second: "global" });
    // No lane to point at (the DAG, the unlisted set): the snapshot, else nothing.
    expect(at({ boxedCard: "context", lane: false, hasMetaSnap: true }).first).toBe("metaSnap");
    expect(at({ boxedCard: "context", lane: false }).first).toBeNull();
  });
  it("a boxed Metagraph snapshot card labels the snapshot, over a finer block or data block", () => {
    expect(at({ register: "blocks", boxedCard: "metaSnap", hasMetaSnap: true, hasBlock: true }).first).toBe("metaSnap");
    expect(at({ register: "data", boxedCard: "metaSnap", hasMetaSnap: true, hasDataBlock: true }).first).toBe("metaSnap");
  });
});

describe("calloutSubjects — the registers' own subjects", () => {
  it("Metagraph snapshots: the pair — the snapshot (else the lane) above, the global below", () => {
    expect(at({ hasMetaSnap: true, lane: true })).toEqual({ first: "metaSnap", second: "global" });
    expect(at({ lane: true })).toEqual({ first: "lane", second: "global" });
    expect(at({})).toEqual({ first: null, second: "global" });
    // No global shown: a carried node may be named; with a global, the global's label is the one.
    expect(at({ hasSnap: false, hasNode: true })).toEqual({ first: "node", second: null });
    expect(at({ hasSnap: true, hasNode: true })).toEqual({ first: null, second: "global" });
  });
  it("Transaction blocks: the block's label alone (no global drawn there); the snapshot's when a token block's is committed and boxed", () => {
    expect(at({ register: "blocks", hasBlock: true })).toEqual({ first: "block", second: null });
    expect(at({ register: "blocks", hasBlock: true, hasMetaSnap: true, boxedCard: "block" })).toEqual({ first: "block", second: null });
    expect(at({ register: "blocks", hasBlock: true, hasMetaSnap: true, boxedCard: "metaSnap" })).toEqual({ first: "metaSnap", second: null });
    expect(at({ register: "blocks", hasMetaSnap: true })).toEqual({ first: "metaSnap", second: null });
    expect(at({ register: "blocks" })).toEqual({ first: null, second: null });
  });
  it("Data blocks: the data block's label on its tile with the global below; the pair otherwise", () => {
    expect(at({ register: "data", hasDataBlock: true, hasMetaSnap: true })).toEqual({ first: "dataBlock", second: "global" });
    expect(at({ register: "data", hasDataBlock: true, hasMetaSnap: true, boxedCard: "dataBlock" })).toEqual({ first: "dataBlock", second: "global" });
    expect(at({ register: "data", hasMetaSnap: true })).toEqual({ first: "metaSnap", second: "global" });
    // A data block is never a Transaction blocks or Metagraph snapshots subject.
    expect(at({ register: "snapshots", hasDataBlock: true, hasMetaSnap: true }).first).toBe("metaSnap");
    expect(at({ register: "blocks", hasDataBlock: true, hasBlock: true }).first).toBe("block");
  });
});
