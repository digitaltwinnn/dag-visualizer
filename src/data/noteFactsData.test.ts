import { describe, it, expect } from "vitest";
import { DATA_NOTE_TICKS, dataFacts, type DataTickRead } from "./noteFactsData";
import type { ChannelSnapRow } from "./types";
import { DED_ID, DOR_ID } from "./submitters";

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
  // ONE NETWORK'S NOTE (2026-11-20: the Gate AI card follows the filter in Data blocks): its own
  // blocks over the same window, no whole-network totals, and no note when it carried none.
  it("one network's note states its own data blocks alone, and is null when it carried none", () => {
    const ticks: DataTickRead[] = [
      { ordinal: 1, rows: [row("dor", 2, 30), row("ded", 1, 4), row("ndt", 0, 0)] },
      { ordinal: 2, rows: [row("formerDor", 1, 5)] },
    ];
    expect(text(dataFacts({ ticks, names, keyOf, only: "dor" })!.facts)).toEqual([
      "Dor Technologies data blocks: 3",
      "Dor Technologies data updates: 35",
    ]);
    expect(dataFacts({ ticks, names, keyOf, only: "ndt" })).toBeNull();
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
    expect(DATA_NOTE_TICKS).toBe(50);
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
  // WHO SUBMITTED THE DATA (2026-11-27): DED's own note names its organisations, Dor's counts its
  // devices; every other note, the whole network's included, is unchanged.
  it("DED's own note states each organisation's batches, named as everywhere; Dor's counts its devices", () => {
    const blocks = (subs: { id: string; updates: number }[][]): Partial<ChannelSnapRow> => ({ dataBlockRows: subs.map((s) => ({ updates: s.reduce((a, x) => a + x.updates, 0), kinds: [], signers: 1, bytes: 1, digest: "d", submitters: s })) });
    const subNames = { dag: "DAG", [DED_ID]: "Digital Evidence", [DOR_ID]: "Dor Technologies" };
    const subKey = (id: string) => (id in subNames ? id : null);
    const ded = { ...row(DED_ID, 2, 7), ...blocks([[{ id: "op-1", updates: 4 }, { id: "0f3a9b12-x", updates: 1 }], [{ id: "op-1", updates: 2 }]]) } as ChannelSnapRow;
    const dor = { ...row(DOR_ID, 2, 3), ...blocks([[{ id: "devA", updates: 2 }], [{ id: "devA", updates: 1 }, { id: "devB", updates: 1 }]]) } as ChannelSnapRow;
    const ticks: DataTickRead[] = [{ ordinal: 1, rows: [ded, dor] }];
    const submitterNames = { "op-1": "Open Poker" };
    const one = dataFacts({ ticks, names: subNames, keyOf: subKey, only: DED_ID, submitterNames })!;
    expect(text(one.facts)).toEqual([
      "Digital Evidence data blocks: 2",
      "Digital Evidence data updates: 7",
      "Open Poker batches in the window: 6",
      "Org 0f3a9b12 batches in the window: 1",
    ]);
    expect(one.names).toEqual(expect.arrayContaining(["Open Poker", "Org 0f3a9b12"]));
    expect(text(dataFacts({ ticks, names: subNames, keyOf: subKey, only: DOR_ID, submitterNames })!.facts)).toContain("Devices that checked in, in the window: 2");
    // The whole network's note is unchanged.
    const all = dataFacts({ ticks, names: subNames, keyOf: subKey, submitterNames })!;
    expect(all.facts.some((f) => /batches|devices/i.test(f.label))).toBe(false);
    // A block the decoder could not read makes the counts a floor; a window with no submitter read states none.
    const unread = { ...ded, dataBlockRows: [...ded.dataBlockRows!, { updates: 0, unread: true as const, kinds: [], signers: 0, bytes: 0, digest: "" }] } as ChannelSnapRow;
    expect(text(dataFacts({ ticks: [{ ordinal: 1, rows: [unread] }], names: subNames, keyOf: subKey, only: DED_ID, submitterNames })!.facts)).toContain("Open Poker batches in the window, at least: 6");
    expect(dataFacts({ ticks: [{ ordinal: 1, rows: [row(DED_ID, 2, 7)] }], names: subNames, keyOf: subKey, only: DED_ID })!.facts.some((f) => /batches/.test(f.label))).toBe(false);
  });
});
