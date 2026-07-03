# Experimental banner redesign — design

**Date:** 2026-07-03
**Scope:** Restyle the top "experimental" disclaimer (`#experimental-banner`) from a loud amber uppercase pill into a restrained Instrument-Glass ribbon, keeping the full honesty/unofficial disclaimer always visible, and fixing the phone clipping. Presentational only — no new state, no new component.

## Intent

The disclaimer must stay (honesty: this is an unofficial, community-built project not affiliated with Constellation), but the current treatment shouts — full-width, all-caps, saturated amber — and its `white-space: nowrap` clips on phone. Redesign it to recede into the HUD chrome like everything else while remaining legible.

## Form (chosen)

A **refined frosted-glass ribbon**, full disclaimer always visible (not hover-hidden), fixed at top-center above the command bar. Restyle + responsive fix only — same position, same `pointer-events: none`, same stateless component.

## Content & structure

Replace the single amber text run with a small structured ribbon:

```
[ △  EXPERIMENTAL   unofficial community project — not affiliated with the official Constellation Network ]
```

- **`△` caution mark** — a small text glyph (U+25B3, `aria-hidden`), restrained amber. Text glyph, **not an emoji** (emoji ignore CSS `color`, per the codebase's chrome rule).
- **`EXPERIMENTAL`** — a small uppercase micro-label, restrained amber, letter-spaced. The only capitalized element; it carries the "notice" accent.
- **disclaimer note** — sentence case, muted-grey (`var(--muted)`), normal weight: "unofficial community project — not affiliated with the official Constellation Network".

Markup (`components/ExperimentalBanner.tsx`):

```tsx
<div id="experimental-banner" role="note">
  <span className="xb-mark" aria-hidden>△</span>
  <span className="xb-label">Experimental</span>
  <span className="xb-note">unofficial community project — not affiliated with the official Constellation Network</span>
</div>
```

## Styling (Instrument-Glass, restrained amber)

- **Body:** frosted glass matching the HUD panels — translucent dark background + `backdrop-filter: blur(...)` + a **hairline border** — rounded (`--radius`/8px). Reuse the panel glass tokens so it reads as the same surface family (not a separate amber block).
- **Accent:** amber is dialed way down — only the `△` mark and the `EXPERIMENTAL` label are amber (a muted amber, e.g. `#ffd166` at reduced weight/size), plus optionally a faint amber tint on the hairline. The body is neutral glass; the disclaimer text is muted grey. No large amber fill.
- **Type:** ~11–11.5px; `EXPERIMENTAL` uppercase + letter-spaced; the note sentence case. Overall quieter than today's bold all-caps.
- **Layout:** `display: flex; align-items: center; gap;` centered; a sensible `max-width` (e.g. `min(92vw, ~640px)`).

## Responsive

- **Remove `white-space: nowrap`.** With the `max-width`, the ribbon **wraps to two lines** on narrow/phone widths instead of clipping (the current bug).
- Slightly smaller type on phone; keep it centered and within the viewport. The `△`/`EXPERIMENTAL` accent stays on the first line.

## Affected components

- `components/ExperimentalBanner.tsx` — replace the single text node with the `xb-mark` / `xb-label` / `xb-note` structure above.
- `app/styles/14-top-bar.css` — rewrite the `#experimental-banner` rule (glass body, hairline, flex layout, `max-width`, wrap) and add `.xb-mark` / `.xb-label` / `.xb-note` rules; add a phone-width tweak (smaller type) either here or in `16-responsive-shell.css` following the existing responsive pattern.

## Out of scope / non-goals

- No change to the disclaimer's **meaning** or its always-visible nature (not moved to a tooltip/hover).
- No change to the command bar or any other chrome.
- No new component, no state, no interactivity (stays `pointer-events: none`, `role="note"`).

## Open / follow-ups

- Implementation plan (writing-plans).
- Exact glass token values are pinned in the plan by matching the existing `.panel` rule.
