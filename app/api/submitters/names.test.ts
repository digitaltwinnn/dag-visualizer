import { describe, it, expect } from "vitest";
import { nameWrites, parseDagscanSummary, parseDedLatest, storedName } from "./names";

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

describe("parseDagscanSummary", () => {
  it("maps orgs[].orgId to orgs[].name and skips an entry without both", () => {
    expect(parseDagscanSummary({ orgs: [{ orgId: "c98", name: "Open Poker", batches24h: 1 }, { orgId: "x" }, { name: "Nameless" }, 7] })).toEqual({ c98: "Open Poker" });
  });
  it("answers nothing for a body of another shape", () => {
    expect(parseDagscanSummary(null)).toEqual({});
    expect(parseDagscanSummary({ orgs: "no" })).toEqual({});
  });
});

describe("nameWrites", () => {
  // `@upstash/redis` hands a stored name back as an OBJECT (HGETALL JSON-parses each value, I1).
  const o = (name: string, source: "ded" | "dagscan", namedAt: number) => ({ name, source, namedAt });
  it("writes a new name as its source's JSON", () => {
    expect(nameWrites({}, { a: "Open Poker" }, "ded", T0)).toEqual({ a: j("Open Poker", "ded", T0) });
  });
  it("writes only what changed: a stored field the batch did not see is left alone", () => {
    const prev = { a: o("Open Poker", "dagscan", T0), b: o("Gate AI", "ded", T0) };
    expect(nameWrites(prev, { c: "Lotto Works" }, "ded", T1)).toEqual({ c: j("Lotto Works", "ded", T1) });
  });
  it("lets a ded name replace a dagscan one", () => {
    expect(nameWrites({ a: o("Open poker", "dagscan", T0) }, { a: "Open Poker" }, "ded", T1)).toEqual({ a: j("Open Poker", "ded", T1) });
  });
  it("never lets a dagscan name replace a ded one, read back as an object or as its JSON", () => {
    expect(nameWrites({ a: o("Open Poker", "ded", T0) }, { a: "OpenPoker" }, "dagscan", T1)).toEqual({});
    expect(nameWrites({ a: j("Open Poker", "ded", T0) }, { a: "OpenPoker" }, "dagscan", T1)).toEqual({});
  });
  it("updates a renamed organisation and leaves an unchanged one unwritten, so its namedAt keeps", () => {
    const prev = { a: o("Old", "ded", T0), b: o("Same", "ded", T0) };
    expect(nameWrites(prev, { a: "New", b: "Same" }, "ded", T1)).toEqual({ a: j("New", "ded", T1) });
    expect(nameWrites({ b: j("Same", "ded", T0) }, { b: "Same" }, "ded", T1)).toEqual({});
  });
  it("replaces a stored value it cannot read", () => {
    expect(nameWrites({ a: "not json" }, { a: "Open Poker" }, "dagscan", T0).a).toBe(j("Open Poker", "dagscan", T0));
    expect(nameWrites({ a: { name: "", source: "ded" } }, { a: "Open Poker" }, "dagscan", T0).a).toBe(j("Open Poker", "dagscan", T0));
    expect(nameWrites({ a: 42 }, { a: "Open Poker" }, "dagscan", T0).a).toBe(j("Open Poker", "dagscan", T0));
  });
  it("strips control characters and caps a name at 80 characters: names reach the notes' prompts", () => {
    expect(nameWrites({}, { a: "Open\u0000 Po\nker\u007f\u009b" }, "ded", T0).a).toBe(j("Open Poker", "ded", T0));
    expect(JSON.parse(nameWrites({}, { a: "x".repeat(500) }, "ded", T0).a!).name).toHaveLength(80);
    // nothing left once stripped is no name
    expect(nameWrites({}, { a: "\u0001\u0002" }, "ded", T0)).toEqual({});
  });
});

describe("storedName", () => {
  it("reads a stored name as the client hands it back (an object) or as stored (its JSON)", () => {
    expect(storedName({ name: "Open Poker", source: "ded", namedAt: T0 })).toEqual({ name: "Open Poker", source: "ded" });
    expect(storedName(j("Open Poker", "dagscan", T0))).toEqual({ name: "Open Poker", source: "dagscan" });
  });
  it("is null for an absent or unreadable value", () => {
    for (const v of [undefined, null, "not json", 7, [], { name: "X", source: "other" }, { source: "ded" }]) expect(storedName(v)).toBeNull();
  });
});
