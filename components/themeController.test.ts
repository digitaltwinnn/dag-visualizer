import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// THE DEFAULT IS NOT A CHOICE (review 2026-10-30). Writing it back on mount made every first-time
// visitor look as if they had chosen dark, so a later change of default would reach no returning
// visitor and the `theme` event would report a pref nobody picked. Storage is the reader's gesture.
const src = readFileSync(join(process.cwd(), "components/ThemeController.tsx"), "utf8");

describe("ThemeController", () => {
  it("stores a pref only from the reader's own choice", () => {
    expect(src).toMatch(/export function applyThemePref\(pref: ThemePref, chosen = true\)/);
    expect(src).toMatch(/if \(chosen\) try \{ localStorage\.setItem\(THEME_KEY, pref\);/);
    expect(src).toMatch(/applyThemePref\(parseThemePref\(stored\), false\);/);
  });
  it("says in the event whether the pref was chosen", () => {
    expect(src).toMatch(/track\("theme", \{[^}]*chosen: stored != null/);
  });
});
