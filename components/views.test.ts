import { describe, expect, it } from "vitest";
import { BLOCKS_PAGE, REGISTER_NAMES, REGISTER_PAGE_LIST, REGISTER_PAGES, modeForPath, pathFor, pathForMode, registerForPath, titleNameFor } from "./views";

describe("the Snapshots view's register URLs", () => {
  it("publishes /blocks and /data-blocks for the ledger in those registers, and /snapshots otherwise", () => {
    expect(pathFor("ledger", "blocks")).toBe("/blocks");
    expect(pathFor("ledger", "data")).toBe("/data-blocks");
    expect(pathFor("ledger", "snapshots")).toBe("/snapshots");
    expect(pathFor("geo", "blocks")).toBe(pathForMode("geo"));
    expect(pathFor("geo", "data")).toBe(pathForMode("geo"));
  });

  it("reads a register page back as the ledger view in that register", () => {
    expect(modeForPath("/blocks")).toBe("ledger");
    expect(modeForPath("/blocks/")).toBe("ledger");
    expect(registerForPath("/blocks")).toBe("blocks");
    expect(modeForPath("/data-blocks")).toBe("ledger");
    expect(registerForPath("/data-blocks/")).toBe("data");
  });

  it("names the first register for /snapshots and no register for other views", () => {
    expect(modeForPath("/snapshots")).toBe("ledger");
    expect(registerForPath("/snapshots")).toBe("snapshots");
    expect(registerForPath("/geography")).toBeNull();
    expect(registerForPath("/nowhere")).toBeNull();
  });

  it("every register page round-trips through its path, and the first register has none of its own", () => {
    expect(REGISTER_PAGES.snapshots).toBeNull();
    expect(REGISTER_PAGE_LIST.map((p) => p.slug)).toEqual(["blocks", "data-blocks"]);
    for (const p of REGISTER_PAGE_LIST) {
      const r = registerForPath(`/${p.slug}`)!;
      expect(pathFor("ledger", r)).toBe(`/${p.slug}`);
      expect(p.desc.length).toBeGreaterThan(0);
    }
  });

  it("names the registers as the user did, and the view stays Snapshots", () => {
    expect(REGISTER_NAMES).toEqual({ snapshots: "Metagraph snapshots", blocks: "Transaction blocks", data: "Data blocks" });
    expect(BLOCKS_PAGE).toBe(REGISTER_PAGES.blocks);
    expect(titleNameFor("ledger", "snapshots")).toBe("Snapshots");
    expect(titleNameFor("ledger", "blocks")).toBe("Transaction blocks");
    expect(titleNameFor("ledger", "data")).toBe("Data blocks");
    expect(titleNameFor("geo", "data")).toBe("Geography");
  });
});
