import { describe, it, expect } from "vitest";
import { bucketSubmitters, holeOf, nextSpan } from "./bucket";
import { subSlotOf } from "./keys";

const NET = "DAG0eQr94qUQSUhmYGNXt6CoBKWu5K6htvRMGC6M";
const T = Date.UTC(2026, 10, 27, 14, 5);

describe("bucketSubmitters", () => {
  it("sums two tallies in one hour per field, in both tiers", () => {
    const inc = new Map<string, Map<string, number>>();
    bucketSubmitters(inc, NET, T, [{ id: "o1", updates: 2 }]);
    bucketSubmitters(inc, NET, T + 600000, [{ id: "o1", updates: 3 }, { id: "o2", updates: 1 }]);
    const h = inc.get(subSlotOf(NET, "1h", T).key)!, d = inc.get(subSlotOf(NET, "1d", T).key)!;
    expect(h.get("27-14|o1")).toBe(5);
    expect(h.get("27-14|o2")).toBe(1);
    expect(d.get("11-27|o1")).toBe(5);
    expect(d.get("11-27|o2")).toBe(1);
  });
  it("keeps a day's 1d equal to the sum of its hours", () => {
    const inc = new Map<string, Map<string, number>>();
    bucketSubmitters(inc, NET, T, [{ id: "o1", updates: 2 }]);
    bucketSubmitters(inc, NET, T + 3600000, [{ id: "o1", updates: 4 }]);
    expect(inc.get(subSlotOf(NET, "1d", T).key)!.get("11-27|o1")).toBe(6);
  });
  it("writes one field per device", () => {
    const inc = new Map<string, Map<string, number>>();
    bucketSubmitters(inc, NET, T, [{ id: "d1", updates: 1 }, { id: "d2", updates: 1 }, { id: "d3", updates: 2 }]);
    expect([...inc.get(subSlotOf(NET, "1h", T).key)!.keys()].sort()).toEqual(["27-14|d1", "27-14|d2", "27-14|d3"]);
  });
});

describe("nextSpan", () => {
  it("starts a span", () => expect(nextSpan(null, 10, 20)).toEqual({ from: 10, to: 20 }));
  it("extends when contiguous", () => expect(nextSpan({ from: 10, to: 20 }, 20, 30)).toEqual({ from: 10, to: 30 }));
  it("keeps `from` across a gap (R20: the gap is a hole, never a restart)", () => expect(nextSpan({ from: 10, to: 20 }, 25, 30)).toEqual({ from: 10, to: 30 }));
});

describe("holeOf — the hours a gap leaves unmeasured (R20)", () => {
  const H = 3600000, T = Date.UTC(2026, 10, 27, 8);
  it("runs from the hour holding the span's old end to the end of the hour holding the first new record", () => {
    expect(holeOf(T + 20 * 60000, T + 3 * H + 5 * 60000)).toEqual({ from: T, to: T + 4 * H });
  });
  it("takes in the first record's own hour even on an hour edge: snapshots share a timestamp, so missed ones may sit at it", () => {
    expect(holeOf(T + 20 * 60000, T + 3 * H)).toEqual({ from: T, to: T + 4 * H });
  });
});
