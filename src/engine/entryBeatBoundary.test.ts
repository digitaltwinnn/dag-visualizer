import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The SUBJECT-ARRIVAL beat's wiring contract (2026-08-16). This exists because the wiring was
// silently LOST once: an edit that "moved" the ledger's beginEntry call anchored on a parameter
// name that didn't exist — the removal succeeded, the insertion no-oped, every test stayed
// green, and the effect ran nowhere until the user noticed (see CLAUDE.md's transition section).
// A text-scan is the house method for Engine wiring (sceneViewContract.test.ts) — it can't prove
// the beat LOOKS right, but it makes a vanished call site a red test instead of a user report.
const HERE = __dirname;
const read = (p: string) => readFileSync(join(HERE, p), "utf8");

describe("subject-arrival beat wiring", () => {
  it("every 3D view's entry owner defines the begin/release pair", () => {
    for (const f of ["scene/views/LedgerView.ts", "scene/views/HyperView.ts", "scene/Globe.ts"]) {
      const src = read(f);
      expect(src.includes("beginEntry("), `${f} lost beginEntry — the arrival beat has no arm`).toBe(true);
      expect(src.includes("releaseEntry("), `${f} lost releaseEntry — the arrival beat can never play`).toBe(true);
    }
  });

  it("the Engine arms at the destination layout AND releases at the completion edge", () => {
    const src = read("Engine.ts");
    // Both consumers of the per-view entry owner must exist: the arm (with its immediate
    // release for transition-less arrivals) and the completion-edge release.
    const armed = /entryView\.beginEntry\(\)/.test(src);
    const releasedImmediate = /entryView\.releaseEntry\(\)/.test(src);
    const releasedAtEdge = /_entryViewFor\(this\.mode\)\?\.releaseEntry\(\)/.test(src);
    expect(armed, "Engine no longer arms the arrival beat at the destination layout").toBe(true);
    expect(releasedImmediate, "Engine lost the transition-less immediate release").toBe(true);
    expect(releasedAtEdge, "Engine lost the completion-edge release — beats would hold forever").toBe(true);
  });
});
