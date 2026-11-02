import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// PINNED IS AN ICON (user, 2026-10-31: "instead of 'pinned' + icon just use the icon everywhere
// without the text"). The word stays for assistive tech only, in `PinnedMark`, its one home, so no
// surface can show it. The icon has no hover text either (`tooltipBoundary`).
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx$/.test(n) ? [p] : [];
  });

describe("the pinned state", () => {
  it("never shows the word: no surface writes it as text", () => {
    const offenders = walk("components").filter((f) => /\? "live" : "pinned"|\? "pinned" : "live"|text: "pinned"/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
  it("keeps the word for screen readers in one home", () => {
    const atoms = readFileSync("components/state/StateAtoms.tsx", "utf8");
    expect(atoms).toMatch(/export function PinnedMark\([^]*?<PinMark[^]*?<span className="sr-only">pinned<\/span>/);
  });
});
