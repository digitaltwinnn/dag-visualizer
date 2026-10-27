import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryNotesStore } from "./store";

beforeEach(() => vi.useFakeTimers({ now: 1_000_000 }));
afterEach(() => vi.useRealTimers());

describe("memoryNotesStore", () => {
  it("sets and gets a value until its TTL passes", async () => {
    const s = memoryNotesStore();
    expect(await s.get("k")).toBeNull();
    await s.set("k", "v", 10);
    expect(await s.get("k")).toBe("v");
    vi.advanceTimersByTime(9_999);
    expect(await s.get("k")).toBe("v");
    vi.advanceTimersByTime(2);
    expect(await s.get("k")).toBeNull();
  });

  it("locks once until unlocked or expired", async () => {
    const s = memoryNotesStore();
    expect(await s.lock("l", 5)).toBe(true);
    expect(await s.lock("l", 5)).toBe(false);
    await s.unlock("l");
    expect(await s.lock("l", 5)).toBe(true);
    vi.advanceTimersByTime(5_001);
    expect(await s.lock("l", 5)).toBe(true);
  });

  it("counts with incr and hincr, each carrying a TTL", async () => {
    const s = memoryNotesStore();
    expect(await s.incr("c", 60)).toBe(1);
    expect(await s.incr("c", 60)).toBe(2);
    vi.advanceTimersByTime(60_001);
    expect(await s.incr("c", 60)).toBe(1);
    await s.hincr("h", "generated", 60);
    await s.hincr("h", "generated", 60);
    await s.hincr("h", "rejected", 60);
    expect(JSON.parse((await s.get("h"))!)).toEqual({ generated: 2, rejected: 1 });
  });
});
