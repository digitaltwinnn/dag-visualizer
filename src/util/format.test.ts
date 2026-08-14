import { describe, expect, it } from "vitest";

import { fmtBytes, fmtKB, midHash } from "./format";

// The sub-KB boundary is the whole reason `fmtBytes` exists, so it is pinned here: the
// metagraph-snapshot card states an application state's size, and mainnet states routinely
// serialize to a few dozen bytes (DED's empty container is 39). Rendering those through `fmtKB`
// gave "0.0 KB" — a zero the card would be asserting about live data, next to a state proof
// proving the state is there. Don't fold this back into `fmtKB`.
describe("fmtBytes", () => {
  it("keeps a small but real size in bytes rather than rounding it to zero KB", () => {
    expect(fmtKB(39 / 1024)).toBe("0.0 KB"); // the reading that motivated the split
    expect(fmtBytes(39)).toBe("39 B");
    expect(fmtBytes(1)).toBe("1 B");
  });

  it("still says zero when there is genuinely nothing", () => {
    expect(fmtBytes(0)).toBe("0 B");
  });

  it("hands over to the shared KB/MB scale at one kilobyte", () => {
    expect(fmtBytes(1023)).toBe("1,023 B");
    expect(fmtBytes(1024)).toBe(fmtKB(1));
    expect(fmtBytes(1481)).toBe("1.4 KB");
  });
});

describe("midHash", () => {
  const h = "9f2113642ea532e6d86e8a86cb2f4a7e8d19c3b5a6d4e2f19b24a13d43f52ef01e";
  it("keeps head and tail within the budget", () => {
    const out = midHash(h, 27);
    expect(out.length).toBe(27);
    expect(out.startsWith("9f21136")).toBe(true);
    expect(out.endsWith("f52ef01e")).toBe(true);
    expect(out).toContain("…");
  });
  it("passes short values through untouched", () => {
    expect(midHash("abc", 27)).toBe("abc");
  });
  it("defaults to the raw pane's 46", () => {
    expect(midHash(h).length).toBe(46);
  });
});
