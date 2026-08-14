import { describe, it, expect } from "vitest";
import { archiveDisplay, archiveSummary, fmtReach, fmtSnapCount, type ArchiveEntry, type ArchiveCensus } from "./useArchive";

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

  it("time leads a window; the count is the muted detail", () => {
    const now = Date.now();
    const win: ArchiveEntry = {
      ...base,
      floor: 6_527_000,
      latest: 6_768_000,
      floorTs: new Date(now - 78 * 86_400_000).toISOString(),
    };
    expect(archiveDisplay(win, "Nov 2023")).toEqual({ primary: "~3 months", detail: "241k snapshots" });
  });

  it("genesis claims the chain and carries its size; deep claims only its era, no count", () => {
    expect(archiveDisplay({ ...base, kind: "genesis", floor: 1, latest: 1_213_930 }, "Nov 2023")).toEqual({
      primary: "From genesis",
      detail: "1.2M snapshots",
    });
    expect(archiveDisplay({ ...base, kind: "deep" }, "Nov 2023")).toEqual({ primary: "Back to Nov 2023" });
  });

  it("falls back to count alone when the floor date is unknown", () => {
    const win: ArchiveEntry = { ...base, floor: 100, latest: 5_100, floorTs: null };
    expect(archiveDisplay(win, "Nov 2023")).toEqual({ primary: "~5k snapshots" });
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
