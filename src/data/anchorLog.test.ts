import { describe, expect, it } from "vitest";
import { buildAnchorLog, sortAnchorLog, buildUnlistedLog, snapsAtTick } from "@/src/data/anchorLog";
import type { MetaSnapRecord } from "@/src/data/api";
import type { GlobalSnapshot } from "@/src/data/types";

const g = (ordinal: number, timestamp: string): GlobalSnapshot => ({ ordinal, timestamp, hash: `h${ordinal}` });
const r = (ordinal: number, ts: string, fee = 100): MetaSnapRecord => ({ ordinal, hash: `m${ordinal}`, parent: "", ts, fee, sizeInKB: 1, height: 0, subHeight: 0, blocks: 0, epochProgress: 0 });

const globals = [g(1, "2026-08-01T10:00:00Z"), g(2, "2026-08-01T10:00:15Z")];
const snaps = new Map<string, MetaSnapRecord[]>([
  ["dor", [r(10, "2026-08-01T10:00:00Z"), r(11, "2026-08-01T10:00:15Z"), r(12, "2026-08-01T10:00:15Z")]],
  ["ded", [r(90, "2026-08-01T10:00:00Z"), r(91, "2026-08-01T09:00:00Z")]], // 09:00 is outside the window
]);

describe("buildAnchorLog", () => {
  it("one row per metagraph snapshot, joined to its anchoring global by timestamp", () => {
    const rows = buildAnchorLog(snaps, globals, "all");
    expect(rows).toHaveLength(4); // ded@09:00 dropped — no retained global to click through to
    expect(rows.every((x) => x.global.timestamp === x.ts)).toBe(true);
  });
  it("sorts newest tick first, then metagraph-ordinal desc within a tick", () => {
    const rows = buildAnchorLog(snaps, globals, "all");
    // Within the shared 10:00:00 tick, plain ordinal-desc across metagraphs: ded 90 before dor 10.
    expect(rows.map((x) => x.ordinal)).toEqual([12, 11, 90, 10]);
  });
  it("filter scopes to one metagraph; DAG reads as the whole log (the ledger lens)", () => {
    expect(buildAnchorLog(snaps, globals, "ded").map((x) => x.metaId)).toEqual(["ded"]);
    // Every global tick IS a DAG snapshot (ledgerStory.ledgerLens, user 2026-08-13) — the base
    // ledger's log is the whole log, not an empty one. An unknown id still yields nothing.
    expect(buildAnchorLog(snaps, globals, "dag").map((x) => x.ordinal)).toEqual([12, 11, 90, 10]);
    expect(buildAnchorLog(snaps, globals, "nope")).toEqual([]);
  });

  // SEAMS (user, 2026-09-01: "what should we do for a global snapshot that had no anchors? I want
  // this to be searchable as well, so it should appear but just without any network attached").
  // The scene has always drawn these standing at full height — a measured tick with no anchors is a
  // MEASUREMENT, not a missing one — and the log now agrees, so a reader can tell a quiet tick from
  // one the window never carried.
  describe("seams — a global tick that anchored nothing", () => {
    const withQuiet = [...globals, g(3, "2026-08-01T10:00:30Z")];

    it("appears as a row carrying the tick, with no metagraph and no metagraph ordinal", () => {
      const rows = buildAnchorLog(snaps, withQuiet, "all");
      const seam = rows.filter((x) => x.metaId === null);
      expect(seam).toHaveLength(1);
      expect(seam[0].global.ordinal).toBe(3);
      expect(seam[0].ts).toBe("2026-08-01T10:00:30Z");
      // Zeroes, and the TABLE renders them as em-dashes: fee and size are what a metagraph snapshot
      // paid and occupied, and there is no metagraph snapshot here.
      expect(seam[0].ordinal).toBe(0);
      expect(seam[0].fee).toBe(0);
      expect(seam[0].sizeInKB).toBe(0);
    });

    it("sorts into the chronology by its own tick, not appended at the end", () => {
      const rows = buildAnchorLog(snaps, withQuiet, "all");
      expect(rows[0].metaId).toBeNull(); // 10:00:30 is the newest tick in the window
      expect(rows.map((x) => x.global.ordinal)).toEqual([3, 2, 2, 1, 1]);
    });

    // ⚠️ THE BOUNDARY THAT MATTERS. A committed metagraph's log is that metagraph's own chain, and
    // a tick it never anchored into is not a quiet row in that chain — it is not in it at all.
    it("is WINDOW MODE only: a committed network's log carries none", () => {
      expect(buildAnchorLog(snaps, withQuiet, "ded").every((x) => x.metaId === "ded")).toBe(true);
      expect(buildAnchorLog(snaps, withQuiet, "dor").some((x) => x.metaId === null)).toBe(false);
    });

    // The base ledger IS the whole log (ledgerLens), so the quiet tick is one of its own snapshots.
    it("survives the DAG lens, which reads as all", () => {
      expect(buildAnchorLog(snaps, withQuiet, "dag").filter((x) => x.metaId === null)).toHaveLength(1);
    });

    it("sorts to one end of the NETWORK axis rather than scattering", () => {
      const rows = sortAnchorLog(buildAnchorLog(snaps, withQuiet, "all"), "net", 1, (id) => id.toUpperCase());
      expect(rows[0].metaId).toBeNull(); // "" sorts first ascending
      expect(sortAnchorLog(rows, "net", -1, (id) => id.toUpperCase())[4].metaId).toBeNull();
    });
  });
});

