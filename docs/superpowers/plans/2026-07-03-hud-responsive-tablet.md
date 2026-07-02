# Responsive / Tablet Implementation Plan (Phase 9)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adapt the four-zone HUD from desktop down to tablet and phone so the 3D scene keeps full width — the chrome collapses to on-demand overlays instead of squeezing the canvas.

**Architecture:** Desktop keeps today's inline fixed rails. A `useBreakpoint` hook (matchMedia) drives three modes — `desktop ≥1100` / `tablet 700–1099` / `phone <700`. On tablet/phone the left tool rail and right subject stack render inside a shadcn **Sheet** (built on the already-installed radix Dialog) opened from slim edge tabs; on phone the selected Detail opens as a **bottom sheet**. The command bar sheds the wordmark → mark and (phone) moves vitals behind a toggle. CSS breakpoints full-bleed the scene and hide the inline rails.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Zustand, vanilla Three.js engine, Tailwind v4 + shadcn (radix Dialog installed), vitest (node env). Verify visuals with the chrome-devtools MCP against the one shared `next dev`.

## Global Constraints

- **Breakpoints (exact):** `desktop` ≥ 1100px · `tablet` 700–1099px · `phone` < 700px. Width-based (`window.innerWidth` / `matchMedia`), so a portrait tablet < 700 is treated as phone. Use these exact numbers everywhere.
- **Protect the scene:** the canvas is always full-bleed; rails/sheets overlay it, never reflow it. No layout that narrows the canvas.
- **Overlay primitive:** shadcn **Sheet** (add `components/ui/sheet.tsx` on radix Dialog). One rail open at a time. Dismiss by tapping the scene/scrim, the tab, or Escape.
- **Touch targets ≥ 44px** on every interactive control that appears at tablet/phone: edge tabs, view-switch icons, filter button, vitals toggle, LiveStrip bars, sheet close, accordion rows.
- **Reduced motion:** every sheet/drawer/tab transition is gated by `@media (prefers-reduced-motion: reduce)` (instant, no slide).
- **Two-lane colour** unchanged (structural cyan vs identity hue); do not introduce new colours.
- **Factual rule** unchanged (no fabricated data in any state).
- **Phone vitals:** hidden behind a tap-to-reveal toggle (not a single-metric summary).
- **One shared `next dev`.** Do not run `next build` alongside it. `tsc --noEmit` for type checks.

---

## File Structure

- Create `components/ui/sheet.tsx` — shadcn Sheet (radix Dialog), sides `left|right|bottom`.
- Create `src/data/breakpoint.ts` — pure `breakpointOf(width): Breakpoint` mapper (+ type). Node-test-safe (no `window`).
- Create `components/useBreakpoint.ts` — the client hook wrapping matchMedia, returns `Breakpoint`.
- Create `components/RailDock.tsx` — decides inline vs edge-tab+Sheet for a rail; renders the edge tab + Sheet shell.
- Create `app/styles/16-responsive-shell.css` — the tablet/phone shell CSS (edge tabs, sheet skin, full-bleed rules, touch sizing). New file so `11-responsive.css` stays the desktop-tightening rules.
- Modify `components/LeftColumn.tsx` — export its inner content so RailDock can host it; keep the desktop inline path.
- Modify `components/Inspector.tsx` — same split: inline on desktop, hosted content on tablet/phone; phone Detail → bottom sheet.
- Modify `components/TopBar.tsx` — wordmark→mark class hook at tablet; vitals toggle at phone.
- Modify `components/topbar/Vitals.tsx` — accept a `collapsed` control on phone (toggle).
- Modify `components/LiveStrip.tsx` — cap bar count on phone.
- Modify `app/globals.css` (or wherever `@import`s live) — import `16-responsive-shell.css`.
- Modify `app/page.tsx` — mount RailDock hosts (or keep components and let them self-host — see Task 3).

---

### Task 1: Sheet primitive (shadcn, on radix Dialog)

**Files:**
- Create: `components/ui/sheet.tsx`
- Modify: `app/styles/16-responsive-shell.css` (create; sheet skin lives here)
- Modify: the global stylesheet import list (add `16-responsive-shell.css`)

**Interfaces:**
- Produces: `Sheet`, `SheetTrigger`, `SheetContent` (prop `side: "left" | "right" | "bottom"`), `SheetClose`, `SheetTitle` (visually-hidden allowed). Controlled via `open`/`onOpenChange` (radix Dialog passthrough).

