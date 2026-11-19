import { describe, expect, it } from "vitest";
import { levelMeasure, levelOptions, listTotal, showsTileUnit } from "@/src/data/explorerMeasure";
import { blockMeasureUnit } from "@/src/data/blockMeasure";
import { METAGRAPHS } from "@/src/engine/config";

// ONE VOCABULARY PER EXPLORER, EACH LEVEL A SUBSET OF IT (user, 2026-09-29: "I would expect the
// values to be exactly the same for each level, but to only exclude the ones not relevant for that
// level, and if a value has been selected and is still relevant it stays on that value").
describe("levelOptions / levelMeasure", () => {
  const ALL = [
    { id: "fee", label: "Fees", unit: "DAG" },
    { id: "anchors", label: "Anchors", unit: "count" },
    { id: "metagraphs", label: "Metagraphs", unit: "count" },
    { id: "size", label: "Size", unit: "KB" },
  ] as const;

  it("a level lists the view's own options — same ids, same words — minus what it cannot state, in the view's order", () => {
    expect(levelOptions(ALL, ["size", "fee"] as const)).toEqual([ALL[0], ALL[3]]);
    expect(levelOptions(ALL, ["fee", "anchors", "size"] as const).map((o) => o.label)).toEqual(["Fees", "Anchors", "Size"]);
  });
  it("a level shows the view's pick where it can state it, and its own first measure where it cannot", () => {
    expect(levelMeasure(["fee", "anchors", "size"] as const, "size")).toBe("size");
    expect(levelMeasure(["fee", "anchors", "size"] as const, "metagraphs")).toBe("fee");
  });
});

describe("listTotal — the explorer foot's total", () => {
  it("sums the rows and reads nothing from an empty list", () => {
    expect(listTotal([37, 36, 20, 2, 1])).toBe(96);
    expect(listTotal([])).toBeNull();
  });
});

// THE TILE'S UNIT is a symbol the catalog knows, never a shape guessed from the string (review M2,
// 2026-11-10: "USDC.dag" failed an all-caps test, so its Amount and Fees tiles lost their unit).
describe("showsTileUnit", () => {
  it("shows the DAG, bytes and every catalog ticker — USDC.dag's lowercase part included", () => {
    expect(showsTileUnit("DAG")).toBe(true);
    expect(showsTileUnit("KB")).toBe(true);
    expect(showsTileUnit("USDC.dag")).toBe(true);
    for (const m of METAGRAPHS) expect(showsTileUnit(m.ticker)).toBe(true);
  });
  it("shows a symbol with 'only', and says nothing more for a count, a word or nothing", () => {
    expect(showsTileUnit("DAG only")).toBe(true);
    expect(showsTileUnit("count")).toBe(false);
    expect(showsTileUnit("nodes")).toBe(false);
    expect(showsTileUnit("height")).toBe(false);
    expect(showsTileUnit("only")).toBe(false);
    expect(showsTileUnit(undefined)).toBe(false);
    expect(showsTileUnit("")).toBe(false);
  });
  it("a Transaction blocks tile under the USDC.dag filter shows its ticker", () => {
    const tickerOf = (id: string) => METAGRAPHS.find((m) => m.id === id)?.ticker ?? id; // nodeRow.tickerOf's catalog read
    const usdc = METAGRAPHS.find((m) => m.ticker === "USDC.dag")!;
    expect(showsTileUnit(blockMeasureUnit("amount", usdc.id, tickerOf))).toBe(true);
    expect(showsTileUnit(blockMeasureUnit("fee", usdc.id, tickerOf))).toBe(true);
    expect(showsTileUnit(blockMeasureUnit("height", usdc.id, tickerOf))).toBe(false);
  });
});
