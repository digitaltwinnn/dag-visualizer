import { describe, it, expect } from "vitest";
import { breadcrumbLabel } from "./breadcrumb";

describe("breadcrumbLabel", () => {
  it("names the parent metagraph when filtered (child ‹ parent)", () => {
    // DOR's config id → ticker "DOR"
    expect(breadcrumbLabel("node", "DAG0CyySf35ftDQDQBnd1bdQ9aPyUdacMghpnCuM")).toBe("node ‹ DOR");
    expect(breadcrumbLabel("snap", "DAG0CyySf35ftDQDQBnd1bdQ9aPyUdacMghpnCuM")).toBe("snapshot ‹ DOR");
  });
  it("falls back to the network when unfiltered", () => {
    expect(breadcrumbLabel("node", "all")).toBe("node ‹ network");
    expect(breadcrumbLabel("snap", "all")).toBe("snapshot ‹ network");
  });
  it("names the DAG core", () => {
    expect(breadcrumbLabel("node", "dag")).toBe("node ‹ DAG");
  });
});