- [ ] **Step 1: Add the Sheet component.** Transcribe the shadcn Sheet (radix Dialog based). Use the project's existing `dialog.tsx` as the import/pattern reference (same `@radix-ui/react-dialog`, same `cn` util). Content is a fixed panel; `side` sets which edge it docks to and the slide direction. Include an overlay/scrim. Keep class names as `data-slot="sheet-*"` so CSS can target them without Tailwind utility drift.

```tsx
"use client";
import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;
const SheetPortal = SheetPrimitive.Portal;
const SheetTitle = SheetPrimitive.Title;

function SheetOverlay({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return <SheetPrimitive.Overlay data-slot="sheet-overlay" className={cn("sheet-overlay", className)} {...props} />;
}

function SheetContent({
  className, children, side = "right", ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & { side?: "left" | "right" | "bottom" }) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content data-slot="sheet-content" data-side={side} className={cn("sheet-content", className)} {...props}>
        {children}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetTitle, SheetOverlay };
```

- [ ] **Step 2: Sheet skin CSS** in `16-responsive-shell.css` — glass surface matching `.panel`; `data-side` positions it (left/right full-height docked to that edge; bottom docked to the bottom, rounded top, max-height ~72vh, draggable feel via a grabber bar). Scrim = dim. Slide-in transitions gated by reduced-motion.

```css
/* ── Responsive shell (tablet/phone): edge tabs + Sheet overlays. Desktop is unaffected. ── */
.sheet-overlay { position: fixed; inset: 0; z-index: 40; background: rgba(3, 5, 12, 0.55); backdrop-filter: blur(2px); }
.sheet-content {
  position: fixed; z-index: 41; background: var(--panel); border: 1px solid var(--panel-border);
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  display: flex; flex-direction: column; gap: var(--rail-gap);
  padding: 12px; overflow-y: auto; overscroll-behavior: contain;
}
.sheet-content[data-side="left"]  { top: 0; left: 0; bottom: 0; width: min(300px, 86vw); border-radius: 0 var(--radius) var(--radius) 0; }
.sheet-content[data-side="right"] { top: 0; right: 0; bottom: 0; width: min(320px, 90vw); border-radius: var(--radius) 0 0 var(--radius); }
.sheet-content[data-side="bottom"]{ left: 0; right: 0; bottom: 0; max-height: 72vh; border-radius: var(--radius) var(--radius) 0 0; }
@keyframes sheetInLeft   { from { transform: translateX(-100%); } to { transform: none; } }
@keyframes sheetInRight  { from { transform: translateX(100%); }  to { transform: none; } }
@keyframes sheetInBottom { from { transform: translateY(100%); }  to { transform: none; } }
.sheet-content[data-side="left"][data-state="open"]   { animation: sheetInLeft 0.28s cubic-bezier(0.22,1,0.36,1); }
.sheet-content[data-side="right"][data-state="open"]  { animation: sheetInRight 0.28s cubic-bezier(0.22,1,0.36,1); }
.sheet-content[data-side="bottom"][data-state="open"] { animation: sheetInBottom 0.3s cubic-bezier(0.22,1,0.36,1); }
@media (prefers-reduced-motion: reduce) { .sheet-content { animation: none !important; } }
```

