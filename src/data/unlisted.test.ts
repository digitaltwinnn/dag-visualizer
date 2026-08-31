import { describe, expect, it } from "vitest";
import { METAGRAPHS } from "@/src/net/current";
import {
  LISTED_IDS,
  UNLISTED_CFG,
  UNLISTED_HUE,
  UNLISTED_ID,
  UNLISTED_LABEL,
  UNLISTED_SCENE_HEX,
  UNLISTED_SCENE_HEX_BY_THEME,
  displayNetwork,
  latestUnlistedTick,
  observedUnlistedIds,
  unlistedLog,
} from "@/src/data/unlisted";
import type { GlobalSnapshot, SnapshotExact } from "@/src/data/types";

// The unlisted pseudo-network's ONE HOME (CLAUDE.md, "The unlisted network"). Its sibling
// `components/unlistedBoundary.test.ts` pins that the `"unlisted"` id literal has exactly two
// homes — that is a SINGLE-HOME rule and says nothing about what this module DOES. This file is
// the behaviour half: the identity it publishes and the data it derives.

const g = (ordinal: number, timestamp: string): GlobalSnapshot =>
  ({ ordinal, timestamp, hash: `h${ordinal}` }) as GlobalSnapshot;

const exact = (
  ordinal: number,
  rows: { metaId: string; ordinal: number; fee: number; bytes: number }[],
  unlistedCount = rows.length,
): SnapshotExact =>
  ({ ordinal, rows, unlistedCount, perMeta: {} }) as unknown as SnapshotExact;

const LISTED = METAGRAPHS[0].id;

describe("the unlisted identity", () => {
  // ⚠️ The module's own comment is the rule: the HUD lane resolves a CSS var and the two
  // the one surface that CAN'T resolve one (the scene) carries "the same tone as a baked
  // number" (the HUD's last resolved-hex consumer, RailThread, now rides currentColor).
  it("states one tone across both lanes", () => {
    expect(UNLISTED_SCENE_HEX.toString(16).padStart(6, "0")).toMatch(/^[0-9a-f]{6}$/);
    expect(UNLISTED_HUE).toBe("var(--muted-foreground)");
  });

  it("ships a MetaCfg carrying that same identity, so the shared dossier renders it", () => {
    expect(UNLISTED_CFG.id).toBe(UNLISTED_ID);
    // The dossier renders the LABEL, never the id — they are re-exported from the same leaf and
    // spelled alike today, so this is what would catch a rename wiring itself to the wrong one.
    expect(UNLISTED_CFG.name).toBe(UNLISTED_LABEL);
    expect(UNLISTED_CFG.ticker).toBe(UNLISTED_LABEL);
    expect(UNLISTED_CFG.color).toBe(UNLISTED_SCENE_HEX);
    // The card builds the blurb from observed members, so the record must not carry one.
    expect(UNLISTED_CFG.blurb).toBe("");
  });

  it("is never itself listed", () => {
    expect(LISTED_IDS.has(UNLISTED_ID)).toBe(false);
    expect(LISTED_IDS.size).toBe(METAGRAPHS.length);
  });

  // The neutral scene tone is a pair, one per theme — `UNLISTED_SCENE_HEX` is the dark value
  // kept for every existing (theme-unaware) caller, and light is a genuinely distinct, darker
  // tone (a light-lane wash needs a darker neutral to stay visible on light glass).
  it("carries a dark/light pair, with the bare export equal to the dark value", () => {
    expect(UNLISTED_SCENE_HEX_BY_THEME.dark).toBe(UNLISTED_SCENE_HEX);
    expect(UNLISTED_SCENE_HEX_BY_THEME.light).not.toBe(UNLISTED_SCENE_HEX_BY_THEME.dark);
    expect(UNLISTED_SCENE_HEX_BY_THEME.light.toString(16).padStart(6, "0")).toMatch(/^[0-9a-f]{6}$/);
  });
});

