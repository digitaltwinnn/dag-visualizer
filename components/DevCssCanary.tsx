"use client";

import { useEffect } from "react";

// DEV-ONLY CSS canary (2026-08-16). Turbopack's persistent cache can serve a STALE
// globals.css compile that survives a plain restart (CLAUDE.md, CSS traps — it has now cost
// real debugging time TWICE: the phone flight-dim rules, then the callout's .edge-spine, which
// sat in the source while the served chunk predated it). The failure mode is silent: the
// element renders, the class is in the source, and the rule simply isn't in the CSSOM.
//
// This canary makes it loud: once per load, in dev only, scan the CSSOM for a handful of
// CONTRACT selectors (recipes JS or markers depend on — the CLAUDE.md marker table's kin) and
// error with the documented fix if any is missing. Production renders nothing and ships none
// of this (the dev check is behind the env guard, and the component returns null always).
const CONTRACT_SELECTORS = [".edge-spine", ".subject-paired", ".rail-ladder", ".slim-scroll", ".edge-pulse"];

// ⚠️ AND THE TOKENS, WHICH RUN IN PRODUCTION TOO — because that is where this last shipped.
// 2026-09-01: a Vercel build served a MIXED bundle — a fresh class scan of the current TSX glued to
// a `globals.css` compile from before the branch began. Every contract selector above was present,
// so the check above passed; what was missing were the `:root` CUSTOM PROPERTIES. The utilities
// referencing them survived and quietly collapsed to 0, so the command bar and the vitals band lost
// their inset and sat flush against the viewport edge. Reported as "the top/bottom bars are
// displaced", which is a layout complaint, not a stylesheet one — the tell is only obvious once you
// know it: THE UTILITIES ARE THERE AND THEIR TOKENS ARE NOT.
//
// Dev-only was exactly the wrong scope for this. The failure is a BUILD artifact, so checking only
// in dev checks the one environment where it cannot originate from a stale deployed chunk. Five
// `getPropertyValue` calls once per load is cheap enough to run everywhere; the SELECTOR walk above
// stays in dev, being a pass over every rule in a 115KB sheet.
//
// An empty string is the failure — NOT a falsy value. `--footer-h` is legitimately `0px` on phone,
// and a truthiness test would report that as broken.
const CONTRACT_TOKENS = ["--bar-margin", "--vitals-h", "--rail-margin", "--rail-top", "--panel-pad-x"];

export default function DevCssCanary() {
  useEffect(() => {
    // The token check runs in EVERY environment (see CONTRACT_TOKENS). Its remedy differs by
    // where it fires: in dev the stale compile is Turbopack's own cache, in a deployment it is the
    // build cache that produced the bundle.
    const tokens = () => {
      const cs = getComputedStyle(document.documentElement);
      const gone = CONTRACT_TOKENS.filter((t) => cs.getPropertyValue(t).trim() === "");
      if (!gone.length) return;
      console.error(
        `[CSS canary] ${gone.join(", ")} resolve to nothing on :root — the served globals.css is ` +
          "STALE (its utilities shipped, its tokens did not, so they collapse to 0 and the fixed " +
          "bars lose their inset). Do not debug the layout. In dev: kill the server, " +
          "`rm -rf .next/dev`, restart. In a deployment: redeploy with the build cache cleared.",
      );
    };
    const tokenTimer = setTimeout(tokens, 3000);

    if (process.env.NODE_ENV === "production") return () => clearTimeout(tokenTimer);
    // After hydration settles — stylesheets are all attached by then.
    const t = setTimeout(() => {
      const missing = new Set(CONTRACT_SELECTORS);
      for (const sheet of document.styleSheets) {
        let rules: CSSRuleList;
        try {
          rules = sheet.cssRules;
        } catch {
          continue; // cross-origin sheet
        }
        for (const r of rules) {
          const text = (r as CSSStyleRule).selectorText ?? r.cssText ?? "";
          for (const sel of missing) if (text.includes(sel)) missing.delete(sel);
        }
      }
      if (missing.size) {
        console.error(
          `[CSS canary] ${[...missing].join(", ")} missing from the served CSSOM — this is the ` +
            "Turbopack stale-CSS cache (CLAUDE.md, CSS traps). Do not debug the cascade: " +
            "kill the dev server, `rm -rf .next/dev`, restart.",
        );
      }
    }, 3000);
    return () => { clearTimeout(t); clearTimeout(tokenTimer); };
  }, []);
  return null;
}
