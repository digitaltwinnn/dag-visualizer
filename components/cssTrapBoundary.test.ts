import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// CSS traps 6, 3 and 10, made executable (6 and 3 on 2026-08-19; 10 on 2026-09-14). All three are
// SILENT failures: the class compiles, the page renders, and the only symptom is that the rule you
// wrote isn't the rule that ships — or, for trap 10, that a pointer never reaches what it points at.
// None can be caught by tsc, by vitest, or by looking at the JSX: only by measuring the browser,
// which is exactly the debugging session these tests exist to spare.
//
// Neither trap is currently violated. That is the point: this pins the clean state so the next
// token added under one of these namespaces fails here rather than in a screenshot three days
// later. CLAUDE.md's trap list stays the authoritative prose; these two now have teeth.
//
// TRAP 6 — a custom `@theme` utility whose prefix collides with a tailwind-merge class group MUST
// be registered in `lib/utils.ts`. Unregistered, twMerge misclassifies it: an unknown `text-*`
// reads as a text COLOR, so `cn("text-body", "text-muted-foreground")` silently DROPS the size and
// the copy falls back to the inherited 16px. Three namespaces collide today — `--text-*` →
// `text-*` (font-size), `--tracking-*` → `tracking-*`, `--radius-*` → `rounded-*`.
//
// TRAP 3 — `bg-[var(--x)]` compiles to background-COLOR. A token holding a gradient, a layer list
// or any background shorthand therefore renders NOTHING through it; it needs the arbitrary
// property form `[background:var(--x)]`. `--axis-hairlines` is the live example of the correct
// form and is what keeps the check below from passing vacuously.
//
// SCOPE LIMIT, stated rather than worked around: trap 3 can only judge tokens it can resolve in
// `globals.css`. A token set inline from JSX (`--ls-accent`, an identity hue on a LiveStrip bar)
// is invisible here. That is acceptable because an inline token carries a value computed in TS,
// where a gradient would be a deliberate act, while the silent-failure risk lives in the
// stylesheet — a token quietly promoted from a colour to a gradient under an unchanged name.
const ROOTS = ["app", "components", "src"];

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : walk(p);
    return /\.(ts|tsx|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });

const sources = () => ROOTS.flatMap(walk).map((path) => ({ path, src: readFileSync(path, "utf8") }));
const globals = () => readFileSync(join("app", "globals.css"), "utf8");

// Tailwind's own scales for the three colliding namespaces. tailwind-merge ships knowing these,
// so a token that merely RESTATES a stock name needs no registration — only names outside these
// sets do. Kept as literals: they are Tailwind's public defaults and change only on a major.
const STOCK: Record<string, readonly string[]> = {
  text: ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl", "8xl", "9xl"],
  tracking: ["tighter", "tight", "normal", "wide", "wider", "widest"],
  radius: ["none", "xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl", "full"],
};
// The css namespace → the utility prefix tailwind-merge groups it under.
const UTILITY: Record<string, string> = { text: "text", tracking: "tracking", radius: "rounded" };

/** Token names defined under `--<ns>-…` in globals.css, minus Tailwind's `--*--modifier` forms. */
function tokensIn(css: string, ns: string): string[] {
  const found = new Set<string>();
  const re = new RegExp(`^\\s*--${ns}-([a-z0-9-]+)\\s*:`, "gm");
  for (const m of css.matchAll(re)) {
    // `--text-body--line-height` is a MODIFIER of `--text-body`, not a utility of its own.
    const name = m[1].replace(/--[a-z-]+$/, "");
    if (name) found.add(name);
  }
  return [...found].sort();
}

