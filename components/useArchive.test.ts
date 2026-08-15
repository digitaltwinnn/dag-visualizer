import { describe, it, expect } from "vitest";
import {
  archiveDisplay,
  archiveFactState,
  archiveSummary,
  fmtReach,
  fmtSnapCount,
  type ArchiveEntry,
  type ArchiveCensus,
} from "./useArchive";

// The Archive fact's value grammar: time AND kept-count for a window, "From genesis" for the
// whole chain, floor-era-only for the holed global deep archives (never a count — they have
// gaps, so a count would overclaim).
describe("archive value", () => {
  const base: ArchiveEntry = { ip: "1.2.3.4", chain: "global", kind: "window", floor: 0, latest: 0, floorTs: null };

  it("formats snapshot counts in the k/M register", () => {
    expect(fmtSnapCount(241_312)).toBe("241k");
    expect(fmtSnapCount(27_227_707)).toBe("27M");
    expect(fmtSnapCount(1_400_000)).toBe("1.4M");
    expect(fmtSnapCount(950)).toBe("950");
  });

  it("states reach in days under two months, whole months beyond", () => {
    const now = Date.parse("2026-08-14T12:00:00Z");
    expect(fmtReach("2026-08-04T12:00:00Z", now)).toBe("10 days");
    expect(fmtReach("2026-05-28T12:00:00Z", now)).toBe("3 months"); // ~78d — the global window
    expect(fmtReach("not a date", now)).toBeNull();
  });

  it("a window node: No, with its own reach and count as underlines", () => {
    const now = Date.now();
    const win: ArchiveEntry = {
      ...base,
      floor: 6_527_000,
      latest: 6_768_000,
      floorTs: new Date(now - 78 * 86_400_000).toISOString(),
    };
    expect(archiveDisplay(win, "Nov 2023")).toEqual({ genesis: false, reach: "~3 months", count: "241k snapshots" });
  });

  it("a genesis node: Yes, the whole chain with its age and size; deep: No, era only", () => {
    const now = Date.now();
    const birth = new Date(now - 450 * 86_400_000).toISOString();
    expect(archiveDisplay({ ...base, kind: "genesis", floor: 1, latest: 1_213_930, floorTs: birth }, "Nov 2023")).toEqual({
      genesis: true,
      reach: "~15 months",
      count: "1.2M snapshots",
    });
    expect(archiveDisplay({ ...base, kind: "deep" }, "Nov 2023")).toEqual({ genesis: false, reach: "back to Nov 2023" });
  });

  it("keeps the count when the floor date is unknown", () => {
    const win: ArchiveEntry = { ...base, floor: 100, latest: 5_100, floorTs: null };
    expect(archiveDisplay(win, "Nov 2023")).toEqual({ genesis: false, reach: undefined, count: "5k snapshots" });
  });
});

// The dossier's network-level reading: genesis survival counted across the fleet; a
// window-only fleet leads with its deepest reach and states the converse plainly.
describe("archive summary", () => {
  const census = (entries: ArchiveEntry[]): ArchiveCensus => ({
    entries: new Map(entries.map((e) => [e.ip, e])),
    since: "Nov 2023",
    archivalCount: 0,
    total: entries.length,
  });
  const e = (ip: string, chain: string, kind: ArchiveEntry["kind"], floor: number, latest: number, floorTs: string | null = null): ArchiveEntry =>
    ({ ip, chain, kind, floor, latest, floorTs });

  it("a genesis keeper checks the From genesis fact and sets reach to the chain's age", () => {
    const now = Date.now();
    const birth = new Date(now - 450 * 86_400_000).toISOString();
    const c = census([e("a", "m1", "genesis", 1, 100, birth), e("b", "m1", "window", 50, 100), e("c", "m1", "window", 60, 100)]);
    expect(archiveSummary(c, "m1")).toMatchObject({ reach: "~15 months", genesisRatio: "1 / 3", genesisAny: true });
  });

  it("global reads the deep-era reach; From genesis stays unchecked at 0", () => {
    const c = census([e("a", "global", "deep", 766_780, 6_700_000), e("b", "global", "window", 6_500_000, 6_700_000)]);
    expect(archiveSummary(c, "global")).toMatchObject({ reach: "back to Nov 2023", genesisRatio: "0 / 2", genesisAny: false });
  });

  it("a window-only fleet: reach is the deepest window, From genesis 0 / N unchecked", () => {
    const now = Date.now();
    const ts = new Date(now - 450 * 86_400_000).toISOString();
    const c = census([e("a", "dor", "window", 14_650_870, 27_227_757, ts), e("b", "dor", "window", 15_000_000, 27_227_757, ts)]);
    expect(archiveSummary(c, "dor")).toMatchObject({ reach: "~15 months", genesisRatio: "0 / 2", genesisAny: false });
  });

  it("answers null for a chain with no probed machines", () => {
    expect(archiveSummary(census([]), "m9")).toBeNull();
  });
});

// The node card's Full archive row is ALWAYS decided, never absent-then-popping (user,
// 2026-08-15): a separately-loaded fact holds its row with an acquiring state instead of
// appearing once loaded. The give-up is wired — a settled census with no reading is
// "unmeasured", never stars forever — and "n/a" needs no census at all: roles are local
// knowledge, so a machine with no L0 process answers immediately.
describe("archive fact state", () => {
  const entry: ArchiveEntry = { ip: "1.2.3.4", chain: "global", kind: "deep", floor: 766_780, latest: 6_700_000, floorTs: null };

  it("a census entry wins whatever the roles say", () => {
    const s = archiveFactState(entry, "Nov 2023", true, ["l0", "dl1"]);
    expect(s.kind).toBe("value");
    if (s.kind === "value") expect(s.display).toEqual({ genesis: false, reach: "back to Nov 2023" });
  });

  it("no L0 process answers n/a immediately, census still in flight", () => {
    expect(archiveFactState(undefined, undefined, false, ["dl1"]).kind).toBe("na");
  });

  it("an L0 machine acquires while the census is in flight, and gives up to unmeasured once settled", () => {
    expect(archiveFactState(undefined, undefined, false, ["l0"]).kind).toBe("acquiring");
    expect(archiveFactState(undefined, undefined, true, ["l0"]).kind).toBe("unmeasured");
  });

  it("unknown roles grow no row — even n/a would be a guess", () => {
    expect(archiveFactState(undefined, undefined, false, []).kind).toBe("none");
    expect(archiveFactState(undefined, undefined, true, []).kind).toBe("none");
  });
});
