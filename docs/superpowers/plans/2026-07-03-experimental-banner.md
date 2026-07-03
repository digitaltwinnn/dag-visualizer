# Experimental Banner Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Restyle the top "experimental" disclaimer into a restrained Instrument-Glass ribbon (full text visible), and fix the phone clipping.

**Architecture:** Presentational only — rewrite `components/ExperimentalBanner.tsx`'s single text node into a `mark / label / note` structure, and rewrite the `#experimental-banner` CSS from the loud amber pill into a frosted-glass ribbon (panel glass body + faint amber hairline + restrained amber accent + muted note), that wraps instead of clipping.

**Tech Stack:** Next.js 15, React 19, TS, plain CSS (existing HUD tokens), chrome-devtools MCP for visual verification.

## Global Constraints

- **Full disclaimer stays always-visible** (not moved to hover/tooltip); component stays stateless + `pointer-events: none` + `role="note"`.
- **Restrained amber:** amber only on the `△` mark + the `EXPERIMENTAL` label + a faint hairline; body is neutral frosted glass; note text is `var(--muted)`.
- **Glass matches the HUD panels:** `background: var(--panel)`, `backdrop-filter: blur(14px)`, `border-radius: var(--radius)`.
- **No emoji** — the caution mark is the text glyph `△` (U+25B3), which takes CSS `color`.
- **Responsive:** remove `white-space: nowrap`; the ribbon wraps to two lines on phone instead of clipping.
- **Scope:** only `components/ExperimentalBanner.tsx` and `app/styles/14-top-bar.css`.

---

### Task 1: Restyle the experimental banner

**Files:**
- Modify: `components/ExperimentalBanner.tsx`
- Modify: `app/styles/14-top-bar.css` (the `#experimental-banner` rule + new `.xb-*` rules + a phone media query)

- [ ] **Step 1: Rewrite the component markup**

Replace the whole `components/ExperimentalBanner.tsx` with:

```tsx
// A quiet notice that the app is a work in progress — pinned at the very top, above the command
// bar. Static + presentational; no state. Full disclaimer stays visible (honesty); restrained
// Instrument-Glass ribbon, restrained amber accent.
export default function ExperimentalBanner() {
  return (
    <div id="experimental-banner" role="note">
      <span className="xb-mark" aria-hidden>△</span>
      <span className="xb-label">Experimental</span>
      <span className="xb-note">unofficial community project — not affiliated with the official Constellation Network</span>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite the `#experimental-banner` CSS**

In `app/styles/14-top-bar.css`, replace the entire existing `#experimental-banner { … }` rule with the ribbon + accent rules below:

```css
/* Experimental disclaimer — restrained Instrument-Glass ribbon, top-centre above the command bar.
   Full text stays visible; wraps to two lines on narrow screens instead of clipping. */
#experimental-banner {
  position: fixed;
  top: 5px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 13;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 4px 8px;
  max-width: min(92vw, 640px);
  padding: 5px 14px;
  background: var(--panel);
  border: 1px solid rgba(255, 209, 102, 0.22); /* faint amber hairline (notice cue) */
  border-radius: var(--radius);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  text-align: center;
  line-height: 1.35;
  pointer-events: none;
}
.xb-mark { color: #ffd166; font-size: 11px; opacity: 0.85; }
.xb-label {
  color: #ffd166;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}
.xb-note { color: var(--muted); font-size: 11.5px; letter-spacing: 0.01em; }

/* Phone: slightly smaller, a touch more viewport width — wraps to two lines. */
@media (max-width: 700px) {
  #experimental-banner { max-width: 94vw; padding: 5px 12px; }
  .xb-note { font-size: 11px; }
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit` — Expected: clean.

- [ ] **Step 4: Visual verification (desktop + phone)**

With the shared dev server running, drive the chrome-devtools MCP at `http://localhost:3000`:
- **Desktop (1512×900):** the top ribbon is a single frosted-glass line — `△ EXPERIMENTAL` in restrained amber, the disclaimer in muted grey, a faint amber hairline, backdrop-blur behind it. No loud amber fill. It reads quieter than before and matches the HUD panels.
- **Phone (390×844):** `resize_page` to 390 wide; confirm the ribbon **wraps to two lines** and stays fully within the viewport (no clipping of "COMMUNITY-BUILT…"). Reset to 1512×900 after.

- [ ] **Step 5: Commit**

```bash
git add components/ExperimentalBanner.tsx app/styles/14-top-bar.css
git commit -m "feat(hud): restrained Instrument-Glass experimental ribbon (wraps on phone)"
```

(Author `digitaltwinnn`; repo trailer convention applies.)

---

## Self-Review

- **Spec coverage:** frosted-glass ribbon (Step 2 body) / full text visible (Step 1 markup) / restrained amber accent (`.xb-mark`+`.xb-label` amber, body neutral, note muted) / `△` text glyph not emoji (Step 1) / responsive wrap (removed nowrap + max-width + phone media query) — all spec sections covered.
- **Placeholder scan:** no TBD/TODO; all CSS values concrete.
- **Type consistency:** class names `xb-mark`/`xb-label`/`xb-note` match between the component (Step 1) and the CSS (Step 2). Single task — no cross-task interfaces.
