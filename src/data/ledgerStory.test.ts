import { describe, it, expect } from "vitest";
import { ledgerLens, storyCount, tickInStory, tickLocked, STORY_SETTLE_MS } from "./ledgerStory";
import { METAGRAPHS } from "@/src/net/current";
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

  it("never releases on a LAGGING count: a listed zero inside the settling window is unknown", () => {
    const a = anchor({ other: 1 }); // touched: 0
    // Inside the window (now just after the anchor last grew) → no verdict.
    expect(tickInStory(LISTED, a, undefined, STORY_SETTLE_MS - 1)).toBeUndefined();
    // Past the window the zero is real.
    expect(tickInStory(LISTED, a, undefined, STORY_SETTLE_MS + 1)).toBe(false);
  });

  it("an unlisted question with NO exact read reads its POLLED count, like a listed network", () => {
    expect(tickInStory("unlisted", anchor({ unlisted: 2 }), undefined)).toBe(true);
    expect(tickInStory("unlisted", null, undefined)).toBe(false);
    // a polled zero inside the settling window is unknown; once the exact read lands it is final
    expect(tickInStory("unlisted", { ...anchor({ other: 1 }), touched: 1000 }, undefined, 2000)).toBeUndefined();
    expect(tickInStory("unlisted", { ...anchor({ other: 1 }), touched: 1000 }, exact(0), 2000)).toBe(false);
  });
  it("the exact read wins over the polled unlisted count", () => {
    expect(storyCount("unlisted", anchor({ unlisted: 2 }), exact(5))).toBe(5);
  });
});

describe("ledgerLens (the ledger's own reading of the filter)", () => {
  it("committed DAG reads as the whole chamber; everything else passes through", () => {
    // Every global tick IS a DAG snapshot — the base ledger has no lane to isolate, so the
    // ledger surfaces treat DAG as "all" (user, 2026-08-13). The commit still means the DAG
    // dossier + the node model's own on-filter answer; only the snapshot emphasis maps.
    expect(ledgerLens("dag")).toBe("all");
    expect(ledgerLens("all")).toBe("all");
    expect(ledgerLens("unlisted")).toBe("unlisted");
    expect(ledgerLens("DAG0CyySf35ftDQDQBnd1bdQ9aPyUdacMghpnCuM")).toBe("DAG0CyySf35ftDQDQBnd1bdQ9aPyUdacMghpnCuM");
  });
});

const read = (perMeta: Record<string, number>, unlistedCount = 0): SnapshotExact =>
  ({ unlistedCount, perMeta: Object.fromEntries(Object.entries(perMeta).map(([k, count]) => [k, { count, fee: 0, bytes: 0 }])) }) as SnapshotExact;

describe("a tick's exact read outranks the polled count", () => {
  const FORMER = METAGRAPHS.find((m) => m.formerIds?.length)!;

  it("counts a listed network from the read, where the polled buffer has rolled past it", () => {
    expect(storyCount(LISTED, null, read({ [LISTED]: 4 }))).toBe(4);
    expect(storyCount(LISTED, anchor({ [LISTED]: 9 }), read({}))).toBe(0);
  });
  it("counts a network's former addresses as the network", () => {
    expect(storyCount(FORMER.id, null, read({ [FORMER.formerIds![0]]: 2, [FORMER.id]: 1 }))).toBe(3);
  });
  it("says no at once from a read: a read has nothing left to settle", () => {
    expect(tickInStory(LISTED, anchor({}), read({}), 0)).toBe(false);
  });
});

describe("tickLocked: only a read can say a tick does not hold the filter", () => {
  it("locks a tick whose read proves the network absent", () => {
    expect(tickLocked(LISTED, read({ other: 3 }))).toBe(true);
    expect(tickLocked("unlisted", read({ [LISTED]: 3 }, 0))).toBe(true);
  });
  it("never locks a tick that holds it", () => {
    expect(tickLocked(LISTED, read({ [LISTED]: 1 }))).toBe(false);
    expect(tickLocked("unlisted", read({}, 2))).toBe(false);
  });
  it("never locks without a read: no read is not knowing, not none", () => {
    expect(tickLocked(LISTED, undefined)).toBe(false);
  });
  it("never locks with no story to hold: All, and the DAG that every tick is", () => {
    expect(tickLocked("all", read({}))).toBe(false);
    expect(tickLocked("dag", read({}))).toBe(false);
  });
});
