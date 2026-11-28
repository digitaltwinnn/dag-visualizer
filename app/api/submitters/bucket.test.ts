import { describe, it, expect } from "vitest";
import { bucketDevices, bucketSubmitters, holeOf, nextSpan, type DeviceAdds } from "./bucket";
import { subSketchKeyOf, subSlotOf } from "./keys";

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
});

describe("bucketDevices — Dor's devices under their sketch keys (R22)", () => {
  it("collects a tally's device ids under the hour's and the day's sketch key, as sets, never fields", () => {
    const adds: DeviceAdds = new Map();
    bucketDevices(adds, NET, T, [{ id: "d1", updates: 1 }, { id: "d2", updates: 3 }]);
    bucketDevices(adds, NET, T + 3600000, [{ id: "d2", updates: 1 }]);
    expect([...adds.get(subSketchKeyOf(NET, "1h", T))!.ids].sort()).toEqual(["d1", "d2"]);
    expect([...adds.get(subSketchKeyOf(NET, "1h", T + 3600000))!.ids]).toEqual(["d2"]);
    expect([...adds.get(subSketchKeyOf(NET, "1d", T))!.ids].sort()).toEqual(["d1", "d2"]); // the day is the union of its hours
    expect(adds.size).toBe(3);
    expect(adds.get(subSketchKeyOf(NET, "1d", T))!.tier).toBe("1d"); // the count field's tier and bucket
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
