import { describe, expect, it } from "vitest";
import { levelMeasure, levelOptions } from "@/src/data/explorerMeasure";

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
