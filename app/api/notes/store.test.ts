import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryNotesStore, notesStore, notesWritable } from "./store";

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

  it("reads many values at once with mget, null for a missing or expired one", async () => {
    const s = memoryNotesStore();
    expect(await s.mget([])).toEqual([]);
    await s.set("a", "1", 10);
    await s.set("b", "2", 1);
    vi.advanceTimersByTime(1_001);
    expect(await s.mget(["a", "b", "c"])).toEqual(["1", null, null]);
  });
});

// THE DEV-ONLY STORE SWITCH (ruling R35): `NOTES_STORE=memory` makes a dev server write its notes
// into one process-wide memory store instead of the shared production Upstash store. Production
// ignores the switch, so a stray env var can never take a deployment off its real store.
describe("notesStore — the dev-only memory switch", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("answers ONE process-wide memory store when NOTES_STORE=memory outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NOTES_STORE", "memory");
    vi.stubEnv("UPSTASH_KV_REST_API_URL", "");
    vi.stubEnv("UPSTASH_KV_REST_API_TOKEN", "");
    const a = notesStore();
    const b = notesStore();
    expect(a).toBe(b);
    await a.set("k", "v", 10);
    expect(await b.get("k")).toBe("v");
  });

  it("a production NODE_ENV ignores the switch and asks for Upstash", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NOTES_STORE", "memory");
    vi.stubEnv("UPSTASH_KV_REST_API_URL", "");
    vi.stubEnv("UPSTASH_KV_REST_API_TOKEN", "");
    expect(() => notesStore()).toThrow("Upstash env missing");
  });

  it("without the switch it asks for Upstash", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NOTES_STORE", "");
    vi.stubEnv("UPSTASH_KV_REST_API_URL", "");
    vi.stubEnv("UPSTASH_KV_REST_API_TOKEN", "");
    expect(() => notesStore()).toThrow("Upstash env missing");
  });
});

// R66: NOTES ARE WRITTEN BY PRODUCTION ONLY. A preview shares production's store, so it serves the
// cache and writes nothing; a local server (no VERCEL_ENV) writes, into its memory store in dev.
describe("notesWritable — where notes may be written", () => {
  afterEach(() => vi.unstubAllEnvs());
  it.each([
    ["production", true],
    ["preview", false],
    ["development", false],
    ["", true],
  ])("VERCEL_ENV=%j: %s", (env, writable) => {
    vi.stubEnv("VERCEL_ENV", env);
    expect(notesWritable()).toBe(writable);
  });
  it("unset (a local server): writable", () => {
    vi.stubEnv("VERCEL_ENV", undefined);
    expect(process.env.VERCEL_ENV).toBeUndefined();
    expect(notesWritable()).toBe(true);
  });
});
