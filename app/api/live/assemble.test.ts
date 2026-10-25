import { describe, expect, it } from "vitest";
import type { GlobalSnapshot, RawMetaSnapshot } from "@/src/data/types";
import { assembleLive, assembleWithUnlisted } from "./assemble";

const g = [{ ordinal: 1 }] as unknown as GlobalSnapshot[];
const fresh = [{ timestamp: new Date().toISOString() }] as RawMetaSnapshot[];
const old = [{ timestamp: new Date(Date.now() - 30 * 86_400_000).toISOString() }] as RawMetaSnapshot[];

describe("assembleLive", () => {
  it("lists a rejected chain in failed and keeps the others", async () => {
    const r = await assembleLive(
      { globals: async () => g, chain: async (id) => { if (id === "B") throw new Error("x"); return fresh; } },
      ["A", "B"], [],
    );
    expect(r.failed).toEqual(["B"]);
    expect(r.metas.A).toBe(fresh);
    expect(r.metas.B).toBeUndefined();
    expect(r.globals).toBe(g);
  });
  it("rejects when the globals read throws", async () => {
    await expect(assembleLive({ globals: async () => { throw new Error("g"); }, chain: async () => fresh }, ["A"], [])).rejects.toThrow("g");
  });
  it("leaves a quiet unlisted chain out of metas, unlisted and failed", async () => {
    const r = await assembleLive(
      { globals: async () => g, chain: async (id) => (id === "Q" ? old : fresh) },
      [], ["Q", "U"],
    );
    expect(r.metas.Q).toBeUndefined();
    expect(r.unlisted).toEqual(["U"]);
    expect(r.failed).toEqual([]);
  });
  it("keeps a listed chain with an empty list as []", async () => {
    const r = await assembleLive({ globals: async () => g, chain: async () => [] }, ["A"], []);
    expect(r.metas.A).toEqual([]);
  });
});

describe("assembleWithUnlisted", () => {
  it("reports a failed unlisted list as @unlisted, keeping globals and listed metas", async () => {
    const r = await assembleWithUnlisted(
      { globals: async () => g, chain: async () => fresh },
      ["A"],
      async () => { throw new Error("list"); },
      new Set(),
    );
    expect(r.failed).toContain("@unlisted");
    expect(r.globals).toBe(g);
    expect(r.metas.A).toBe(fresh);
  });
  it("remembers a quiet unlisted chain and skips it next time", async () => {
    const quiet = new Set<string>();
    const asked: string[] = [];
    const read = { globals: async () => g, chain: async (id: string) => { asked.push(id); return old; } };
    await assembleWithUnlisted(read, [], async () => ["Q"], quiet);
    await assembleWithUnlisted(read, [], async () => ["Q"], quiet);
    expect(asked).toEqual(["Q"]);
  });
});
