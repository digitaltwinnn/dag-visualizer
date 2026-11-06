import { describe, expect, it } from "vitest";
import { BLOCKS_PAGE, modeForPath, pathFor, pathForMode, registerForPath } from "./views";

describe("the Blocks register's URL", () => {
  it("publishes /blocks for the ledger in the Blocks register, and /snapshots otherwise", () => {
    expect(pathFor("ledger", "blocks")).toBe("/blocks");
    expect(pathFor("ledger", "snapshots")).toBe("/snapshots");
    expect(pathFor("geo", "blocks")).toBe(pathForMode("geo"));
  });

  it("reads /blocks back as the ledger view in the Blocks register", () => {
    expect(modeForPath("/blocks")).toBe("ledger");
    expect(modeForPath("/blocks/")).toBe("ledger");
    expect(registerForPath("/blocks")).toBe("blocks");
  });

  it("names the Snapshots register for /snapshots and no register for other views", () => {
    expect(modeForPath("/snapshots")).toBe("ledger");
    expect(registerForPath("/snapshots")).toBe("snapshots");
    expect(registerForPath("/geography")).toBeNull();
    expect(registerForPath("/nowhere")).toBeNull();
  });

  it("carries the page's name and description", () => {
    expect(BLOCKS_PAGE.name).toBe("Blocks");
    expect(BLOCKS_PAGE.slug).toBe("blocks");
  });
});
