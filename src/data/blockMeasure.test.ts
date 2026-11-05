import { describe, expect, it } from "vitest";
import { BLOCK_MEASURE_LABELS, BLOCK_MEASURE_OPTIONS, BLOCK_MEASURE_ORDER, blockMeasureText, blockMeasureValue } from "./blockMeasure";
import { formatDag } from "./trendSeries";

const b = { hash: "h", height: 61636, parents: [], txCount: 1, amount: 8450.12, fee: 0.01, signers: 3 };

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
    expect(BLOCK_MEASURE_OPTIONS.map((o) => o.id)).toEqual([...BLOCK_MEASURE_ORDER]);
    for (const o of BLOCK_MEASURE_OPTIONS) {
      expect(o.label).toBe(BLOCK_MEASURE_LABELS[o.id]);
      expect(o.unit.length).toBeGreaterThan(0);
    }
  });
});
