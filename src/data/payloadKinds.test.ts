import { describe, it, expect } from "vitest";
import { kindOf, payloadKinds } from "./payloadKinds";

describe("kindOf", () => {
  it("names a single-key wrapper by its key — the shape mainnet actually anchors", () => {
    expect(kindOf({ MetagraphBatchMessage: { batchId: "b1", root: "0xab" } })).toBe(
      "MetagraphBatchMessage",
    );
  });

  it("signs a flat multi-field record with its own field list", () => {
    expect(kindOf({ deviceId: "d1", ts: 12, value: 3 })).toBe("deviceId · ts · value");
  });

  it("names non-objects by JSON type, and keeps null and array distinct from object", () => {
    expect(kindOf(42)).toBe("number");
    expect(kindOf("x")).toBe("string");
    expect(kindOf(true)).toBe("boolean");
    expect(kindOf(null)).toBe("null");
    expect(kindOf([1, 2])).toBe("array");
    expect(kindOf({})).toBe("{}");
  });
});

describe("payloadKinds", () => {
  it("groups records of the same kind and counts them", () => {
    const rows = payloadKinds([
      { MetagraphBatchMessage: { a: 1 } },
      { MetagraphBatchMessage: { a: 2 } },
      { MetagraphBatchMessage: { a: 3 } },
    ]);
    expect(rows).toEqual([{ kind: "MetagraphBatchMessage", count: 3 }]);
  });

  it("keeps kinds in order of first appearance, so the table is deterministic", () => {
    const rows = payloadKinds([{ B: 1 }, { A: 1 }, { B: 2 }]);
    expect(rows.map((r) => r.kind)).toEqual(["B", "A"]);
    expect(rows).toEqual([
      { kind: "B", count: 2 },
      { kind: "A", count: 1 },
    ]);
  });

  it("counts a non-array payload as the one record it is, rather than hiding it", () => {
    expect(payloadKinds({ state: { a: 1 } })).toEqual([{ kind: "state", count: 1 }]);
    expect(payloadKinds(7)).toEqual([{ kind: "number", count: 1 }]);
  });

  it("reads an absent or empty payload as no rows — the lane then shows only its raw section", () => {
    expect(payloadKinds(null)).toEqual([]);
    expect(payloadKinds(undefined)).toEqual([]);
    expect(payloadKinds([])).toEqual([]);
  });
});
