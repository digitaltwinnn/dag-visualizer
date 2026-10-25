import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// EVERY READ OF A FEED'S DATA HOLDS THE FEED (2026-10-25 — user: "show which ones are active in
// the view … consistent by code, not an assumption"). The pulse strip says, per feed, whether
// anything on screen reads it now; that is only true if every reader says so. `src/data/feedUse.ts`
// has the rule; this is the fence.
//
// A HUD file that reads one of the tokens below must call `useFeedRead([...feeds], who, on)` with
// every feed its tokens carry, inside the component that reads them. The trends hooks need no
// entry here: `useTrendsWindow` / `useTrendsRange` / `useTrendsSlice` REQUIRE a reader argument
// and hold the feed themselves, so the type checker is their fence.
//
// The map is the data's own lineage: the metagraph list comes from the directory; the node
// lists and leaderboard are the DAG's nodes placed with the geo map; the live snapshot and
// activity are the global feed; the anchor index is the metagraph snapshots; the exact-read
// fields are the snapshot reads.
const TOKENS: { re: RegExp; feeds: string[] }[] = [
  { re: /\bs\.(snapshotExact|metaSnapDeep|exactMiss)\b/, feeds: ["exact"] },
  { re: /\bs\.metaList\b/, feeds: ["api-metagraphs"] },
  { re: /\bs\.(selNodes|allNodes|leaderboard)\b/, feeds: ["clusters", "api-geo"] },
  { re: /\bs\.(latestSnapshot|activity)\b|\buseSnapshotFeed\(|\bgetNetwork\(/, feeds: ["global"] },
  { re: /\bgetAnchor\(|\bisAnchorSettling\(/, feeds: ["metasnaps"] },
];

// Files that read feed data but are PLUMBING, not a surface the reader sees — each with why.
const EXEMPT: Record<string, string> = {
  "components/useBootPhase.ts": "boot staging: asks whether data has ARRIVED, draws none of it",
  "components/useBootStage.ts": "boot staging: asks whether data has ARRIVED, draws none of it",
  "components/RawSnapshotBridge.tsx": "the snapshot-read FETCHER: it starts reads, the cards that show them hold",
  "components/FollowController.tsx": "the live/pinned follow switch: moves the pin, draws nothing",
  "components/useSnapshotFeed.ts": "the accessor itself: its callers hold (the token above)",
  "components/railSiblings.ts": "pure resolver over state its caller passes in; the caller holds",
  "components/useFeedRead.ts": "the hold hook",
};

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : walk(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Every feed id named in this file's `useFeedRead([...])` calls. */
const held = (src: string): Set<string> => {
  const out = new Set<string>();
  for (const m of src.matchAll(/useFeedRead\(\s*\[([^\]]*)\]/g)) for (const f of m[1]!.matchAll(/["']([a-z-]+)["']/g)) out.add(f[1]!);
  return out;
};

describe("feed-read boundary", () => {
  it("every HUD file that reads a feed's data holds that feed", () => {
    const missing: string[] = [];
    for (const file of walk("components")) {
      const rel = file.replace(/\\/g, "/");
      if (rel in EXEMPT) continue;
      const src = stripComments(readFileSync(file, "utf8"));
      const need = new Set(TOKENS.filter((t) => t.re.test(src)).flatMap((t) => t.feeds));
      if (!need.size) continue;
      const have = held(src);
      const lacks = [...need].filter((f) => !have.has(f));
      if (lacks.length) missing.push(`${rel} (${lacks.join(", ")})`);
    }
    expect(missing, `call useFeedRead([...], who, on) for the feeds this file reads — or exempt it with a reason:\n${missing.join("\n")}`).toEqual([]);
  });

  it("every exemption still names a file that exists and still reads feed data", () => {
    for (const rel of Object.keys(EXEMPT)) {
      const src = stripComments(readFileSync(rel, "utf8"));
      if (rel === "components/useFeedRead.ts") continue;
      expect(TOKENS.some((t) => t.re.test(src)), `${rel} no longer reads feed data — drop its exemption`).toBe(true);
    }
  });
});