describe("snapsAtTick", () => {
  const rec = (ordinal: number, ts: string) => ({
    ordinal, hash: `h${ordinal}`, parent: `p${ordinal}`, ts, fee: 1, sizeInKB: 2,
    height: 8, subHeight: ordinal, blocks: 0, epochProgress: 100,
  });
  const map = new Map([["A", [rec(1, "t1"), rec(2, "t2"), rec(3, "t2")]]]);

  it("returns that metagraph's snapshots for one anchoring tick, oldest first", () => {
    expect(snapsAtTick(map, "A", "t2").map((r) => r.ordinal)).toEqual([2, 3]);
  });

  it("returns an empty list for an unknown metagraph or a tick it sat out", () => {
    expect(snapsAtTick(map, "B", "t2")).toEqual([]);
    expect(snapsAtTick(map, "A", "t9")).toEqual([]);
  });
});

describe("buildUnlistedLog (2026-08-07 — the exact reads are the only source)", () => {
  it("emits one row per uncataloged channel snapshot, newest tick first, listed excluded", () => {
    const g1 = { ordinal: 10, timestamp: "T1", hash: "h1" } as never;
    const g2 = { ordinal: 11, timestamp: "T2", hash: "h2" } as never;
    const exact = {
      10: { rows: [{ metaId: "LISTED", ordinal: 5, fee: 1, bytes: 1024 }, { metaId: "DAGxyz", ordinal: 7, fee: 2, bytes: 2048 }] },
      11: { rows: [{ metaId: "DAGabc", ordinal: 0, fee: 0, bytes: 512 }] },
    };
    const rows = buildUnlistedLog([g1, g2], exact, new Set(["LISTED"]));
    expect(rows.map((r) => r.metaId)).toEqual(["DAGabc", "DAGxyz"]);
    expect(rows[0].sizeInKB).toBeCloseTo(0.5, 6);
    expect(rows[1].global.ordinal).toBe(10);
    expect(rows[1].hash).toBe("");
  });
});

describe("sortAnchorLog (user, 2026-08-13 — the log sorts like the roster)", () => {
  const mk = (metaId: string, ordinal: number, fee: number, kb: number, ts: string, tick: number) =>
    ({ metaId, ordinal, hash: "", fee, sizeInKB: kb, ts, global: { ordinal: tick, timestamp: ts, hash: "" } });
  const rows = [
    mk("dor", 10, 5, 2, "2026-08-13T10:00:01Z", 2),
    mk("ded", 90, 1, 9, "2026-08-13T10:00:00Z", 1),
    mk("dor", 11, 3, 4, "2026-08-13T10:00:01Z", 2),
  ];
  const nameOf = (id: string) => (id === "dor" ? "Dor Technologies" : "Digital Evidence");

  it("age ascending IS the log's resting order: newest tick first, ordinal desc within", () => {
    expect(sortAnchorLog(rows, "age", 1, nameOf).map((r) => r.ordinal)).toEqual([11, 10, 90]);
  });
  it("net compares the DISPLAYED name, never the id (the roster's lesson)", () => {
    // by id "ded" < "dor", by name Digital Evidence < Dor Technologies — here they agree, so
    // pin the reverse direction too to prove dir flips the NAME order.
    expect(sortAnchorLog(rows, "net", -1, nameOf)[0].metaId).toBe("dor");
  });
  it("numeric keys compare numerically", () => {
    expect(sortAnchorLog(rows, "fee", 1, nameOf).map((r) => r.fee)).toEqual([1, 3, 5]);
    expect(sortAnchorLog(rows, "size", -1, nameOf).map((r) => r.sizeInKB)).toEqual([9, 4, 2]);
    expect(sortAnchorLog(rows, "tick", 1, nameOf).map((r) => r.global.ordinal)).toEqual([1, 2, 2]);
  });
});
