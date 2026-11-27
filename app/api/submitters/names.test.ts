import { describe, it, expect } from "vitest";
import { mergeNames, parseDedLatest } from "./names";

const T0 = Date.UTC(2026, 10, 27, 14, 0);
const T1 = T0 + 3600000;
const j = (name: string, source: "ded" | "dagscan", namedAt: number) => JSON.stringify({ name, source, namedAt });

describe("parseDedLatest", () => {
  it("maps orgId to orgName and skips an entry without a name", () => {
    expect(parseDedLatest({ data: [{ orgId: "c98…", orgName: "Open Poker" }, { orgId: "x" }] })).toEqual({ "c98…": "Open Poker" });
  });
  it("answers nothing for a body of another shape", () => {
    expect(parseDedLatest(null)).toEqual({});
    expect(parseDedLatest({ data: "no" })).toEqual({});
    expect(parseDedLatest({ data: [null, 3, { orgId: "", orgName: "Blank" }, { orgId: "a", orgName: "" }] })).toEqual({});
  });
});

describe("mergeNames", () => {
  it("adds a new name as its source's JSON", () => {
    expect(mergeNames({}, { a: "Open Poker" }, "ded", T0)).toEqual({ a: j("Open Poker", "ded", T0) });
  });
  it("never drops a key the batch did not see", () => {
    const prev = { a: j("Open Poker", "dagscan", T0), b: j("Gate AI", "ded", T0) };
    const out = mergeNames(prev, { c: "Lotto Works" }, "ded", T1);
    expect(Object.keys(out).sort()).toEqual(["a", "b", "c"]);
    expect(out.a).toBe(prev.a);
    expect(out.b).toBe(prev.b);
  });
  it("lets a ded name replace a dagscan one", () => {
    const out = mergeNames({ a: j("Open poker", "dagscan", T0) }, { a: "Open Poker" }, "ded", T1);
    expect(out.a).toBe(j("Open Poker", "ded", T1));
  });
  it("never lets a dagscan name replace a ded one", () => {
    const prev = { a: j("Open Poker", "ded", T0) };
    expect(mergeNames(prev, { a: "OpenPoker" }, "dagscan", T1).a).toBe(prev.a);
  });
  it("updates a renamed organisation and leaves an unchanged one as it was", () => {
    const prev = { a: j("Old", "ded", T0), b: j("Same", "ded", T0) };
    const out = mergeNames(prev, { a: "New", b: "Same" }, "ded", T1);
    expect(out.a).toBe(j("New", "ded", T1));
    expect(out.b).toBe(prev.b);
  });
  it("replaces a stored value it cannot read", () => {
    expect(mergeNames({ a: "not json" }, { a: "Open Poker" }, "dagscan", T0).a).toBe(j("Open Poker", "dagscan", T0));
  });
});
