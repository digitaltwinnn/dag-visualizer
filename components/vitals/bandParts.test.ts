import { describe, expect, it } from "vitest";
import { foldOther } from "./bandParts";
import { networkMark } from "@/components/explorer/nodeRow";
import { UNLISTED_HUE, UNLISTED_ID, UNLISTED_LABEL } from "@/src/data/unlisted";
import { identityHudCss } from "@/src/palette/identity";

// The band's share-of-whole fold and the network mark (refactor round R1, P4): one home each for
// what Geography's regions and the two block registers' BY NETWORK wrote three times.

describe("foldOther — top N + other", () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ key: `k${i}`, label: `k${i}`, count: i + 1 }));
  it("keeps a list at or under the cap whole", () => {
    expect(foldOther(rows(4), 4)).toEqual(rows(4));
    expect(foldOther([], 4)).toEqual([]);
  });
  it("past the cap keeps max − 1 rows and folds the rest into one muted row, so the rows still partition the whole", () => {
    const out = foldOther(rows(6), 4);
    expect(out.map((r) => r.key)).toEqual(["k0", "k1", "k2", "other"]);
    expect(out[3]).toEqual({ key: "other", label: "other", count: 4 + 5 + 6, hue: "var(--muted-foreground)" });
    expect(out.reduce((n, r) => n + r.count, 0)).toBe(rows(6).reduce((n, r) => n + r.count, 0));
  });
});

describe("networkMark — a network key's word and hue", () => {
  it("the unlisted set wears its label and its mandated neutral, every other key its ticker and identity hue", () => {
    expect(networkMark(UNLISTED_ID)).toEqual({ label: UNLISTED_LABEL, hue: UNLISTED_HUE });
    expect(networkMark("dag")).toEqual({ label: "DAG", hue: identityHudCss("dag") });
  });
});
