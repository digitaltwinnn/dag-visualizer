import { describe, expect, it } from "vitest";

import { viewNetwork } from "./viewNetwork";

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
