import { describe, it, expect } from "vitest";
import { kindOf, PAYLOAD_LANES, parsePayload, payloadKinds } from "./payloadKinds";

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
    expect(rows).toEqual([{ kind: "MetagraphBatchMessage", fields: null, count: 3 }]);
  });

  it("keeps kinds in order of first appearance, so the table is deterministic", () => {
    const rows = payloadKinds([{ B: 1 }, { A: 1 }, { B: 2 }]);
    expect(rows.map((r) => r.kind)).toEqual(["B", "A"]);
    expect(rows).toEqual([
      { kind: "B", fields: null, count: 2 },
      { kind: "A", fields: null, count: 1 },
    ]);
  });

  it("counts a non-array payload as the one record it is, rather than hiding it", () => {
    expect(payloadKinds({ state: { a: 1 } })).toEqual([{ kind: "state", fields: null, count: 1 }]);
    expect(payloadKinds(7)).toEqual([{ kind: "number", fields: null, count: 1 }]);
  });

  it("reads an absent or empty payload as no rows — the lane then shows only its raw section", () => {
    expect(payloadKinds(null)).toEqual([]);
    expect(payloadKinds(undefined)).toEqual([]);
    expect(payloadKinds([])).toEqual([]);
  });
});

// The lane words are shared by the metagraph-snapshot CARD's two sections and the raw layer's two
// lane tabs — one subject disclosed at two levels, so they must be the same two words.
describe("PAYLOAD_LANES", () => {
  it("names both lanes and titles each, since a bare `none` means a different thing in each", () => {
    for (const lane of [PAYLOAD_LANES.state, PAYLOAD_LANES.data]) {
      expect(lane.name.length).toBeGreaterThan(0);
      expect(lane.title.length).toBeGreaterThan(0);
    }
    expect(PAYLOAD_LANES.state.name).not.toBe(PAYLOAD_LANES.data.name);
    expect(PAYLOAD_LANES.state.title).not.toBe(PAYLOAD_LANES.data.title);
  });
});

describe("parsePayload", () => {
  it("decodes JSON, and feeds payloadKinds directly", () => {
    expect(parsePayload('[{"a":1},{"a":2}]')).toEqual([{ a: 1 }, { a: 2 }]);
    expect(payloadKinds(parsePayload('[{"a":1},{"a":2}]'))).toEqual([{ kind: "a", fields: null, count: 2 }]);
  });

  it("keeps an undecodable payload as its own string rather than hiding it", () => {
    expect(parsePayload("not json")).toBe("not json");
  });

  it("treats an absent payload as nothing, which yields no kinds", () => {
    expect(parsePayload(undefined)).toBeNull();
    expect(parsePayload("")).toBeNull();
    expect(payloadKinds(parsePayload(undefined))).toEqual([]);
  });
});

describe("payloadKinds · fields (the schema as structure, 2026-08-13)", () => {
  it("a flat multi-field record carries its field names in record order; one-word kinds carry null", () => {
    const rows = payloadKinds([
      { publicId: 1, signature: "s", dts: 2 },
      { MetagraphBatchMessage: { root: "r" } },
      "str",
    ]);
    expect(rows.find((r) => r.kind === "publicId · signature · dts")?.fields).toEqual(["publicId", "signature", "dts"]);
    expect(rows.find((r) => r.kind === "MetagraphBatchMessage")?.fields).toBeNull();
    expect(rows.find((r) => r.kind === "string")?.fields).toBeNull();
  });
});
