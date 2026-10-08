// THE UI EXPLAINS ITSELF — THERE IS NO HOVER-ONLY TEXT (user, 2026-10-08: "I think people hardly
// look at tooltips and UI/UX should be self explanatory; what about dropping tooltips entirely so
// that we enforce proper UI/UX instead of working around issues by adding tooltips nobody will
// actually look at?"). The audit that day found 116 hover texts: a fifth repeated what was already
// on screen, a fifth named icon controls (an `aria-label` does that for assistive tech), a fifth
// spelled out a shortened value (copy controls and the record pages carry the full one), and half
// explained something — which either belongs ON the surface or nowhere. They went, with the
// styled-bubble layer that drew them (HintTips) and its touch bug (a tapped control's hint stuck
// on screen on phones).
//
// So: no `title=` attribute on any element in the HUD. A `title` PROP on the four components
// whose `title` is their VISIBLE heading is not a tooltip and stays (allow-list below).
// Not covered, deliberately: the engine-anchored scene label (`components/Tooltip.tsx` — it names
// the 3D object under the pointer, the scene↔HUD hover pairing of convention 9, not a hint) and a
// chart's hover readout (data, not an explanation).
//
// If a control seems to need a hover to be understood, change the control.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Components whose `title` prop is a visible heading, not hover text. */
const HEADING_TITLE = new Set(["CardHead", "Explorer", "ExplorerShell", "Section"]);

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsxFiles(p));
    else if (p.endsWith(".tsx") && !p.includes(".test.")) out.push(p);
  }
  return out;
}

/** The JSX element a `title=` at `i` belongs to: the nearest preceding `<Name`. */
function tagAt(src: string, i: number): string | null {
  for (let j = i; j > 0; j--) {
    if (src[j] === "<" && /[A-Za-z]/.test(src[j + 1] ?? "")) return /^[A-Za-z][\w.]*/.exec(src.slice(j + 1))?.[0] ?? null;
  }
  return null;
}

describe("no hover-only text", () => {
  it("no element in components/ or app/ carries a title attribute (a heading prop is not one)", () => {
    const offenders: string[] = [];
    for (const f of [...tsxFiles("components"), ...tsxFiles("app")]) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/\stitle=(?=["'{])/g)) {
        const tag = tagAt(src, m.index!);
        if (tag && HEADING_TITLE.has(tag)) continue;
        offenders.push(`${f}:${src.slice(0, m.index!).split("\n").length} <${tag}>`);
      }
    }
    expect(offenders, `hover text is not a UI channel — put it on the surface or drop it: ${offenders.join(", ")}`).toEqual([]);
  });
  it("the styled-tooltip layer stays retired", () => {
    expect(() => statSync(join("components", "HintTips.tsx"))).toThrow();
  });
});
