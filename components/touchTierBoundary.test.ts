import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { TOUCH_QUERIES } from "@/components/useTouch";

// THE TOUCH TIER HAS ONE QUERY (2026-10-09). The 44px floors and the thumb hit areas ride the
// `touch:` variant in `app/globals.css`; the copy ("Tap" / "Click") and the rail's touch rules read
// `useTouch`. Both must name the SAME media query, or a device gets touch-sized rows under
// mouse-worded copy — the drift this test closes. The query itself is the hook's export; the
// stylesheet is read as text because CSS cannot import it.
//
// Why a tier is in the query at all: Tailwind's own `pointer-coarse:` keys on the pointer alone,
// and a touch laptop's DESKTOP rail grew 44px rows (user: "look like mobile controls on normal
// view"). The desktop tier is a mouse layout; the floor belongs to the phone and tablet tiers.
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : walk(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("touch tier boundary", () => {
  const css = readFileSync("app/globals.css", "utf8");

  it("the stylesheet's `touch:` variant nests the hook's two queries, verbatim and in order", () => {
    // Nested blocks, one per query (the shorthand `@custom-variant touch (@media …)` compiled to
    // nothing under Tailwind 4.3); the hook reads the same two strings, so neither can drift.
    const [pointer, tier] = TOUCH_QUERIES;
    expect(css).toContain(`@custom-variant touch {
  @media ${pointer} {
    @media ${tier} {
      @slot;
    }
  }
}`);
  });

  it("the queries gate on the pointer and on the tier, at breakpointOf's own 1100 arm", () => {
    expect(TOUCH_QUERIES).toEqual(["(pointer: coarse)", "not all and (min-width: 1100px)"]);
  });

  it("no utility rides Tailwind's pointer-only variant any more", () => {
    // The variant that keyed on the pointer alone — a second floor would reopen the drift.
    const offenders = ["components", "app", "src", "lib"]
      .flatMap(walk)
      .filter((p) => /pointer-coarse:/.test(stripComments(readFileSync(p, "utf8"))));
    expect(offenders).toEqual([]);
  });
});
