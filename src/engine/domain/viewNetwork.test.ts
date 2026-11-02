import { describe, expect, it } from "vitest";

import { heldOut, viewNetwork } from "./viewNetwork";

describe("viewNetwork", () => {
  it("is the filter with nothing browsed", () => {
    expect(viewNetwork({ filter: "all", railNet: null })).toBe("all");
    expect(viewNetwork({ filter: "dag", railNet: null })).toBe("dag");
  });
  it("is the browsed network over any filter", () => {
    expect(viewNetwork({ filter: "all", railNet: "dor" })).toBe("dor");
    expect(viewNetwork({ filter: "dag", railNet: "dor" })).toBe("dor");
  });
});

describe("heldOut", () => {
  it("holds a filtered view inside its network", () => {
    expect(heldOut("biofi", "dor")).toBe(true);
    expect(heldOut("biofi", "biofi")).toBe(false);
  });
  it("holds nothing under All", () => {
    expect(heldOut("all", "dor")).toBe(false);
  });
});
