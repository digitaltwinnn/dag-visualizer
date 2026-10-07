import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// THE HISTORY RAILS' THREE "ONE HOME" CONTRACTS, made executable (2026-09-19 — the boundary-test
// idiom). All three fail SILENTLY: tsc stays green, vitest stays green, and the symptom is a rail
// row naming a plane that is not in the stack, two surfaces landing a reader in different places
// from the same words, or a number in the rail that no chart on screen agrees with.
//
//  1. ONE CLICK BUILDER. Three surfaces focus a plane — the plane's own header strip, the Layers
//     row, the cursor card's per-network row — and all three express that intent through
//     `trendPlaneActions` and the one executor (rule 2). A fourth surface writing the channel
//     directly is separately caught by `selectionBoundary.test.ts`; what this adds is the positive
//     half, that the three known ones still go through the table.
//
//  2. ONE RECORDS DOOR. The step one rung down the observation ladder is a SEQUENCE — hand the
//     network and span to the log, switch the view, open the raw layer — and it is written once, in
//     `components/trendDoors.ts`. It NEVER writes the app filter (user, 2026-10-04): the log scopes
//     itself to the network it is handed. The Trends document carried it inline
//     until the cursor card needed the same door; two copies of four ordered steps is how two
//     surfaces quietly start landing a reader in different places.
//
//  3. ONE ROSTER PASS. Which networks, in what order, with what measured is `useTrendRoster`'s
//     answer. A surface computing its own would be a second opinion about the very ranking the
//     planes are laid out by — and it would silently skip the counter edge trim, which is exactly
//     the off-by-one that put yesterday's number in the cursor card (fixed 2026-09-19).
//
// EXEMPTIONS: stated inline with each rule, as named file lists.

const ROOTS = ["app", "components", "src"];

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : walk(p);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const posix = (p: string) => p.replace(/\\/g, "/");
const sources = () => ROOTS.flatMap(walk).map((p) => ({ path: posix(p), code: stripComments(readFileSync(p, "utf8")) }));