describe("CSS trap 6 — custom @theme utilities are registered with tailwind-merge", () => {
  const utils = readFileSync(join("lib", "utils.ts"), "utf8");

  it.each(Object.keys(STOCK))("every non-stock --%s-* token is taught to twMerge", (ns) => {
    const prefix = UTILITY[ns];
    const custom = tokensIn(globals(), ns).filter((t) => !STOCK[ns].includes(t));
    // A registration reads `{ text: ["micro", "label", …] }` — assert the NAME appears inside the
    // group keyed by this utility prefix, so a name registered under the wrong group still fails.
    const group = new RegExp(`\\{\\s*${prefix}:\\s*\\[([^\\]]*)\\]`).exec(utils)?.[1] ?? "";
    const missing = custom.filter((t) => !new RegExp(`["']${t}["']`).test(group));
    expect(
      missing,
      `unregistered ${prefix}-* utilities — cn() will silently drop them: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("the registration is real, not an empty shell", () => {
    // Guards the check above against passing because globals.css defines nothing custom, or
    // because extendTailwindMerge was removed and every group regex now matches "".
    expect(utils).toContain("extendTailwindMerge");
    expect(tokensIn(globals(), "text").filter((t) => !STOCK.text.includes(t)).length).toBeGreaterThan(0);
  });
});

describe("CSS trap 3 — bg-[var()] only ever carries a colour", () => {
  /** The token's declared value, paren-aware so a multi-line gradient list is read whole. */
  function valueOf(css: string, token: string): string | null {
    const at = css.search(new RegExp(`^\\s*--${token}\\s*:`, "m"));
    if (at < 0) return null;
    let i = css.indexOf(":", at) + 1;
    let depth = 0;
    let out = "";
    for (; i < css.length; i++) {
      const c = css[i];
      if (c === "(") depth++;
      else if (c === ")") depth--;
      else if (c === ";" && depth === 0) break;
      out += c;
    }
    return out.replace(/\s+/g, " ").trim();
  }

  // A whitelist, not a blacklist: the risk is a NEW kind of non-colour value, so anything that
  // isn't recognisably a single colour is rejected and has to justify itself here.
  const COLOUR = /^(transparent|currentColor|inherit|#[0-9a-f]{3,8}|(oklch|rgba?|hsla?|color-mix|var|light-dark)\(.*\))$/i;

  it("no bg-[var(--token)] points at a gradient or background shorthand", () => {
    const css = globals();
    const offenders: string[] = [];
    for (const { path, src } of sources()) {
      for (const m of src.matchAll(/bg-\[var\((--[a-z0-9-]+)\)\]/g)) {
        const token = m[1].slice(2);
        const value = valueOf(css, token);
        if (value == null) continue; // set inline from JSX — see the scope limit in the header
        if (!COLOUR.test(value)) offenders.push(`${path}: --${token} = ${value.slice(0, 60)}…`);
      }
    }
    expect(
      offenders,
      `bg-[var()] compiles to background-COLOR and renders nothing for these — use [background:var(--x)]:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("a gradient token exists and uses the arbitrary-property form", () => {
    // Without this the rule above passes on a codebase that simply has no gradient tokens left,
    // and the trap would be re-learned the next time one is added.
    const css = globals();
    const gradientTokens = [...css.matchAll(/^\s*--([a-z0-9-]+)\s*:/gm)]
      .map((m) => m[1])
      .filter((t) => {
        const v = valueOf(css, t);
        return v != null && /gradient\(/.test(v);
      });
    expect(gradientTokens.length, "no gradient tokens — trap 3 has nothing to guard").toBeGreaterThan(0);

    const all = sources();
    for (const t of gradientTokens) {
      expect(all.some(({ src }) => src.includes(`bg-[var(--${t})]`)), `--${t} is a gradient behind bg-[var()]`).toBe(false);
    }
    expect(all.some(({ src }) => /\[background:var\(--[a-z0-9-]+\)\]/.test(src))).toBe(true);
  });

  // TRAP 10 — A DECORATIVE FULL-BOX PSEUDO SWALLOWS THE CARD'S CLICKS (found live, 2026-09-14:
  // "not [all] of the items are clickable in the cards"). The signal edge used to be a 2px bar
  // inset from each end; on 2026-09-13 it became a full-box border ring so the ink could bend
  // into the rounded corners (`inset: 0`, one coloured border side, a fixed-length mask). The
  // look was right and the consequence was invisible: the pseudo is `position: absolute` and
  // therefore paints ABOVE the card's in-flow content, so with the default `pointer-events: auto`
  // it became the hit target for the whole card. Only descendants with a positioned box of their
  // own still worked — the close mark, the copy buttons, the pager strip — which is exactly why
  // it read as "some things click and some don't" rather than as a dead card.
  //
  // The rule these pseudos must obey: a pseudo that covers its host and carries no text is
  // DECORATION, and decoration is never a hit target. Measured in the browser before the fix,
  // three controls in the metagraph dossier were unreachable and `pointer-events: none` on this
  // one selector cleared all three.
  it("a full-box decorative pseudo never takes the pointer", () => {
    // Comments stripped first: this file's rationale blocks are long and sit directly above the
    // rules they explain, so an uncleaned match drags the prose in as part of the selector.
    const css = globals().replace(/\/\*[\s\S]*?\*\//g, "");
    const offenders: string[] = [];
    // Blocks whose selector is a ::before/::after and whose body spans the host (`inset: 0`).
    const re = /([^{}]*::(?:before|after)[^{}]*)\{([^{}]*)\}/g;
    /** Does a rule for exactly this selector declare the pseudo's host inert? `pointer-events`
     *  INHERITS, so a decoration whose host is already `none` needs no declaration of its own —
     *  `.edge-pulse` is the live example, a span that exists only to carry the travelling light. */
    const hostIsInert = (host: string): boolean => {
      const esc = host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rule = new RegExp(`(^|\\})\\s*${esc}\\s*\\{([^{}]*)\\}`, "m");
      return /pointer-events:\s*none/.test(rule.exec(css)?.[2] ?? "");
    };
    for (const m of css.matchAll(re)) {
      const [, selector, block] = m;
      if (!/(^|[\s;])inset:\s*0(\s|;|$)/.test(block)) continue;
      if (/pointer-events:\s*none/.test(block)) continue;
      // Every host in the (possibly grouped) selector must be inert for the pseudo to be safe.
      const hosts = selector.split(",").map((part) => part.replace(/::(before|after)/g, "").trim());
      if (hosts.every((h) => h && hostIsInert(h))) continue;
      offenders.push(selector.trim().replace(/\s+/g, " ").slice(0, 80));
    }
    expect(
      offenders,
      `these pseudos cover their host and would intercept every in-flow click inside it — add pointer-events: none:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
