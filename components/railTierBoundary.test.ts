import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// THE FACTS RAIL'S TWO MARKERS, made executable (2026-08-09 — the unlistedBoundary idiom).
// The slab and the thread read DIFFERENT things and the difference is the design:
//
//   · `data-tier` (`ghost` | `entry` | `box`) is the SLAB's one discriminator — members, seams,
//     squared interior corners, the box's raise/lift. It says what a rung IS.
//   · `data-focus` marks the FINEST COMMITTED rung, and is the THREAD's read alone (dot halo).
//
// They are not interchangeable: single-open lets the box be ANY committed rung, so the focus rung
// is regularly an entry mid-pile. Keying geometry on `[data-focus]` was a real bug the user
// reported as "a gap at the bottom to the node card" — both joints around a manually-expanded
// coarser rung matched no member arm and fell back to the plain gap. The same mistake would shut
// the pager out of the two SNAPSHOT slots, which ride the lane with no focus rung at all.
//
// So `data-focus` gets exactly two homes, and anything GEOMETRIC keys on the tier:
//
//   · components/Inspector.tsx  — the WRITE (one wrapper div carries both markers)
//   · components/RailThread.tsx — the READ (dot state)
//
// Comments may name it; CODE may not carry the literal elsewhere. globals.css is swept too: its
// live selectors must key on `data-tier`, the marker whose value the render itself derives.
const ROOTS = ["components", "src", "app"];
const FOCUS_HOMES = new Set(["components/Inspector.tsx", "components/RailThread.tsx"]);

const walk = (dir: string, exts: RegExp): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : walk(p, exts);
    return exts.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const posix = (p: string) => p.replace(/\\/g, "/");

describe("rail tier boundary — data-focus has two homes, geometry keys on data-tier", () => {
  it("the data-focus marker is written and read in exactly those two files", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root, /\.(ts|tsx)$/)) {
        if (FOCUS_HOMES.has(posix(file))) continue;
        if (stripComments(readFileSync(file, "utf8")).includes("data-focus")) offenders.push(posix(file));
      }
    }
    expect(
      offenders,
      `read \`data-tier\` for presentation, or the store's focus level for state: ${offenders.join(", ")}`
    ).toEqual([]);

    // Both homes still carry it — a test that only forbids would pass once the marker vanished.
    const write = readFileSync("components/Inspector.tsx", "utf8");
    const read = readFileSync("components/RailThread.tsx", "utf8");
    expect(stripComments(write)).toMatch(/data-focus=/);
    expect(stripComments(read)).toMatch(/data-focus/);
  });

  it("no CSS rule keys off data-focus — the slab's discriminator is data-tier", () => {
    const css = readFileSync("app/globals.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css, "the slab keys on data-tier; a [data-focus] selector re-opens the mid-pile-box bug").not.toMatch(
      /\[data-focus/
    );
    expect(css).toMatch(/\[data-tier/);
  });
});

// The pager's gate is the BOX TIER and nothing else. An absolutely-positioned `‹ n / N ›` plank
// over a ~28px collapsed entry is a defect, and single-open already makes the box unique — so the
// gate is the same `boxed` the tier marker is derived from, never the focus rung.
describe("rail pager boundary — the plank rides the boxed tier", () => {
  const inspector = stripComments(readFileSync("components/Inspector.tsx", "utf8"));

  it("RailPager is rendered from one place only", () => {
    const users = ROOTS.flatMap((root) => walk(root, /\.(ts|tsx)$/))
      .map(posix)
      .filter((f) => f !== "components/RailPager.tsx")
      .filter((f) => stripComments(readFileSync(f, "utf8")).includes("RailPager"));
    expect(users, "the sibling pager belongs to the ladder lane's one render").toEqual(["components/Inspector.tsx"]);
  });

  it("its gate and the tier marker are the same condition", () => {
    // `const boxed = ...` feeds BOTH the `data-tier` value and the pager wrap, so a card can never
    // be a `box` to the CSS and un-pagered to the pager (or the reverse).
    const gate = inspector.match(/^.*<RailPager.*$/m)?.[0];
    expect(gate, "RailPager is no longer rendered in Inspector.tsx").toBeTruthy();
    expect(gate!, "gate the pager on `boxed` — the tier's own condition").toMatch(/\bboxed\s*\?/);
    expect(gate!, "the pager must NOT key on the focus rung: single-open lets the box be any rung").not.toMatch(
      /focus/i
    );
    expect(inspector, "`tier` must derive from the same `boxed`").toMatch(/const tier\s*=[^;]*\bboxed\b/);
  });
});
