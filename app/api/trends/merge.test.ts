import { describe, it, expect } from "vitest";
import { opOf, mergeVals } from "./merge";

describe("trends merge ops", () => {
  it("classifies series by the grammar", () => {
    expect(opOf("g.ticks")).toBe("add");
    expect(opOf("m.abc.fee")).toBe("add");
    expect(opOf("g.gapMax")).toBe("max");
    expect(opOf("f.nodes")).toBe("set");
    expect(opOf("f.cc.DE")).toBe("set");
  });
  it("merges by op with undefined prev as identity", () => {
    expect(mergeVals("g.ticks", undefined, 3)).toBe(3);
    expect(mergeVals("g.ticks", 2, 3)).toBe(5);
    expect(mergeVals("g.gapMax", 40, 28)).toBe(40);
    expect(mergeVals("g.gapMax", undefined, 28)).toBe(28);
    expect(mergeVals("f.nodes", 190, 195)).toBe(195);
  });
});
