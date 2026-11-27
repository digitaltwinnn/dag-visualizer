import { describe, expect, it } from "vitest";
import { DED_ID, DEVICE_ID_LEN, DOR_ID, SUBMITTERS, submitterLabel, submitterOf, tallySubmitters } from "./submitters";

const A = "c9834e11-36ca-436f-8954-6b304e13ac6b";
const B = "11111111-2222-3333-4444-555555555555";
const ded = (orgId: string) => ({ MetagraphBatchMessage: { orgId, batchId: "x" } });

describe("submitterOf", () => {
  it("reads a DED organisation id", () => {
    expect(submitterOf(DED_ID, ded(A))).toBe(A);
  });
  it("reads a Dor device id truncated to DEVICE_ID_LEN", () => {
    const id = submitterOf(DOR_ID, { publicId: "8e25d1c3a0a6d54be2c3719750d210185bacfe3b", dts: 1 });
    expect(id).toBe("8e25d1c3a0a6d54b");
    expect(id).toHaveLength(DEVICE_ID_LEN);
  });
  it("answers null for missing fields and non-object values", () => {
    for (const v of [{}, { MetagraphBatchMessage: {} }, null, "x", [], 7, undefined]) {
      expect(submitterOf(DED_ID, v)).toBeNull();
      expect(submitterOf(DOR_ID, v)).toBeNull();
    }
    expect(submitterOf(DED_ID, ded(""))).toBeNull();
  });
  it("answers null for an unlisted network", () => {
    expect(submitterOf("DAG0other", ded(A))).toBeNull();
  });
});

describe("tallySubmitters", () => {
  it("counts only updates with a submitter, busiest first, ties by id", () => {
    expect(tallySubmitters(DED_ID, [ded(A), ded(A), ded(B), { junk: 1 }, null])).toEqual([
      { id: A, updates: 2 },
      { id: B, updates: 1 },
    ]);
    expect(tallySubmitters(DED_ID, [ded(B), ded(A)]).map((r) => r.id)).toEqual([B, A].sort());
    expect(tallySubmitters("DAG0other", [ded(A)])).toEqual([]);
  });
});

describe("submitterLabel", () => {
  it("names the organisation, else Org plus the first 8", () => {
    expect(submitterLabel(A, {})).toBe("Org c9834e11");
    expect(submitterLabel(A, { [A]: "Open Poker" })).toBe("Open Poker");
  });
});

describe("SUBMITTERS", () => {
  it("states each network's kind and unit", () => {
    expect(SUBMITTERS[DED_ID].kind).toBe("organisation");
    expect(SUBMITTERS[DED_ID].unit).toBe("batches");
    expect(SUBMITTERS[DOR_ID].kind).toBe("device");
    expect(SUBMITTERS[DOR_ID].unit).toBe("check-ins");
  });
});