describe("displayNetwork", () => {
  it("answers the unlisted set with the virtual pseudo-record", () => {
    const d = displayNetwork(UNLISTED_ID);
    expect(d).toEqual({ id: UNLISTED_ID, name: "unlisted", ticker: "unlisted", hue: UNLISTED_HUE, virtual: true });
  });

  it("answers a catalog metagraph with its own identity, not virtual", () => {
    const d = displayNetwork(LISTED);
    expect(d?.id).toBe(LISTED);
    expect(d?.virtual).toBe(false);
    // Theme-aware HUD dialect (identityHudCss): a live oklch() expression over the CSS
    // --ident-l/--ident-c tokens, not a baked hex — that's the dark-lane-only dialect this
    // surface must never use (see CLAUDE.md "Light/dark").
    expect(d?.hue).toMatch(/^oklch\(var\(--ident-l\) var\(--ident-c\) [\d.]+deg\)$/);
    expect(d?.ticker).toBeTruthy();
  });

  // "all"/"dag"/unknown are not networks this lookup can present — a null is what lets the call
  // sites fall through rather than inventing a record.
  it.each([null, undefined, "", "all", "0xnot-a-metagraph"])("answers %o with null", (id) => {
    expect(displayNetwork(id)).toBeNull();
  });

  // ONE NODE MODEL (CLAUDE.md): the DAG is a metagraph-shaped core and sits in the catalog like
  // any other, so it presents as a real network here. The module header used to say this
  // returned null for "dag"; the catalog says otherwise and the catalog is right.
  it("presents the DAG core as a catalog network, not as nothing", () => {
    expect(displayNetwork("dag")?.virtual).toBe(false);
  });
});

describe("unlistedLog", () => {
  it("keeps uncataloged channels and drops every listed one", () => {
    const rows = unlistedLog(
      [g(10, "2026-08-19T00:00:00Z")],
      { 10: exact(10, [
        { metaId: LISTED, ordinal: 1, fee: 5, bytes: 1024 },
        { metaId: "0xaaa", ordinal: 2, fee: 7, bytes: 2048 },
      ]) },
    );
    expect(rows.map((r) => r.metaId)).toEqual(["0xaaa"]);
    expect(rows[0].sizeInKB).toBe(2);
    expect(rows[0].global.ordinal).toBe(10);
  });

  it("orders newest first across ticks", () => {
    const rows = unlistedLog(
      [g(10, "2026-08-19T00:00:00Z"), g(11, "2026-08-19T00:00:28Z")],
      {
        10: exact(10, [{ metaId: "0xaaa", ordinal: 1, fee: 1, bytes: 0 }]),
        11: exact(11, [{ metaId: "0xbbb", ordinal: 2, fee: 1, bytes: 0 }]),
      },
    );
    expect(rows.map((r) => r.metaId)).toEqual(["0xbbb", "0xaaa"]);
  });

  // The exact reads are the ONLY honest source — a tick nobody read contributes no rows rather
  // than an inferred one (rule 10).
  it("contributes nothing for a tick with no exact read", () => {
    expect(unlistedLog([g(10, "2026-08-19T00:00:00Z")], {})).toEqual([]);
  });
});

describe("observedUnlistedIds", () => {
  it("dedups a channel that anchored repeatedly, newest first", () => {
    const ids = observedUnlistedIds(
      [g(10, "2026-08-19T00:00:00Z"), g(11, "2026-08-19T00:00:28Z")],
      {
        10: exact(10, [{ metaId: "0xaaa", ordinal: 1, fee: 1, bytes: 0 }]),
        11: exact(11, [
          { metaId: "0xbbb", ordinal: 3, fee: 1, bytes: 0 },
          { metaId: "0xaaa", ordinal: 2, fee: 1, bytes: 0 },
        ]),
      },
    );
    // Each id appears ONCE — each IS a distinct metagraph, just absent from the catalog.
    expect(ids).toEqual(["0xbbb", "0xaaa"]);
  });

  it("is empty when only listed channels anchored", () => {
    const ids = observedUnlistedIds(
      [g(10, "2026-08-19T00:00:00Z")],
      { 10: exact(10, [{ metaId: LISTED, ordinal: 1, fee: 1, bytes: 0 }]) },
    );
    expect(ids).toEqual([]);
  });
});

describe("latestUnlistedTick", () => {
  it("scans BACKWARDS to the newest tick the set actually anchored into", () => {
    const snaps = [g(10, "a"), g(11, "b"), g(12, "c")];
    const tick = latestUnlistedTick(snaps, {
      10: exact(10, [{ metaId: "0xaaa", ordinal: 1, fee: 1, bytes: 0 }], 1),
      11: exact(11, [], 2),
      12: exact(12, [], 0), // newest tick anchored nothing unlisted — not the answer
    });
    expect(tick?.ordinal).toBe(11);
  });

  it("answers null when no tick in the window carries an unlisted anchor", () => {
    expect(latestUnlistedTick([g(10, "a")], { 10: exact(10, [], 0) })).toBeNull();
    expect(latestUnlistedTick([g(10, "a")], {})).toBeNull();
  });
});
