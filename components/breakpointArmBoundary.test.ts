import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// CSS trap 8, made executable (2026-08-19). Tailwind v4 compiles `max-[N]` to
// `@media not (min-width: N)`, so it stops applying AT N, not after it. A tier boundary therefore
// has to name the SAME number on both arms; pairing `max-[N-1]` with `min-[N]` opens a one-pixel
// hole rather than closing one — and the hole is invisible to every gate the repo has, because
// both arms are individually well-formed and nothing renders at exactly that width in a test.
//
// It had opened. The phone tier was written `max-[699px]` (41 literals) against RailDock's single
// `min-[700px]` arm, so at exactly 699px the phone dock was hidden AND the tablet edge tabs were
// off: no rail control of any kind, neither rail openable. Measured in the browser before the fix
// (dock `none/0x0`, tabs absent), and again after (dock `flex/350x56`).
//
// THE RULE: an arm that names a tier boundary names the number `breakpointOf` reads — 700 or 1100
// — never one less. Both directions of the phone boundary are pinned below; 1099 carries ONE
// documented exemption.
//
// THE 1099 EXEMPTION. `max-[1099px]:!hidden` (the desktop rails' safety net) and RailDock's
// `min-[700px]:max-[1099px]:flex` (the tablet tabs) both stop at w<1099, so at exactly 1099px the
// tablet tabs are off — and unlike the phone case, something fills in: the same width is where the
// rails' own net stops hiding them, so the desktop rails render inline. Nothing goes missing and
// nothing double-renders; CLAUDE.md already records it as "the desktop rails simply arrive one
// pixel early". It is the older form, kept because it is provably harmless HERE — the exemption is
// for these existing literals, not a licence to write a new `N-1` arm. New boundaries pair the
// same number on both sides.
const ROOTS = ["app", "components", "src"];

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : walk(p);
    return /\.(ts|tsx|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });

const sources = () => ROOTS.flatMap(walk).map((path) => ({ path, src: readFileSync(path, "utf8") }));

describe("responsive tier arms name the boundary itself", () => {
  it("nothing names 699 — the phone boundary is 700 on both arms", () => {
    // Any 699 at all: a Tailwind arm, a media query, or a matchMedia string. The number has no
    // other meaning in this codebase, so a bare match is the honest test.
    const offenders = sources()
      .filter(({ src }) => /\b699(\.\d+)?px\b/.test(src))
      .map((f) => f.path);
    expect(offenders, `use 700 (breakpointOf's own phone boundary): ${offenders.join(", ")}`).toEqual([]);
  });

  it("both arms of the phone boundary are actually written somewhere", () => {
    // A vacuous pass would be the failure mode of the rule above once someone deletes an arm, so
    // assert the pairing exists: something hides below 700 and something appears at 700.
    const all = sources();
    expect(all.some(({ src }) => src.includes("max-[700px]"))).toBe(true);
    expect(all.some(({ src }) => src.includes("min-[700px]"))).toBe(true);
  });

  it("the footer band's media query matches the Tailwind arm it mirrors", () => {
    // globals.css zeroes --footer-h for the phone; SiteFooter RE-ANCHORS itself there with
    // `max-[700px]` arms (above the dock, explicit height — user 2026-08-31: the footer stays
    // visible on phone as overlay chrome, since it is the app's one /about route). Two homes
    // for one boundary, so they are pinned together — this is the pair that was off by one and
    // left --footer-h reserving 26px the layout wasn't using. The component arm must name the
    // SAME 700 the media query does, and its phone height must NOT ride the zeroed token: it
    // rides `--footer-phone-h`, the dedicated phone-height token (2026-09-02 — it was a px
    // literal until the raw data layer needed the same number for its bottom inset, the one
    // surface the floating row genuinely collides with). Both consumers are pinned here so the
    // row and the pane's clearance can never disagree.
    const css = readFileSync(join("app", "globals.css"), "utf8");
    expect(css).toMatch(/@media not \(min-width: 700px\) \{\s*:root \{ --footer-h: 0px; \}/);
    expect(css).toMatch(/--footer-phone-h: \d+px/);
    const foot = readFileSync(join("components", "SiteFooter.tsx"), "utf8");
    expect(foot).toContain("max-[700px]:bottom-[var(--phone-dock-h)]");
    expect(foot).toContain("max-[700px]:h-[var(--footer-phone-h)]");
    const shell = readFileSync(join("components", "SectionShell.tsx"), "utf8");
    expect(shell).toContain("var(--footer-phone-h,22px)");
  });
});
