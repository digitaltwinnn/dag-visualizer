import { describe, it, expect } from "vitest";
import { bucketSubmitters, nextSpan } from "./bucket";
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
  it("restarts on a gap", () => expect(nextSpan({ from: 10, to: 20 }, 25, 30)).toEqual({ from: 25, to: 30 }));
});
