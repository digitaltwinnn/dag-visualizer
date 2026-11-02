import { describe, expect, it } from "vitest";
import { LOCATE_BUDGET_MS, locateRows, type ChainReader, type SnapRead } from "./snapshotAt";
import type { NoteChange } from "@/src/data/noteTypes";

// A chain every 10 seconds from T0, with one 2 hour gap, and a global chain stamped the same way.
const T0 = Date.UTC(2026, 10, 2, 8);
const iso = (ms: number) => new Date(ms).toISOString();
function chain(n: number, gapAt: number): SnapRead[] {
  let t = T0;
  return Array.from({ length: n }, (_, i) => {
    t += i === gapAt ? 7200_000 : 10_000;
    return { ordinal: i + 1, hash: `h${i + 1}`, timestamp: iso(t) };
  });
}
function reader(chains: Record<string, SnapRead[]>, globals: SnapRead[]): ChainReader & { reads: number } {
  const of = (c: string | null) => (c == null ? globals : (chains[c] ?? []));
  const r = {
    reads: 0,
    async latest(c: string | null) {
      r.reads++;
      return of(c).at(-1) ?? null;
    },
    async at(c: string | null, ordinal: number) {
      r.reads++;
      const rows = of(c);
      return rows[Math.max(0, ordinal - (rows[0]?.ordinal ?? 1))] ?? null; // before the fixture: its oldest
    },
  };
  return r;
}
const row = (over: Partial<NoteChange>): NoteChange => ({ kind: "peak", size: 0, text: "x", subject: { kind: "network", id: "dor" }, ...over });
const span = (rec: SnapRead) => ({ fromMs: Date.parse(rec.timestamp) - 1000, toMs: Date.parse(rec.timestamp) + 299_000 });

describe("locateRows", () => {
  it("leaves a note's write room inside its route's 60 seconds", () => {
    expect(LOCATE_BUDGET_MS).toBeLessThanOrEqual(8000);
  });

  const dor = chain(400, 216);
  const globals = dor.map((r, i) => ({ ...r, ordinal: 1000 + i, hash: `g${i}`, lastSnapshotHash: "prev" }));

  it("finds the snapshot that ended a gap, with the global it anchored into", async () => {
    const [r] = await locateRows([row({ find: { chain: "dor", ...span(dor[216]!), gapS: 7200 } })], reader({ dor }, globals));
    expect(r).toEqual({
      kind: "peak",
      size: 0,
      text: "x",
      subject: {
        kind: "metaSnap",
        sel: { metaId: "dor", ordinal: 217, hash: "h217", globalOrdinal: 1216, ts: dor[216]!.timestamp },
        global: { ordinal: 1216, timestamp: dor[216]!.timestamp, hash: "g216", lastSnapshotHash: "prev" },
      },
    });
  });

  it("finds the global snapshot that ended a stall", async () => {
    const glob = chain(300, 120).map((r) => ({ ...r, ordinal: r.ordinal + 5000 }));
    const [r] = await locateRows([row({ kind: "pause", subject: { kind: "network", id: "dag" }, find: { chain: null, ...span(glob[120]!), gapS: 7200 } })], reader({}, glob));
    expect(r!.subject).toEqual({ kind: "global", global: { ordinal: 5121, timestamp: glob[120]!.timestamp, hash: "h121" } });
  });

  it("finds the global snapshot that anchored the most, by its count", async () => {
    const counted = globals.map((r, i) => ({ ...r, count: i === 99 ? 18 : 5 }));
    const at = counted[99]!;
    const [r] = await locateRows([row({ subject: { kind: "self" }, find: { chain: null, ...span(at), count: 18 } })], reader({}, counted));
    expect(r!.subject).toEqual({ kind: "global", global: { ordinal: at.ordinal, timestamp: at.timestamp, hash: at.hash, lastSnapshotHash: "prev" } });
  });

  it("a quiet network opens its last snapshot", async () => {
    const [r] = await locateRows([row({ kind: "quiet", find: { chain: "dor", last: true } })], reader({ dor }, globals));
    expect(r!.subject).toMatchObject({ kind: "metaSnap", sel: { metaId: "dor", ordinal: 400 } });
  });

  it("keeps the row on its network where nothing matches, and never carries the search on", async () => {
    const [r] = await locateRows([row({ find: { chain: "dor", ...span(dor[216]!), gapS: 1 } })], reader({ dor }, globals));
    expect(r).toEqual({ kind: "peak", size: 0, text: "x", subject: { kind: "network", id: "dor" } });
  });

  it("keeps the row where a read fails", async () => {
    const broken: ChainReader = { latest: async () => { throw new Error("503"); }, at: async () => null };
    const [r] = await locateRows([row({ find: { chain: "dor", last: true } })], broken);
    expect(r!.subject).toEqual({ kind: "network", id: "dor" });
  });

  it("gives a slow explorer up, keeping the rows", async () => {
    const slow: ChainReader = { latest: () => new Promise(() => {}), at: async () => null };
    const [r] = await locateRows([row({ find: { chain: "dor", last: true } })], slow, 5);
    expect(r!.subject).toEqual({ kind: "network", id: "dor" });
  });

  it("stops reading once it has given up", async () => {
    let seen: AbortSignal | undefined;
    const hung: ChainReader = { latest: (_c, signal) => { seen = signal; return new Promise(() => {}); }, at: async () => null };
    await locateRows([row({ find: { chain: "dor", last: true } })], hung, 5);
    expect(seen?.aborted).toBe(true);
  });

  it("reads one record once a note, across its rows", async () => {
    const rd = reader({ dor }, globals);
    const find = { chain: "dor", last: true } as const;
    await locateRows([row({ find }), row({ find, text: "y" })], rd);
    expect(rd.reads).toBeLessThan(40);
    const alone = reader({ dor }, globals);
    await locateRows([row({ find })], alone);
    expect(rd.reads).toBe(alone.reads);
  });

  it("reads nothing for a row with no search", async () => {
    const rd = reader({ dor }, globals);
    expect(await locateRows([row({})], rd)).toEqual([row({})]);
    expect(rd.reads).toBe(0);
  });

  it("stays within a small budget on a long chain", async () => {
    const long = chain(30_000, 28_999);
    const glob = long.map((r, i) => ({ ...r, ordinal: i + 1, hash: `g${i}` }));
    const rd = reader({ dor: long }, glob);
    const [r] = await locateRows([row({ find: { chain: "dor", ...span(long[28_999]!), gapS: 7200 } })], rd);
    expect(r!.subject).toMatchObject({ kind: "metaSnap", sel: { ordinal: 29_000 } });
    expect(rd.reads).toBeLessThan(140);
  });
});
