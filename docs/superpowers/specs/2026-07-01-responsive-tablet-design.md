# Responsive / tablet — design

**Date:** 2026-07-01
**Scope:** How the four-zone HUD adapts from desktop down to tablet and phone. Applies across all the zone specs.

## Principle — protect the scene, collapse the chrome

The 3D scene is the product. As width shrinks, the **chrome collapses to on-demand overlays** so the scene **keeps full width** — the rails never squeeze it. The command bar **sheds text progressively** (wordmark → mark, labels → icons) rather than wrapping or overflowing.

## Breakpoints

### Desktop · ≥1100
All four zones persistent: full command bar (brand + filter + view switch + vitals), left tool rail, right subject stack, bottom LiveStrip. As designed in the zone specs.

### Tablet · 700–1100 (touch)
- **Rails → edge tabs.** Both rails collapse to slim `‹` / `›` tabs at the screen edges; tapping one **slides it open as an overlay** over the scene (one at a time), so the **scene keeps full width**. Dismiss by tapping the scene / the tab.
- **Command bar condenses:** wordmark → **mark only** (the ECG); view switch → **icons only** (labels drop, tooltips on long-press); the **vitals stay** (they're the live readout).
- **Bottom LiveStrip stays** (it's slim).
- Touch: ≥44px tap targets on the tabs, view-switch icons, filter, and bars.

### Narrow · <700 (phone)
- **Scene full-bleed.**
- **Detail → bottom sheet.** Tapping a node/snapshot opens the Detail (the subject-stack card) as a **bottom sheet** — draggable to expand, dismissible; the scene stays visible behind. Better than a full-screen takeover (keeps context, easy to dismiss).
- **Left tool + right context → drawers** behind toggles (a left "explore" / right "details" affordance).
- **Command bar → icons only:** mark + filter dot + icon view switch; **vitals move behind a toggle** (or a compact single-metric summary).
- **Bottom LiveStrip** stays but may show **fewer bars** (fit the width).
- Touch targets ≥44px throughout.

## Component notes

- **Filter picker (Command)** and **rail lists (ScrollArea)** are already touch-friendly (scrollable, large rows) — they carry over to tablet/phone with bigger row heights.
- **Accordions** (GeoExplore, the breakdown) → larger tap rows; drilling opens inline as on desktop, within the overlay/sheet.
- **Tooltips (hover)** have no hover on touch → the tie-in tooltip becomes tap-to-preview, or is skipped (tap = commit directly on touch).
- **Reduced-motion** honoured on all the sheet/drawer transitions.

## Affected

- Layout CSS (`00-base.css` rails/zones + `11-responsive.css`) — the breakpoint rules; rails → tabs → drawers/sheets.
- `TopBar.tsx` — the condensing progression (mark, icon-only view switch, vitals toggle).
- A **drawer / bottom-sheet** primitive (shadcn **Sheet**) for the overlay rails + phone Detail.
- The subject stack + tool panels — render inside the overlay/sheet on small screens.

## Open / follow-ups

- Implementation plan (writing-plans).
- Exact breakpoint px + which vitals survive on phone (the single most useful metric per view).
- Whether tablet **portrait** behaves as tablet or phone (likely phone-ish given width).
