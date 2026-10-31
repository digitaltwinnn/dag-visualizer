import { describe, expect, it } from "vitest";

import { viewNetwork } from "./viewNetwork";

describe("viewNetwork", () => {
  it("is the filter with nothing browsed", () => {
    expect(viewNetwork({ filter: "all", hyperNet: null })).toBe("all");
    expect(viewNetwork({ filter: "dag", hyperNet: null })).toBe("dag");
  });
  it("is the browsed network over any filter", () => {
    expect(viewNetwork({ filter: "all", hyperNet: "dor" })).toBe("dor");
    expect(viewNetwork({ filter: "dag", hyperNet: "dor" })).toBe("dor");
  });
});
