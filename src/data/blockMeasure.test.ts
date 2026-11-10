import { describe, expect, it } from "vitest";
import { BLOCK_MEASURE_LABELS, BLOCK_MEASURE_ORDER, BLOCK_MEASURE_ROWS, blockMeasureCounts, blockMeasureOptions, blockMeasureText, blockMeasureUnit, blockMeasureValue } from "./blockMeasure";
import { formatDag } from "./trendSeries";

const ticker = (id: string) => (id === "dag" ? "DAG" : id.toUpperCase());
const b = { hash: "h", height: 61636, parents: [], txCount: 1, amount: 8450.12, fee: 0.01, signers: 3, transfers: [] };

describe("blockMeasure", () => {
  it("orders amount · fee · height and formats each", () => {
    expect(BLOCK_MEASURE_ORDER).toEqual(["amount", "fee", "height"]);
    expect(blockMeasureValue("height", b)).toBe(61636);
    expect(blockMeasureValue("amount", b)).toBe(8450.12);
    expect(blockMeasureValue("fee", b)).toBe(0.01);
    expect(blockMeasureText("amount", b)).toBe(formatDag(8450.12));
    expect(blockMeasureText("fee", b)).toBe(formatDag(0.01));
    expect(blockMeasureText("height", b)).toBe((61636).toLocaleString());
  });
  it("labels every measure and lists them as options in order", () => {
    expect(BLOCK_MEASURE_LABELS).toEqual({ amount: "Amount", fee: "Fees", height: "Height" });
    const options = blockMeasureOptions(null, ticker);
    expect(options.map((o) => o.id)).toEqual([...BLOCK_MEASURE_ORDER]);
    for (const o of options) {
      expect(o.label).toBe(BLOCK_MEASURE_LABELS[o.id]);
      expect(o.unit.length).toBeGreaterThan(0);
    }
  });
  // ONE UNIT PER LIST (user, 2026-11-10): an amount or a fee is in its chain's unit, so the list
  // counts the window's own chain only — the DAG's under All, said on the tile as "DAG only".
  it("under All counts the DAG's own blocks' amounts and fees alone, and the tile says DAG only", () => {
    expect(blockMeasureCounts("amount", "dag", null)).toBe(true);
    expect(blockMeasureCounts("amount", "dor", null)).toBe(false);
    expect(blockMeasureCounts("fee", "dor", null)).toBe(false);
    expect(blockMeasureCounts("height", "dor", null)).toBe(true); // a count, no unit
    expect(blockMeasureUnit("amount", null, ticker)).toBe("DAG only");
    expect(blockMeasureUnit("fee", null, ticker)).toBe("DAG only");
    expect(blockMeasureUnit("height", null, ticker)).toBe("height");
  });
  it("under a filter the window's own chain counts, in its ticker", () => {
    expect(blockMeasureCounts("amount", "dag", "dag")).toBe(true);
    expect(blockMeasureUnit("amount", "dag", ticker)).toBe("DAG");
    expect(blockMeasureCounts("amount", "dor", "dor")).toBe(true);
    expect(blockMeasureCounts("amount", "dag", "dor")).toBe(false);
    expect(blockMeasureUnit("fee", "dor", ticker)).toBe("DOR");
    expect(blockMeasureOptions("dor", ticker).map((o) => o.unit)).toEqual(["DOR", "DOR", "height"]);
    // The two unit-bearing tiles share a half-width row, so "Amount  DAG only" is whole.
    expect(BLOCK_MEASURE_ROWS).toEqual([2, 1]);
  });
});
