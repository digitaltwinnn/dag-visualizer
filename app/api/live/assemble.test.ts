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

describe("the miss path runs its reads in parallel", () => {
  // A deferred promise the test resolves by hand, to order the reads.
  const later = <T>() => {
    let resolve!: (v: T) => void, reject!: (e: unknown) => void;
    const promise = new Promise<T>((a, b) => ((resolve = a), (reject = b)));
    return { promise, resolve, reject };
  };

  it("starts the listed chains and the unlisted list before globals resolve, and still answers once", async () => {
    const gl = later<GlobalSnapshot[]>();
    const started: string[] = [];
    const p = assembleWithUnlisted(
      { globals: () => { started.push("globals"); return gl.promise; }, chain: async (id) => { started.push(id); return fresh; } },
      ["A", "B"],
      async () => { started.push("list"); return ["U"]; },
      new Set(),
    );
    await new Promise((r) => setTimeout(r, 0)); // let every started read settle except globals
    expect(started).toEqual(expect.arrayContaining(["globals", "A", "B", "list", "U"]));
    gl.resolve(g);
    const r = await p;
    expect(r.globals).toBe(g);
    expect(r.metas.A).toBe(fresh);
    expect(r.unlisted).toEqual(["U"]);
    expect(r.failed).toEqual([]);
  });

  it("starts the unlisted chains as soon as the list lands, not after the listed chains", async () => {
    const slowA = later<RawMetaSnapshot[]>();
    const started: string[] = [];
    const p = assembleWithUnlisted(
      { globals: async () => g, chain: (id) => { started.push(id); return id === "A" ? slowA.promise : Promise.resolve(fresh); } },
      ["A"],
      async () => ["U"],
      new Set(),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(started).toContain("U");
    slowA.resolve(fresh);
    expect((await p).unlisted).toEqual(["U"]);
  });

  it("a globals rejection still fails the answer, even after the chains landed", async () => {
    const gl = later<GlobalSnapshot[]>();
    const p = assembleWithUnlisted({ globals: () => gl.promise, chain: async () => fresh }, ["A"], async () => [], new Set());
    await new Promise((r) => setTimeout(r, 0));
    gl.reject(new Error("g"));
    await expect(p).rejects.toThrow("g");
  });

  it("keeps the failed order: listed, then unlisted, then @unlisted", async () => {
    const r = await assembleWithUnlisted(
      { globals: async () => g, chain: async (id) => { if (id !== "ok") throw new Error(id); return fresh; } },
      ["L1", "ok"],
      async () => ["U1"],
      new Set(),
    );
    expect(r.failed).toEqual(["L1", "U1"]);
  });
});