- [ ] **Step 3: Wire the import.** Add `@import "./styles/16-responsive-shell.css";` (or the project's `@reference`/import mechanism — match how `15-states.css` is included) so the file ships. Grep for where `15-states.css` is imported and mirror it.
- [ ] **Step 4: Verify build.** `tsc --noEmit` clean. No visual change on desktop (Sheet is not mounted yet).
- [ ] **Step 5: Commit.** `feat(ui): add shadcn Sheet primitive (radix Dialog) for responsive overlays`

---

### Task 2: Breakpoint mapper + hook (TDD)

**Files:**
- Create: `src/data/breakpoint.ts`
- Create: `src/data/breakpoint.test.ts`
- Create: `components/useBreakpoint.ts`

**Interfaces:**
- Produces: `type Breakpoint = "desktop" | "tablet" | "phone"`; `breakpointOf(width: number): Breakpoint`; `useBreakpoint(): Breakpoint`.

- [ ] **Step 1: Failing test** `src/data/breakpoint.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { breakpointOf } from "./breakpoint";

describe("breakpointOf", () => {
  it("is desktop at >=1100", () => { expect(breakpointOf(1100)).toBe("desktop"); expect(breakpointOf(1600)).toBe("desktop"); });
  it("is tablet in 700..1099", () => { expect(breakpointOf(1099)).toBe("tablet"); expect(breakpointOf(700)).toBe("tablet"); });
  it("is phone below 700", () => { expect(breakpointOf(699)).toBe("phone"); expect(breakpointOf(360)).toBe("phone"); });
});
```

- [ ] **Step 2: Run it, verify it fails** (`npx vitest run src/data/breakpoint.test.ts`) — "breakpointOf is not a function".
- [ ] **Step 3: Implement `breakpoint.ts`** (pure, no `window`):

```ts
export type Breakpoint = "desktop" | "tablet" | "phone";
// Width-based so a portrait tablet (<700) reads as phone. Boundaries: desktop ≥1100, tablet ≥700.
export function breakpointOf(width: number): Breakpoint {
  if (width >= 1100) return "desktop";
  if (width >= 700) return "tablet";
  return "phone";
}
```

- [ ] **Step 4: Run tests, verify pass.**
- [ ] **Step 5: Implement the hook** `components/useBreakpoint.ts` — SSR-safe (default `desktop` until mounted), listens to two matchMedia queries, no per-resize thrash:

```tsx
"use client";
import { useEffect, useState } from "react";
import { breakpointOf, type Breakpoint } from "@/src/data/breakpoint";

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>("desktop"); // SSR + first paint assume desktop
  useEffect(() => {
    const compute = () => setBp(breakpointOf(window.innerWidth));
    compute();
    const mqTablet = window.matchMedia("(max-width: 1099px)");
    const mqPhone = window.matchMedia("(max-width: 699px)");
    mqTablet.addEventListener("change", compute);
    mqPhone.addEventListener("change", compute);
    return () => { mqTablet.removeEventListener("change", compute); mqPhone.removeEventListener("change", compute); };
  }, []);
  return bp;
}
```

- [ ] **Step 6: Commit.** `feat(responsive): breakpoint mapper + useBreakpoint hook (TDD)`

---

### Task 3: Left tool rail + right subject stack → edge-tab Sheets on tablet/phone

**Files:**
- Modify: `components/LeftColumn.tsx`
- Modify: `components/Inspector.tsx`
- Create: `components/RailDock.tsx`
- Modify: `app/styles/16-responsive-shell.css`
- Modify: `app/styles/00-base.css` (hide inline `#leftcol`/`#rightcol` + threads below 1100)

**Interfaces:**
- Consumes: `useBreakpoint`, `Sheet`/`SheetContent` (Task 1–2).
- Produces: `RailDock` — `{ side: "left" | "right"; label: string; children: ReactNode }` renders (a) nothing extra on desktop (parent still renders inline), (b) an edge tab + Sheet hosting `children` on tablet/phone.

Design: keep the existing inline `#leftcol` / `#rightcol` markup for **desktop**. For **tablet/phone**, render the SAME content inside a `RailDock` Sheet. To avoid duplicate DOM, `LeftColumn`/`Inspector` branch on `useBreakpoint()`.

- [ ] **Step 1: Extract left content.** In `LeftColumn.tsx`, factor the inner cards into a `LeftContent` fragment (the `RailThread` stays desktop-only). Then:

```tsx
export default function LeftColumn() {
  const bp = useBreakpoint();
  const mode = useStore((s) => s.mode);
  const filter = useStore((s) => s.filter);
  const accent = { ["--filter-accent"]: filterAccent(filter) } as CSSProperties;
  const content = (
    <>
      {mode === "geo" && <GeoExplore />}
      {mode === "ledger" && <LedgerPanel />}
      {PLACEHOLDERS[mode] && <PlaceholderPanel {...PLACEHOLDERS[mode]} />}
    </>
  );
  if (bp === "desktop") {
    return (<><RailThread side="left" /><div id="leftcol" style={accent}>{content}</div></>);
  }
  return <RailDock side="left" label="Explore" style={accent}>{content}</RailDock>;
}
```

- [ ] **Step 2: Extract right content.** In `Inspector.tsx`, keep the desktop branch (RailThread + `#rightcol`) exactly as today. For tablet, host the same `ContextCard + panes + PickHint` inside `RailDock side="right" label="Details"`. For **phone**, the Detail panes go to a **bottom sheet** (Task 4) — on phone RailDock right hosts only the Context card + view-default; Detail is the bottom sheet. Gate with `bp`.

- [ ] **Step 3: RailDock.** Slim fixed edge tab (`‹`/`›`, ≥44px) that toggles a `Sheet` (`side` = left/right) hosting `children`. Controlled open state; closes on pick is handled by children calling store setters (no extra wiring — closing on selection is optional and can be a follow-up).

```tsx
"use client";
import { useState, type CSSProperties, type ReactNode } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

export default function RailDock({ side, label, style, children }: {
  side: "left" | "right"; label: string; style?: CSSProperties; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={`rail-tab rail-tab--${side}`} aria-label={`${label} panel`} onClick={() => setOpen(true)}>
        {side === "left" ? "‹" : "›"}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side={side} style={style} aria-describedby={undefined}>
          <SheetTitle className="sr-only">{label}</SheetTitle>
          {children}
        </SheetContent>
      </Sheet>
    </>
  );
}
```

- [ ] **Step 4: Edge-tab + hide-inline CSS.** In `16-responsive-shell.css`: `.rail-tab` fixed, vertically centered at the screen edge, ≥44×44px, glass, with the `‹/›` glyph; `--left`/`--right` pin the sides. In `00-base.css` (or the shell file) below 1100px, `#leftcol`, `#rightcol`, and `.rail-thread` get `display: none` (they're the desktop inline path). Include an `.sr-only` utility if not already present.

```css
.rail-tab {
  position: fixed; z-index: 39; top: 50%; transform: translateY(-50%);
  width: 30px; min-height: 56px; display: none; align-items: center; justify-content: center;
  background: var(--panel); border: 1px solid var(--panel-border); color: var(--text);
  backdrop-filter: blur(14px); cursor: pointer; font-size: 20px; line-height: 1;
}
.rail-tab--left  { left: 0;  border-radius: 0 var(--radius) var(--radius) 0; border-left: none; }
.rail-tab--right { right: 0; border-radius: var(--radius) 0 0 var(--radius); border-right: none; }
@media (max-width: 1099px) {
  #leftcol, #rightcol, .rail-thread { display: none !important; }
  .rail-tab { display: flex; }
}
```

- [ ] **Step 5: Verify (chrome-devtools MCP).** Resize to 900px: both edge tabs show, inline rails gone, tapping a tab slides its Sheet over the scene at full width; Escape/scrim closes. Resize back to 1300px: inline rails + threads return unchanged. `tsc` clean.
- [ ] **Step 6: Commit.** `feat(responsive): rails collapse to edge-tab Sheet overlays on tablet/phone`

---

### Task 4: Phone Detail as a bottom sheet

**Files:**
- Modify: `components/Inspector.tsx`
- Modify: `app/styles/16-responsive-shell.css`

**Interfaces:**
- Consumes: `useBreakpoint`, `Sheet` (bottom side), the existing pick state (`store.inspect` / `store.snap`).

- [ ] **Step 1: Bottom-sheet the Detail on phone.** When `bp === "phone"` and a Detail is active (`hasDetail`), render the Detail pane(s) inside `Sheet side="bottom"`, `open` driven by `hasDetail`, `onOpenChange(false)` → clear the pick (`setInspect(null)` / `setSnap(null)` for whichever is active). The Context card + view-default stay in the right RailDock; only the Detail becomes the bottom sheet (matches the spec: "Tapping a node/snapshot opens the Detail as a bottom sheet"). Scene stays visible behind (bottom sheet ≤72vh).

- [ ] **Step 2: Grabber affordance.** Add a small centered grab bar at the top of the bottom sheet (visual only; radix handles dismiss via scrim/Escape — full drag-to-expand is a follow-up, note it). ≥44px close target.
- [ ] **Step 3: Verify.** At 480px: click a snapshot bar / a node → Detail rises as a bottom sheet over the scene; dismiss returns to scene; the pick clears. Reduced-motion: no slide.
- [ ] **Step 4: Commit.** `feat(responsive): phone Detail opens as a bottom sheet`

---

### Task 5: Command bar — mark-only + phone vitals toggle + touch targets

**Files:**
- Modify: `components/TopBar.tsx`
- Modify: `components/topbar/Vitals.tsx`
- Modify: `app/styles/14-top-bar.css`

**Interfaces:**
- Consumes: `useBreakpoint`.

- [ ] **Step 1: Wordmark → mark.** The bar already drops view names/filter word/sparklines via CSS down to 820px. Add: at `max-width: 1099px` hide `.tb-word` (keep `EcgMark`), and ensure the view-switch icons + filter button are ≥44px tap targets (`min-height: 44px`, adequate padding). Keep the divider drops.

```css
@media (max-width: 1099px) {
  .tb-word { display: none; }
  .tb-view { min-height: 44px; min-width: 44px; }
  .tb-filter { min-height: 44px; }
}
```

- [ ] **Step 2: Phone vitals toggle.** In `Vitals.tsx` accept internal `open` state on phone: render a compact toggle button (e.g. a small ▾ "vitals" pill, ≥44px) that reveals the vitals cluster in a small popover/inline expansion; on ≥700 render inline as today. Drive the phone branch with `useBreakpoint()`. Reduced-motion instant.
- [ ] **Step 3: Verify.** 900px → mark only, icon view switch, vitals inline, 44px targets. 480px → mark + filter dot + icon views + vitals behind the toggle. `tsc` clean.
- [ ] **Step 4: Commit.** `feat(responsive): command bar condenses to mark + phone vitals toggle`

---

### Task 6: LiveStrip on phone (fewer bars, touch) + scene full-bleed audit

**Files:**
- Modify: `components/LiveStrip.tsx`
- Modify: `app/styles/01-snapshot-ribbon.css`
- Modify: `app/styles/16-responsive-shell.css`

- [ ] **Step 1: Cap bars on phone.** LiveStrip already takes `MAX`. On phone, slice the rendered bars to the most recent N (e.g. 24) so each bar stays ≥ a usable width; keep the newest on the right. Use `useBreakpoint()`; do not change the buffer, only the slice. Bars keep their existing hit target; ensure the clickable area is ≥44px tall (the strip is already ~80px).
- [ ] **Step 2: Full-bleed audit.** Confirm `--bottom-reserve` and the strip still read on phone; the strip stays (spec). Ensure the edge tabs don't overlap the strip (tabs are vertically centered; the strip is at the bottom — check the right tab vs the strip's right end, nudge tab `top` if needed).
- [ ] **Step 3: Verify** at 480px and 375px: fewer bars, no overflow, tabs clear of the strip. `tsc` clean.
- [ ] **Step 4: Commit.** `feat(responsive): LiveStrip shows fewer bars on phone`

---

### Task 7: Reduced-motion + touch-target audit + cleanup

**Files:**
- Modify: `app/styles/16-responsive-shell.css` (and any file touched above)

- [ ] **Step 1: Reduced-motion sweep.** Verify every sheet/tab/toggle transition has a `prefers-reduced-motion: reduce` escape (instant). Emulate reduced-motion in the MCP and confirm no slide/transform animations run.
- [ ] **Step 2: Touch-target audit.** With the MCP at 480px, confirm ≥44px on: edge tabs, view-switch icons, filter, vitals toggle, sheet close, LiveStrip bars, accordion rows (GeoExplore). Fix any that fall short.
- [ ] **Step 3: Desktop regression.** At 1440px confirm the desktop HUD is pixel-unchanged (inline rails, both threads, full bar, vitals). No Sheet/tab in the DOM on desktop.
- [ ] **Step 4: Commit.** `chore(responsive): reduced-motion + touch-target audit`

---

## Self-Review notes (for the executor)

- **Spec coverage:** rails→edge tabs (T3) · command-bar condense (T5) · bottom LiveStrip stays/fewer bars (T6) · phone Detail bottom sheet (T4) · drawers = the left/right Sheets (T3) · vitals behind toggle (T5) · ≥44px targets (T7) · reduced-motion (T1/T7) · Sheet primitive (T1). Breakpoints from Global Constraints.
- **Risk:** T3 restructures rail mounting. Keep the desktop branch byte-for-byte to avoid regressions; the tablet/phone branch is additive.
- **Verify visually** (no test suite for CSS/layout) via the chrome-devtools MCP `resize_page` at 1440 / 900 / 480 / 375, against the one shared dev server. Only `breakpoint.ts` is unit-tested.
- **Open follow-ups (out of scope, note in ledger):** drag-to-expand bottom sheet; auto-close a rail Sheet on selection; tap-to-preview tooltip on touch (currently tap = commit).