describe("one click builder for a plane focus", () => {
  it("every surface that focuses a plane applies trendPlaneActions", () => {
    const callers = sources()
      .filter(({ path, code }) => path !== "src/engine/domain/pickActions.ts" && /trendPlaneActions\s*\(/.test(code))
      .map((s) => s.path)
      .sort();
    expect(callers).toEqual([
      "components/TrendExplore.tsx", // the Layers row
      "components/TrendStack.tsx", // the plane's header strip and its interactive body
      "components/inspector/TrendInstantPane.tsx", // the cursor card's per-network row
    ]);
  });

  it("each of them applies it through the ONE executor", () => {
    for (const path of ["components/TrendExplore.tsx", "components/TrendStack.tsx", "components/inspector/TrendInstantPane.tsx"]) {
      const code = stripComments(readFileSync(path, "utf8"));
      expect(code, `${path} must apply the builder's actions, not read them`).toMatch(
        /applyClickActions\(\s*trendPlaneActions/,
      );
    }
  });
});

describe("one door to the records", () => {
  it("the log handoff is written in exactly one place", () => {
    // `AnchorLogTable` is the CONSUMER: it reads the bridge and clears it on sight, which is the
    // other end of the same one-shot channel and not a second door.
    const writers = sources()
      .filter(({ path }) => path !== "src/store/store.ts" && path !== "components/datasection/AnchorLogTable.tsx")
      .filter(({ code }) => /setLogSeek\s*\(/.test(code))
      .map((s) => s.path)
      .sort();
    expect(writers).toEqual(["components/trendDoors.ts"]);
  });

  it("both exits to the records — the Moment card and History's RAW — reach it through that home", () => {
    for (const path of ["components/topbar/PresentationToggle.tsx", "components/inspector/TrendInstantPane.tsx"]) {
      const code = stripComments(readFileSync(path, "utf8"));
      expect(code, `${path} must call the shared door`).toMatch(/openRecords\s*\(/);
      expect(code, `${path} must import it from components/trendDoors`).toMatch(/from\s+["']@\/components\/trendDoors["']/);
    }
  });

  it("the door never writes the app filter — it hands the network to the log", () => {
    // User, 2026-10-04: going from the Moment card to the raw records "sets the global filter, that
    // should not happen; only set the filter in the raw list / search section". The log scopes
    // itself (AnchorLogTable's `searchMeta`); the top bar keeps the lens the reader chose.
    const code = stripComments(readFileSync("components/trendDoors.ts", "utf8"));
    expect(code).not.toMatch(/filterToggleActions|setFilter\s*\(/);
    expect(code).toMatch(/setLogSeek\(\{\s*metaId/);
  });
});

describe("one roster pass", () => {
  it("only the roster hook ranks the networks or reads their series", () => {
    const offenders = sources()
      .filter(({ path }) => path.startsWith("app/") || path.startsWith("components/"))
      .filter(({ path }) => path !== "components/useTrendRoster.ts")
      .filter(({ code }) => /\b(rankByLast|metricSeries)\s*\(/.test(code))
      .map((s) => s.path)
      .sort();
    expect(offenders, "compute the roster once, in useTrendRoster").toEqual([]);
    // …and the rule is LIVE: the hook really does the pass.
    expect(/\bmetricSeries\s*\(|\brankByLast\s*\(/.test(stripComments(readFileSync("components/useTrendRoster.ts", "utf8")))).toBe(true);
  });

  it("no surface writes the RANKING out by hand", () => {
    // ⚠️ THE NAME IS NOT THE RULE (2026-09-19). The check above forbids `rankByLast` outside the
    // hook and exempts the document — so it could not see the document writing that function's
    // COMPARATOR out inline, three times, which it was: `(b.last ?? -1) - (a.last ?? -1)`. The
    // exemption is about which SURFACE composes a roster, never about re-deriving what
    // "busiest first" means; two spellings of one ranking is how the registers of this rung start
    // ordering the same networks differently. So the rule is stated as the shape, with no
    // exemption at all: there is exactly one ranking function.
    const LAST_COMPARATOR = /\?\?\s*-1\s*\)\s*-\s*\(|\.sort\([^;]{0,200}?lastMeasured\s*\(/;
    const offenders = sources()
      .filter(({ path }) => path.startsWith("components/"))
      .filter(({ code }) => LAST_COMPARATOR.test(code))
      .map((s) => s.path)
      .sort();
    expect(offenders, "rank with `rankByLast`, never with an inline last-value comparator").toEqual([]);
    // …and the rule is LIVE: the pattern really does match the shape it forbids.
    expect(LAST_COMPARATOR.test("xs.sort((a, b) => (b.last ?? -1) - (a.last ?? -1))")).toBe(true);
    expect(LAST_COMPARATOR.test("xs.sort((a, b) => lastMeasured(b.pts)! - lastMeasured(a.pts)!)")).toBe(true);
  });

  it("the hook is what the stack and both rails read", () => {
    for (const path of ["components/TrendStack.tsx", "components/TrendExplore.tsx", "components/inspector/TrendInstantPane.tsx"]) {
      const code = stripComments(readFileSync(path, "utf8"));
      expect(code, `${path} must read the shared roster pass`).toMatch(
        /import\s+useTrendRoster.*from\s+["']@\/components\/useTrendRoster["']/,
      );
    }
  });

  it("no rail re-derives the scope sentences", () => {
    // One home for what a `dag`/unlisted commit says, or the stack and the rails start explaining
    // the same commit two different ways (`src/data/trendScope.ts`).
    const offenders = sources()
      .filter(({ path }) => path !== "src/data/trendScope.ts")
      .filter(({ code }) => /base ledger anchors metagraph snapshots|kept per listed metagraph/.test(code))
      .map((s) => s.path);
    expect(offenders, "the scope copy lives in src/data/trendScope.ts").toEqual([]);
  });
});
