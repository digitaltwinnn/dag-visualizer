import { describe, it, expect } from "vitest";
import { storyCount, tickInStory } from "./ledgerStory";
import { METAGRAPHS } from "@/src/engine/config";
import type { Anchor, SnapshotExact } from "@/src/data/types";

const LISTED = METAGRAPHS[0].id;

const anchor = (counts: Record<string, number>): Anchor => ({
  fee: 0,
  count: Object.values(counts).reduce((a, b) => a + b, 0),
  metaIds: new Set(Object.keys(counts)),
  metaCounts: new Map(Object.entries(counts)),
  touched: 0,
});

const exact = (unlistedCount: number): SnapshotExact => ({ unlistedCount }) as SnapshotExact;

describe("the filter-is-a-story membership rule (one home)", () => {
  it("a listed metagraph answers from the polled anchor index", () => {
    expect(storyCount(LISTED, anchor({ [LISTED]: 3 }), undefined)).toBe(3);
    expect(storyCount(LISTED, anchor({ other: 2 }), undefined)).toBe(0);
    expect(storyCount(LISTED, null, undefined)).toBe(0);
  });

  it("the unlisted set answers from the exact read — the only honest source", () => {
    expect(storyCount("unlisted", anchor({ [LISTED]: 9 }), exact(2))).toBe(2);
    expect(storyCount("unlisted", null, exact(0))).toBe(0);
    expect(storyCount("unlisted", null, undefined)).toBe(0);
  });

  it('"all"/"dag"/unknown have no per-network story', () => {
    expect(storyCount("all", anchor({ [LISTED]: 3 }), exact(2))).toBeNull();
    expect(storyCount("dag", anchor({ [LISTED]: 3 }), undefined)).toBeNull();
    expect(storyCount("not-a-network", anchor({ [LISTED]: 3 }), undefined)).toBeNull();
  });

  it("tickInStory feeds the release rule: boolean membership, undefined = never release", () => {
    expect(tickInStory(LISTED, anchor({ [LISTED]: 1 }), undefined)).toBe(true);
    expect(tickInStory(LISTED, anchor({ other: 1 }), undefined)).toBe(false);
    expect(tickInStory("unlisted", null, exact(1))).toBe(true);
    expect(tickInStory("unlisted", null, exact(0))).toBe(false);
    expect(tickInStory("all", anchor({ [LISTED]: 1 }), undefined)).toBeUndefined();
  });
});
