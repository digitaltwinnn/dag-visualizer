import { describe, expect, it } from "vitest";
import type { GlobalSnapshot, RawMetaSnapshot } from "@/src/data/types";
import { assembleLive } from "./assemble";

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
