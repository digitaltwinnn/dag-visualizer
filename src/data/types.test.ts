import { describe, it, expect } from "vitest";
import { metaSnapDeepKey, metaSnapHoverKey } from "./types";

// The two keys the store's snapshot channels are addressed by. `types.ts` is otherwise pure type
// declarations; these are its only value exports, and both encode a DISTINCTION that a bug already
// erased once — see rule 9 in CLAUDE.md, "a surface hovers the subject it would COMMIT".
describe("metaSnapDeepKey", () => {
  it("carries the snapshot's OWN ordinal, so one tick's batch is many decodes", () => {
    // A fast metagraph batches dozens of snapshots into one tick (DOR routinely 9-plus). Keyed by
    // (tick, address) alone they all shared one ~2.5 MB decode.
    expect(metaSnapDeepKey(100, "dor", 7)).not.toBe(metaSnapDeepKey(100, "dor", 8));
  });

  it("separates the same snapshot ordinal across metagraphs and across ticks", () => {
    expect(metaSnapDeepKey(100, "dor", 7)).not.toBe(metaSnapDeepKey(100, "ded", 7));
    expect(metaSnapDeepKey(100, "dor", 7)).not.toBe(metaSnapDeepKey(101, "dor", 7));
  });

  it("is stable for the same triple", () => {
    expect(metaSnapDeepKey(100, "dor", 7)).toBe(metaSnapDeepKey(100, "dor", 7));
  });
});

describe("metaSnapHoverKey", () => {
  it("identifies one snapshot, NOT its tick", () => {
    // The bug this shape exists to prevent: hovering a row wrote the tick channel, so every band
    // of the anchoring global lit up. A row is a snapshot, not its tick.
    expect(metaSnapHoverKey("dor", 7)).not.toBe(metaSnapHoverKey("dor", 8));
    expect(metaSnapHoverKey("dor", 7)).not.toBe(metaSnapHoverKey("ded", 7));
  });

  it("is deliberately NOT the deep key — hover is per snapshot, not per decode", () => {
    // Two ticks cannot both anchor the same (metagraph, ordinal), so the tick carries no
    // information here; including it would make the scene tile and the explorer row disagree
    // whenever one of them knew the tick and the other didn't.
    expect(metaSnapHoverKey("dor", 7)).toBe(metaSnapHoverKey("dor", 7));
    expect(metaSnapHoverKey("dor", 7)).not.toBe(metaSnapDeepKey(100, "dor", 7));
  });
});
