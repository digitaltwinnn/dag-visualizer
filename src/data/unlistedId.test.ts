import { describe, it, expect } from "vitest";
import { UNLISTED_ID, UNLISTED_LABEL, UNLISTED_HUE } from "./unlistedId";

// The leaf's whole job is to hold three literals that other modules can name without closing an
// import cycle (src/data/noImportCycles.test.ts). So what is worth pinning is not the strings for
// their own sake but the three properties other code actually leans on.

describe("the unlisted identity leaf", () => {
  it("UNLISTED_ID is the exact literal the one-home boundary is written against", () => {
    // components/unlistedBoundary.test.ts greps for this spelling and names this file as a home;
    // src/engine/domain/ledgerBands.ts carries the domain twin UNLISTED_KEY. Change it here and
    // both must move in the same commit, plus every persisted filter value.
    expect(UNLISTED_ID).toBe("unlisted");
  });

  it("the LABEL is a separate concern from the ID, even while they match", () => {
    // They are spelled alike today, and that coincidence is what previously hid the asymmetry:
    // the label is free to change, the id is not. Both exist so a rename can touch only one.
    expect(UNLISTED_LABEL).toBe("unlisted");
    expect(typeof UNLISTED_LABEL).toBe("string");
  });

  it("the hue stays a TOKEN, never a raw colour", () => {
    // Rule 3 — one colour source. The unlisted set is neutral gray in both lanes, and the HUD lane
    // gets there through the muted-foreground CSS var; a hex here would be a second source and
    // would not follow a theme flip. (The scene lane's baked number lives elsewhere by necessity,
    // since the scene cannot resolve CSS vars.)
    expect(UNLISTED_HUE).toMatch(/^var\(--[a-z-]+\)$/);
    expect(UNLISTED_HUE).not.toMatch(/#[0-9a-f]{3,8}/i);
  });
});
