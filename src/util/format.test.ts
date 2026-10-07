import { describe, expect, it } from "vitest";

import { compactDag, compactNumber, fmtDagShort, fmtBytes, fmtKB, midHash, fmtShareKB } from "./format";

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

describe("fmtShareKB", () => {
  it("says the unit once when both halves share it", () => {
    expect(fmtShareKB(56.0, 64.8)).toBe("56 of 65 KB");
    expect(fmtShareKB(2.9, 5.9)).toBe("2.9 of 5.9 KB");
    expect(fmtShareKB(1536, 4096)).toBe("1.5 of 4.0 MB");
  });

  it("keeps both units where they differ — a bare number against another unit would mislead", () => {
    expect(fmtShareKB(900, 1228.8)).toBe("900 KB of 1.2 MB");
  });
});

// HISTORY'S READINGS ARE MAGNITUDES (user, 2026-10-07: "very large and precise; like 43.517 or
// 26.961; can we shorten and simplify these numbers; like 43.5k"). One decimal below 100 of a unit,
// none above; the suffix is always K / M / B whatever the locale (the browser's own compact form
// leaves German thousands unabbreviated), the decimal mark the reader's own.
describe("compactNumber — a magnitude, shortened", () => {
  const n = (v: number) => compactNumber(v).replace(",", "."); // locale-neutral for the assertions
  it("leaves numbers under a thousand as they are, rounded", () => {
    expect(n(0)).toBe("0");
    expect(n(7)).toBe("7");
    expect(n(999.4)).toBe("999");
  });
  it("shortens thousands, millions and billions", () => {
    expect(n(43_517)).toBe("43.5K");
    expect(n(26_961)).toBe("27K");
    expect(n(1_000)).toBe("1K");
    expect(n(435_200)).toBe("435K");
    expect(n(4_749_065)).toBe("4.7M");
    expect(n(38_525_277)).toBe("38.5M");
    expect(n(2_100_000_000)).toBe("2.1B");
  });
  it("rolls over at the boundary instead of printing 1000K", () => {
    expect(n(999_960)).toBe("1M");
  });
});

// A FEE, SHORTENED (user, 2026-10-07: "fees: instead of 0.0480 we could say 0.05"). Two decimals at
// most — but a fee under a cent of a DAG keeps ONE significant digit, or 0.003 would print "0.00"
// and read as free (rule 10: a real value is never shown as nothing).
describe("compactDag — a DAG amount, shortened", () => {
  const n = (v: number) => compactDag(v).replace(",", ".");
  it("two decimals at most from a hundredth up", () => {
    expect(n(0.048)).toBe("0.05");
    expect(n(0.011)).toBe("0.01");
    expect(n(1.5)).toBe("1.5");
    expect(n(0.145)).toBe("0.15");
  });
  it("one significant digit below a hundredth — never 0.00 for a real fee", () => {
    expect(n(0.003)).toBe("0.003");
    expect(n(0.0045)).toBe("0.005");
    expect(n(0)).toBe("0");
  });
  it("whole numbers from 10, magnitudes from a thousand", () => {
    expect(n(12.34)).toBe("12");
    expect(n(4_321)).toBe("4.3K");
  });
  it("fmtDagShort reads datums", () => {
    expect(fmtDagShort(4_800_000).replace(",", ".")).toBe("0.05"); // 0.048 DAG
  });
});
