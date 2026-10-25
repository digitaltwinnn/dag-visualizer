import { describe, it, expect } from "vitest";
import { holdFeed, feedReaders } from "./feedUse";

describe("holdFeed / feedReaders", () => {
  it("lists a reader while it holds the feed, and drops it on release", () => {
    const release = holdFeed("api-trends", "History charts");
    expect(feedReaders("api-trends")).toContain("History charts");
    release();
    expect(feedReaders("api-trends")).not.toContain("History charts");
  });
  it("counts holds per reader, so one release never drops another mount's hold", () => {
    const a = holdFeed("exact", "Snapshot card");
    const b = holdFeed("exact", "Snapshot card");
    a();
    expect(feedReaders("exact")).toContain("Snapshot card");
    b();
    expect(feedReaders("exact")).not.toContain("Snapshot card");
  });
  it("a double release is harmless", () => {
    const keep = holdFeed("global", "Keeper");
    const r = holdFeed("global", "Keeper");
    r();
    r();
    expect(feedReaders("global")).toContain("Keeper");
    keep();
  });
  it("reports readers in a stable order", () => {
    const r1 = holdFeed("clusters", "b");
    const r2 = holdFeed("clusters", "a");
    expect(feedReaders("clusters")).toEqual(["a", "b"]);
    r1();
    r2();
  });
});
