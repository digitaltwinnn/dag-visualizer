import { describe, it, expect } from "vitest";
import { DATA_NOTE_TICKS, dataFacts, type DataTickRead } from "./noteFactsData";
import type { ChannelSnapRow } from "./types";

// THE DATA BLOCKS' NOTE FACTS (2026-11-07): the live window's exact reads — which networks carried
// data blocks over the window's minutes, how many, how many updates — stated over the ticks READ.

const row = (metaId: string, dataBlocks: number | undefined, dataTxCount: number | undefined, decoded = true): ChannelSnapRow =>
  ({ metaId, ordinal: 1, decoded, fee: 0, bytes: 0, signers: [], blocks: 0, hasState: false, stateBytes: 0, stateProof: null, ...(dataBlocks != null ? { dataBlocks } : {}), ...(dataTxCount != null ? { dataTxCount } : {}) }) as ChannelSnapRow;
const names = { dag: "DAG", dor: "Dor Technologies", ded: "Digital Evidence", ndt: "NDT" };
const keyOf = (id: string) => (id in names ? id : id === "formerDor" ? "dor" : null);
const text = (facts: { label: string; value: number }[]) => facts.map((f) => `${f.label}: ${f.value}`);

describe("dataFacts", () => {
  it("counts data blocks and updates per network over the ticks read, the whole first, networks with none left out", () => {
    const ticks: DataTickRead[] = [
      { ordinal: 1, rows: [row("dor", 2, 30), row("ded", 1, 4), row("ndt", 0, 0)] },
      { ordinal: 2, rows: [row("formerDor", 1, 5), row("ndt", 0, 0)] },
      { ordinal: 3, rows: null },
    ];
    const out = dataFacts({ ticks, names, keyOf })!;
    expect(text(out.facts)).toEqual([
      "Global snapshots read: 2",
      "Global snapshots in the window: 3",
      "Data blocks: 4",
      "Data updates: 39",
      "Dor Technologies data blocks: 3",
      "Dor Technologies data updates: 35",
      "Digital Evidence data blocks: 1",
      "Digital Evidence data updates: 4",
      "Networks that carried data blocks: 2",
    ]);
    expect(out.lead).toEqual({ kind: "now" });
    expect(out.names).toContain("Dor Technologies");
  });
  it("an undecodable row makes its network's and the whole's counts a floor; an uncataloged chain is the unlisted set", () => {
    const out = dataFacts({ ticks: [{ ordinal: 1, rows: [row("dor", 1, 2), row("dor", undefined, undefined, false), row("DAGxyz", 2, 9)] }], names, keyOf })!;
    expect(text(out.facts)).toContain("Data blocks, at least: 3");
    expect(text(out.facts)).toContain("Dor Technologies data blocks, at least: 1");
    expect(text(out.facts)).toContain("unlisted networks data blocks: 2"); // the unlisted set, by its own name
  });
  it("no tick read → no note; every tick read but no data → the whole's zero stands", () => {
    expect(dataFacts({ ticks: [{ ordinal: 1, rows: null }], names, keyOf })).toBeNull();
    const out = dataFacts({ ticks: [{ ordinal: 1, rows: [row("ndt", 0, 0)] }], names, keyOf })!;
    expect(text(out.facts)).toEqual(["Data blocks: 0", "Data updates: 0"]);
    expect(DATA_NOTE_TICKS).toBe(52);
  });
  it("every tick read: the read count is no news and is not stated (user, 2026-11-09)", () => {
    const out = dataFacts({ ticks: [{ ordinal: 1, rows: [row("dor", 2, 30)] }, { ordinal: 2, rows: [row("ded", 1, 4)] }], names, keyOf })!;
    expect(out.facts.some((f) => /global snapshots/i.test(f.label))).toBe(false);
  });
  it("states the window's END as a UTC clock time, first, so the note says \"as of\" and never \"right now\" (user, 2026-11-10)", () => {
    const end = Date.UTC(2026, 10, 10, 14, 5, 41);
    const out = dataFacts({ ticks: [{ ordinal: 1, rows: [row("dor", 2, 30)] }], names, keyOf, endMs: end })!;
    expect(out.facts[0]).toMatchObject({ label: "Window end, the newest global snapshot", kind: "time", value: end, text: "14:05 UTC" });
    // Unknown end: no fact, never a guessed clock.
    expect(dataFacts({ ticks: [{ ordinal: 1, rows: [row("dor", 2, 30)] }], names, keyOf, endMs: null })!.facts.some((f) => f.kind === "time")).toBe(false);
  });
});
