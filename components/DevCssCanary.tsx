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

export default function DevCssCanary() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
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
    return () => clearTimeout(t);
  }, []);
  return null;
}
