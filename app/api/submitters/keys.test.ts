import { describe, it, expect } from "vitest";
import { subSlotOf, subField, subSpanKeyOf, subNamesKeyOf, subLockKeyOf } from "./keys";

const DED = "DAG0eQr94qUQSUhmYGNXt6CoBKWu5K6htvRMGC6M";
const T = Date.UTC(2026, 10, 27, 14, 5);

describe("sub keys", () => {
  it("pins the slots", () => {
    expect(subSlotOf(DED, "1h", T)).toEqual({ key: `sub:mainnet:${DED}:1h:2026-11`, bucket: "27-14" });
    expect(subSlotOf(DED, "1d", T)).toEqual({ key: `sub:mainnet:${DED}:1d:2026`, bucket: "11-27" });
  });
  it("pins fields and utility keys", () => {
    expect(subField("27-14", "abc")).toBe("27-14|abc");
    expect(() => subField("27-14", "a|b")).toThrow();
    expect(subSpanKeyOf(DED)).toBe(`sub:mainnet:${DED}:span`);
    expect(subNamesKeyOf(DED)).toBe(`sub:mainnet:${DED}:names`);
    expect(subLockKeyOf()).toBe("sub:mainnet:lock");
  });
});
