import { describe, it, expect } from "vitest";
import { breakpointOf } from "./breakpoint";

describe("breakpointOf", () => {
  it("is desktop at >=1100", () => { expect(breakpointOf(1100)).toBe("desktop"); expect(breakpointOf(1600)).toBe("desktop"); });
  it("is tablet in 700..1099", () => { expect(breakpointOf(1099)).toBe("tablet"); expect(breakpointOf(700)).toBe("tablet"); });
  it("is phone below 700", () => { expect(breakpointOf(699)).toBe("phone"); expect(breakpointOf(360)).toBe("phone"); });
});
