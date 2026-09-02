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

// ⚠️ AND A GENERIC STALE-STYLESHEET CHECK, WHICH RUNS IN PRODUCTION TOO.
//
// 2026-09-01: a Vercel build served dagvisualizer.io a MIXED bundle — a fresh class scan of the
// current TSX glued to a `globals.css` compile from before the branch began. Every contract
// selector above was present, so the check above passed; what was missing were the `:root` CUSTOM
// PROPERTIES. The utilities referencing them shipped intact and quietly collapsed to 0, so the
// command bar and the vitals band lost their inset and sat flush to the viewport edge. Reported as
// "the top/bottom bars are displaced" — a layout complaint, not a stylesheet one.
//
// ⚠️ A LIST OF TOKENS IS NOT A CHECK FOR STALENESS. The first cut here named five tokens by hand,
// and the flaw is fatal for the purpose: it detects the incident that has already happened. A later
// stale bundle that drops different tokens stays silent, and the list rots as tokens come and go.
// Measured against the real bundles, that list would have caught only two of the three tokens that
// actually went missing — `--footer-glass` was not on it.
//
// The INVARIANT is what to assert instead: every token a shipped utility depends on must be defined
// by the shipped token block. Both halves come from one compile, so if they disagree the stylesheet
// is stale — whatever changed. That needs no list and cannot rot.
//
// ⚠️ EXCLUSIONS ARE RUNTIME-SCOPED TOKENS, and they were MEASURED, not guessed. Parsing both real
// bundles: the healthy one references 120 tokens with no fallback and leaves 8 undefined on :root,
// every one of them set per-element at runtime; the stale one leaves 10 — those same 8 plus exactly
// the three that had gone missing. So the exclusions are `--radix-*` (Radix writes them onto the
// elements it positions), `--tw-*` (Tailwind's own engine vars) and two element-scoped names.
//
// A reference WITH a fallback is skipped by construction: `var(--topbar-extra, 0px)` is designed to
// be absent, so only `var(--x)` closed immediately is a claim that `--x` exists.
//
// This one runs in EVERY environment. The failure is a BUILD artifact, so checking only in dev
// checks the one place it cannot come from. It is diagnostic rather than functional, so it waits for
// an idle callback — in dev it is nearly a no-op anyway (dev's CSSOM carries a fraction of the
// compiled utilities), which is honest: production is where it earns its keep.
const RUNTIME_SCOPED = /^--(radix|tw)-/;
const RUNTIME_NAMED = new Set(["--gap", "--x"]);

export default function DevCssCanary() {
  useEffect(() => {
    // ⚠️ IT READS THE STYLESHEET TEXT, NOT THE CSSOM — and that is not a style preference, it is
    // the only thing that works. Measured against a real production bundle: the file carries 1370
    // `var(` occurrences and `document.styleSheets` exposes NINETEEN of them (181 top-level rules
    // for a 116KB sheet). A CSSOM walk therefore inspects almost nothing and passes silently, which
    // is strictly worse than the hand-written list it replaced, because it LOOKS generic. The
    // stylesheet is same-origin and already in the HTTP cache, so re-reading it is a cache hit.
    const staleCheck = async () => {
      // ⚠️ REFERENCED vs DEFINED, both read from the SAME TEXT — not "resolves on :root". A token
      // may legitimately be defined on an element selector (`--card-pad` on a card, `--pulse-hue` on
      // a subject mark) and be absent from :root by design; testing resolution flagged four of those
      // on a healthy bundle. What staleness actually means is that the two halves came from
      // DIFFERENT compiles, so the question is whether the file that references a token also
      // defines it anywhere at all.
      const REF = /var\(\s*(--[\w-]+)\s*\)/g;
      const DEF = /(--[\w-]+)\s*:/g;
      const hrefs = [...document.styleSheets].map((s) => s.href).filter((h): h is string => !!h);
      const wanted = new Set<string>();
      const defined = new Set<string>();
      for (const href of hrefs) {
        let css: string;
        try {
          const res = await fetch(href, { cache: "force-cache" });
          if (!res.ok) continue;
          css = await res.text();
        } catch { continue; }
        let m: RegExpExecArray | null;
        REF.lastIndex = 0;
        while ((m = REF.exec(css))) {
          const t = m[1];
          if (!RUNTIME_SCOPED.test(t) && !RUNTIME_NAMED.has(t)) wanted.add(t);
        }
        DEF.lastIndex = 0;
        while ((m = DEF.exec(css))) defined.add(m[1]);
      }
      if (!wanted.size) return; // nothing readable — say nothing rather than cry wolf
      const gone = [...wanted].filter((t) => !defined.has(t));
      if (!gone.length) return;
      console.error(
        `[CSS canary] ${gone.join(", ")} are used by shipped utilities but defined nowhere in the ` +
          "same stylesheet — the served globals.css is STALE. " +
          "Its utilities shipped and its tokens did not, so they collapse to 0 and fixed elements " +
          "lose their inset. Do not debug the layout. In dev: kill the " +
          "server, `rm -rf .next/dev`, restart. In a deployment: redeploy with the build cache cleared.",
      );
    };
    const idle = (cb: () => void) =>
      typeof requestIdleCallback === "function" ? requestIdleCallback(cb, { timeout: 8000 }) : setTimeout(cb, 3000);
    const tokenTimer = idle(() => void staleCheck()) as unknown as ReturnType<typeof setTimeout>;

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
