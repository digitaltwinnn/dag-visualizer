import { describe, it, expect } from "vitest";
import { calloutSubject, type CalloutSubjectInput } from "./calloutSubjects";

// THE SNAPSHOTS VIEW'S ONE SCENE LABEL, as one decision both owners consult (2026-11-07; one label
// since 2026-11-08 — user: "Two callouts is too much … 1 callout that relates to the subject").

const base: CalloutSubjectInput = {
  register: "snapshots",
  boxedCard: null,
  hasSnap: true,
  hasMetaSnap: false,
  hasBlock: false,
  hasDataBlock: false,
  lane: false,
};
const at = (over: Partial<CalloutSubjectInput>) => calloutSubject({ ...base, ...over });

describe("calloutSubject — the box leads", () => {
  it("the open card's subject is the label: global bar, snapshot tile, block, data block", () => {
    expect(at({ boxedCard: "snap", hasMetaSnap: true })).toBe("global");
    expect(at({ boxedCard: "metaSnap", hasMetaSnap: true })).toBe("metaSnap");
    expect(at({ register: "blocks", boxedCard: "block", hasBlock: true, hasMetaSnap: true })).toBe("block");
    expect(at({ register: "data", boxedCard: "dataBlock", hasDataBlock: true, hasMetaSnap: true })).toBe("dataBlock");
  });
  it("a boxed Metagraph card labels its lane — else the snapshot inside it, else the global", () => {
    expect(at({ boxedCard: "context", lane: true, hasMetaSnap: true })).toBe("lane");
    expect(at({ register: "blocks", boxedCard: "context", lane: true, hasBlock: true })).toBe("lane");
    expect(at({ boxedCard: "context", lane: false, hasMetaSnap: true })).toBe("metaSnap");
    expect(at({ boxedCard: "context", lane: false })).toBe("global");
    expect(at({ register: "blocks", boxedCard: "context", lane: false })).toBeNull();
  });
  it("a boxed Metagraph snapshot card labels the snapshot, over a finer block or data block", () => {
    expect(at({ register: "blocks", boxedCard: "metaSnap", hasMetaSnap: true, hasBlock: true })).toBe("metaSnap");
    expect(at({ register: "data", boxedCard: "metaSnap", hasMetaSnap: true, hasDataBlock: true })).toBe("metaSnap");
  });
  it("a box whose subject is not committed falls to the rest rule", () => {
    expect(at({ boxedCard: "metaSnap", hasMetaSnap: false })).toBe("global");
    expect(at({ register: "blocks", boxedCard: "block", hasBlock: false, hasMetaSnap: true })).toBe("metaSnap");
  });
});

describe("calloutSubject — at rest, the register's live subject, and never two", () => {
  it("Metagraph snapshots and Data blocks: the global snapshot (its lead speaks the register); else the snapshot, else the lane", () => {
    expect(at({ hasMetaSnap: true, lane: true })).toBe("global");
    expect(at({ register: "data", hasDataBlock: true, hasMetaSnap: true })).toBe("global");
    expect(at({ hasSnap: false, hasMetaSnap: true, lane: true })).toBe("metaSnap");
    expect(at({ hasSnap: false, lane: true })).toBe("lane");
    expect(at({ hasSnap: false })).toBeNull();
  });
  it("Transaction blocks: the block (no global is drawn there); else the snapshot, else the lane", () => {
    expect(at({ register: "blocks", hasBlock: true, hasMetaSnap: true })).toBe("block");
    expect(at({ register: "blocks", hasMetaSnap: true })).toBe("metaSnap");
    expect(at({ register: "blocks", lane: true })).toBe("lane");
    expect(at({ register: "blocks" })).toBeNull();
    expect(at({ register: "blocks", boxedCard: "snap" })).toBeNull();
  });
  it("a data block is never a Transaction blocks or Metagraph snapshots subject", () => {
    expect(at({ register: "snapshots", boxedCard: "dataBlock", hasDataBlock: true, hasMetaSnap: true })).toBe("global");
    expect(at({ register: "blocks", boxedCard: "dataBlock", hasDataBlock: true, hasBlock: true })).toBe("block");
  });
});
