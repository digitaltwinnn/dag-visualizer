# Light/Dark Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A three-state System/Light/Dark theme with an instant flip that reaches everything — HUD and 3D scene — with the light side a first-pass "day instrument" (ink on paper) look.

**Architecture:** Every themed token is defined once as `light-dark(light, dark)`; the whole switch is the `color-scheme` property (`light dark` = System, pinned by `data-theme`). A pre-paint script stamps the stored choice; a `ThemeController` owns state; the Engine re-threads scene colours by swapping the SAME objects it threaded at construction, so per-frame writers repaint free.

**Tech Stack:** CSS `light-dark()` + `color-scheme`, Zustand, vanilla Three.js, vitest.

**Spec:** `docs/superpowers/specs/2026-08-21-light-dark-mode-design.md` — read it first; it carries the locked decisions, the measured chroma table ("do not re-derive"), and the scope split.

## Global Constraints

- **Dark stays byte-identical**: every `light-dark()` dark side carries today's value verbatim; `identity.test.ts` pins the dark lane pairs (HUD 0.74/0.19, scene 0.68/0.20).
- **Hue never themes** — brand-hues.json, assignPalette, guard bands, per-network ALLOWED untouched.
- **Only `"light"`/`"dark"` are ever stored** (`localStorage["dagviz:theme"]`); absence IS System.
- **Rule 1 holds**: scene modules receive plain data (`setColors`), never store/react; the Engine is the only bridge.
- **The flip is an instant snap** — no scene cross-fade; reduced motion is a no-op by construction.
- Sub-project 2 (per-view day-look refinement) is OUT of scope — first-pass values only, live-tunable.
- Gates per task: `npx tsc --noEmit && npm test` (check EXIT CODES, not grep output), commit with trailer `Co-Authored-By: Claude <noreply@anthropic.com>`.
- ONE dev server; engine/scene class edits need a full page reload; if a CSS rule is missing from the browser, `rm -rf .next/dev` and restart before debugging anything.

---

### Task 1: the pure theme resolver

**Files:**
- Create: `src/theme/resolve.ts`
- Test: `src/theme/resolve.test.ts`

**Interfaces:**
- Produces: `type ThemePref = "system" | "light" | "dark"` · `type Theme = "light" | "dark"` · `THEME_KEY = "dagviz:theme"` · `parseThemePref(raw: string | null | undefined): ThemePref` · `resolveTheme(pref: ThemePref, systemDark: boolean): Theme`. Tasks 3, 4 and 7 consume these exact names.

- [ ] **Step 1: Write the failing test** (`src/theme/resolve.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { parseThemePref, resolveTheme, THEME_KEY } from "./resolve";

describe("parseThemePref", () => {
  it("accepts exactly the two explicit values", () => {
    expect(parseThemePref("light")).toBe("light");
    expect(parseThemePref("dark")).toBe("dark");
  });
  it("everything else is System — absence IS system, never stored", () => {
    expect(parseThemePref(null)).toBe("system");
    expect(parseThemePref(undefined)).toBe("system");
    expect(parseThemePref("system")).toBe("system"); // never written, still tolerated
    expect(parseThemePref("LIGHT")).toBe("system"); // exact values, no case folding
    expect(parseThemePref("auto")).toBe("system");
  });
});

describe("resolveTheme", () => {
  it("an explicit pref wins regardless of the OS", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
  it("system follows the OS", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

it("the storage key is stable", () => expect(THEME_KEY).toBe("dagviz:theme"));
```

- [ ] **Step 2: Run** `npx vitest run src/theme` → FAIL (module missing).

- [ ] **Step 3: Implement** (`src/theme/resolve.ts`):

```ts
// THE one theme resolver (the src/net/parse.ts pattern). Both the ThemeController (runtime)
// and the pre-paint inline script in app/layout.tsx (which cannot import — it mirrors the
// two-value check textually) must agree with this. Only "light"/"dark" are ever STORED;
// absence is System, which keeps the pre-paint script branchless.
export type ThemePref = "system" | "light" | "dark";
export type Theme = "light" | "dark";
export const THEME_KEY = "dagviz:theme";

export function parseThemePref(raw: string | null | undefined): ThemePref {
  return raw === "light" || raw === "dark" ? raw : "system";
}

export function resolveTheme(pref: ThemePref, systemDark: boolean): Theme {
  if (pref === "light" || pref === "dark") return pref;
  return systemDark ? "dark" : "light";
}
```

- [ ] **Step 4: Run** → PASS; full gate; **Step 5: Commit** `feat(theme): pure three-state resolver`.

---

### Task 2: the token layer — light-dark() + color-scheme + pre-paint stamp

**Files:**
- Modify: `app/globals.css` (the 32 colour tokens, lines ~478–621; plus `--axis-hairlines`), `app/layout.tsx` (second inline script)

**Interfaces:**
- Produces: every colour token themed; `--ident-l` / `--ident-c` (Task 6 consumes); `data-theme` stamped pre-paint. CSS only — no JS API.

- [ ] **Step 1: The mechanism.** In the `:root` block that carries `--background` (line ~478), add at its top:

```css
  /* THE theme switch (multi-network design's light/dark spec §1): `light dark` IS the System
     state — the browser resolves every light-dark() against the OS preference and OS flips
     propagate live. An explicit choice pins it via data-theme (stamped pre-paint by the
     inline script in app/layout.tsx; owned at runtime by ThemeController). There are NO
     duplicated [data-theme] token blocks anywhere — each token defines both faces at its one
     site. The ONE exception: --ident-l/--ident-c below are NUMBERS, and light-dark() is
     <color>-only, so they use the guarded override pair instead. */
  color-scheme: light dark;
```

And after that `:root` block closes:

```css
:root[data-theme="light"] { color-scheme: light; }
:root[data-theme="dark"] { color-scheme: dark; }

/* The identity lanes' L/C (spec §4) — the light-dark() exception: number tokens. Dark values
   are today's HUD lane verbatim (identity.ts pins them); light is the measured ink lane. */
:root { --ident-l: 0.74; --ident-c: 0.19; }
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) { --ident-l: 0.50; --ident-c: 0.14; }
}
:root[data-theme="light"] { --ident-l: 0.50; --ident-c: 0.14; }
```

- [ ] **Step 2: Convert the 32 colour tokens.** Each becomes `light-dark(<light>, <dark-verbatim>)`. The exact light values (spec §5 + first-pass fills, same ink family):

```
--background:        light-dark(oklch(0.965 0.008 265), oklch(0.09 0.02 265))
--foreground:        light-dark(oklch(0.24 0.03 265), oklch(0.94 0.02 255))
--muted-foreground:  light-dark(oklch(0.48 0.03 265), oklch(0.66 0.04 265))
--card:              light-dark(oklch(0.94 0.01 265), oklch(0.15 0.03 265))
--primary:           light-dark(oklch(0.50 0.085 195), oklch(0.88 0.13 195))
--primary-foreground:light-dark(oklch(0.98 0.005 265), oklch(0.14 0.02 265))
--ring:              light-dark(oklch(0.50 0.085 195), oklch(0.88 0.13 195))
--net-mainnet:       light-dark(oklch(0.50 0.085 195), oklch(0.88 0.13 195))
--net-integrationnet:light-dark(oklch(0.50 0.085 300), oklch(0.78 0.13 300))
--net-testnet:       light-dark(oklch(0.50 0.085 327), oklch(0.84 0.13 327))
--destructive:       light-dark(oklch(0.50 0.18 25), oklch(0.63 0.20 25))
--success:           light-dark(oklch(0.45 0.10 165), oklch(0.80 0.15 165))
--core:              light-dark(oklch(0.45 0.16 265), oklch(0.66 0.16 265))
--foreground-dim:    light-dark(#3a4460, #c7d0ea)
--warn-soft:         light-dark(#8a6a00, #ffd166)
--border:            light-dark(rgba(30, 60, 140, 0.28), rgba(90, 140, 255, 0.22))
--surface-muted:     light-dark(oklch(0.92 0.01 265), oklch(0.18 0.03 265))
--wash-faint:        light-dark(rgba(30, 60, 140, 0.05), rgba(90, 140, 255, 0.05))
--wash-soft:         light-dark(rgba(30, 60, 140, 0.10), rgba(90, 140, 255, 0.10))
--wash-hover:        light-dark(rgba(30, 60, 140, 0.12), rgba(90, 140, 255, 0.12))
--panel:             light-dark(rgba(252, 253, 255, 0.78), rgba(12, 16, 32, 0.72))
--panel-light:       light-dark(rgba(252, 253, 255, 0.40), rgba(12, 16, 32, 0.35))
--panel-solid:       light-dark(rgba(248, 250, 255, 0.94), rgba(8, 12, 26, 0.92))
--panel-plate:       light-dark(rgba(10, 20, 60, 0.05), rgba(255, 255, 255, 0.045))
--sel-bg:            light-dark(rgba(1, 114, 114, 0.10), rgba(42, 245, 255, 0.12))
--sel-border:        light-dark(rgba(1, 114, 114, 0.45), rgba(42, 245, 255, 0.5))
--sel-bg-dim:        light-dark(rgba(1, 114, 114, 0.05), rgba(42, 245, 255, 0.05))
--sel-border-dim:    light-dark(rgba(1, 114, 114, 0.20), rgba(42, 245, 255, 0.22))
--thread-line:       light-dark(rgba(40, 55, 95, 0.40), rgba(178, 193, 223, 0.40))
--thread-tick:       light-dark(rgba(40, 55, 95, 0.30), rgba(178, 193, 223, 0.30))
--thread-tick-major: light-dark(rgba(40, 55, 95, 0.42), rgba(178, 193, 223, 0.42))
--thread-faint:      light-dark(rgba(40, 55, 95, 0.10), rgba(178, 193, 223, 0.10))
```

(The dark sides above are the file's current values — verify each against the line you edit; if any differs, THE FILE WINS and the light value is re-derived in the same relationship. `rgba(1,114,114,…)` is light-accent teal `#017272`'s RGB — the `--sel-*` family tracks the accent per theme.) `--axis-hairlines` keeps its gradient shape with `light-dark()` per colour STOP (it is a `<color>` function, not an `<image>` — trap-3 kin). The `--net-*` comment gains one line: light sides share L 0.50 / C 0.085 because CYAN's ink-lightness ceiling binds all three (spec's measured table — on dark ground the inversion is the other way).

- [ ] **Step 3: The pre-paint stamp.** In `app/layout.tsx`, directly after the `data-net` script:

```tsx
        {/* Theme stamp — the data-net script's twin: pin data-theme BEFORE first paint iff an
            explicit choice is stored. Absence = System = no attribute (color-scheme: light dark
            lets the browser resolve). Mirrors src/theme/resolve.ts's two-value check. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              '(function(){try{var t=localStorage.getItem("dagviz:theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;}catch(e){}})();',
          }}
        />
```

- [ ] **Step 4: Verify live.** Dev server up (fresh cache if CSS looks stale): the bare app renders EXACTLY as before on a dark-OS machine. In the browser console: `document.documentElement.dataset.theme="light"` → the HUD flips to paper/ink instantly (the scene stays dark until Task 7 — expected mid-branch); delete it → dark returns. `getComputedStyle(document.documentElement).getPropertyValue("--primary")` differs per state. Spot-compare 5 tokens on dark against their pre-branch values (byte-identity).

- [ ] **Step 5: Gate** (the five globals.css-reading tests stay green — `light-dark()` adds no gradient behind `bg-[var()]`, no new `text-*`/`rounded-*` utilities) and **commit** `feat(theme): light-dark() token layer + color-scheme switch + pre-paint stamp`.

---

### Task 3: theme state — store keys + ThemeController

**Files:**
- Modify: `src/store/store.ts` (two keys + one setter), `app/page.tsx` (mount)
- Create: `components/ThemeController.tsx`

**Interfaces:**
- Consumes: Task 1's `parseThemePref`, `resolveTheme`, `THEME_KEY`.
- Produces: store keys `themePref: ThemePref` (initial `"system"`), `theme: Theme` (initial `"dark"` — the SSR-safe default), setter `setTheme(pref: ThemePref, resolved: Theme): void` (sets both). Tasks 4 and 7 consume these exact names.

- [ ] **Step 1: Store.** In `src/store/store.ts`, following the file's existing key+setter idiom (read a neighbouring setter first and copy its shape):

```ts
  // THEME (light/dark spec §2). Unlike the network (a frozen page parameter), theme is genuine
  // runtime state: the resolved value drives the Engine's colour re-thread and any component
  // that renders theme-conditionally. ONE writer: ThemeController. `theme` boots "dark" (the
  // SSR-safe default); the controller corrects it on mount before the engine constructs.
  themePref: "system" as ThemePref,
  theme: "dark" as Theme,
  setTheme: (pref: ThemePref, resolved: Theme) => set({ themePref: pref, theme: resolved }),
```

(import `type { ThemePref, Theme } from "@/src/theme/resolve"`; wire into the store's type the way every other key is.)

- [ ] **Step 2: ThemeController** (`components/ThemeController.tsx`):

```tsx
"use client";

import { useEffect } from "react";
import { useStore } from "@/src/store/store";
import { parseThemePref, resolveTheme, THEME_KEY, type ThemePref } from "@/src/theme/resolve";

// The ONE owner of theme state (light/dark spec §2): reads the stored pref on mount, follows
// the OS while the pref is System (matchMedia — the only listener in the app), stamps/removes
// data-theme on <html>, persists explicit choices, and writes the store pair the Engine and
// components consume. The pre-paint script in app/layout.tsx already stamped an explicit
// choice before paint; this adopts it. Renders nothing.
const mq = () => window.matchMedia("(prefers-color-scheme: dark)");

export function applyThemePref(pref: ThemePref) {
  const { setTheme } = useStore.getState();
  const resolved = resolveTheme(pref, mq().matches);
  const root = document.documentElement;
  if (pref === "system") {
    delete root.dataset.theme;
    try { localStorage.removeItem(THEME_KEY); } catch { /* storage unavailable */ }
  } else {
    root.dataset.theme = pref;
    try { localStorage.setItem(THEME_KEY, pref); } catch { /* storage unavailable */ }
  }
  setTheme(pref, resolved);
}

export default function ThemeController() {
  useEffect(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem(THEME_KEY); } catch { /* storage unavailable */ }
    applyThemePref(parseThemePref(stored));
    const m = mq();
    // OS flips only matter while following the system — resolve against the CURRENT pref.
    const onChange = () => {
      const pref = useStore.getState().themePref;
      if (pref === "system") useStore.getState().setTheme(pref, resolveTheme(pref, m.matches));
    };
    m.addEventListener("change", onChange);
    return () => m.removeEventListener("change", onChange);
  }, []);
  return null;
}
```

- [ ] **Step 3: Mount** in `app/page.tsx` beside `DataBridge` / `FollowController` (the bridge-component row): `<ThemeController />`.

- [ ] **Step 4: Verify live**: with `localStorage.setItem("dagviz:theme","light")` + reload, the page paints light with NO dark flash (pre-paint stamp) and `useStore.getState().theme === "light"` (check via the React devtools or a temporary console read). Clear the key → System behaviour returns.

- [ ] **Step 5: Gate + commit** `feat(theme): store pair + ThemeController owner`.

---

### Task 4: the cycle button in the command bar

**Files:**
- Create: `components/topbar/ThemeToggle.tsx`
- Modify: `components/TopBar.tsx` (mount between PresentationToggle and NetworkSwitch, both slots)

**Interfaces:**
- Consumes: `applyThemePref` from `@/components/ThemeController`, store `themePref`, lucide `Monitor`/`Sun`/`Moon`.

- [ ] **Step 1: ThemeToggle**:

```tsx
"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useStore } from "@/src/store/store";
import { applyThemePref } from "@/components/ThemeController";
import { cn } from "@/lib/utils";
import type { ThemePref } from "@/src/theme/resolve";

// The theme control — an icon CYCLE button (System → Light → Dark), sitting between the
// PresentationToggle and the NetworkSwitch: a "how it looks" control beside presentation,
// while the network keeps the outermost slot. A popover was considered and dropped — two
// popovers side by side at the bar's edge is heavy for a set-and-forget preference. The icon
// renders from the STORE pref, which boots "system" on both server and client — so hydration
// sees no mismatch (the React-19 data-net trap) and the icon corrects itself when
// ThemeController adopts a stored choice on mount.
const ORDER: ThemePref[] = ["system", "light", "dark"];
const FACE = { system: Monitor, light: Sun, dark: Moon } as const;
const NAME = { system: "System", light: "Light", dark: "Dark" } as const;

export default function ThemeToggle() {
  const pref = useStore((s) => s.themePref);
  const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];
  const Icon = FACE[pref];
  return (
    <button
      type="button"
      aria-label={`Theme: ${NAME[pref]} — switch to ${NAME[next]}`}
      onClick={() => applyThemePref(next)}
      className={cn(
        "group flex flex-none items-center h-9 py-1.5 px-2.5 rounded-btn! pointer-coarse:min-h-11",
        "bg-transparent border-0 text-muted-foreground hover:text-foreground hover:bg-wash-soft",
      )}
    >
      <Icon aria-hidden className="size-4" />
    </button>
  );
}
```

- [ ] **Step 2: Mount.** In TopBar's right zone, between `<PresentationToggle />` and the NetworkSwitch's divider: `<ThemeToggle />` (no divider of its own — it reads as part of the "how it looks" group). In the filter strip's phone row, add it beside `<NetworkSwitch />` after the existing divider.

- [ ] **Step 3: Verify live** at 1600 / 1440 / 900 / 821 and phone 390/360 (emulated): cycle works, icon follows, choice persists across reload, **no `[TopBar]` overflow warning and no zone crush** (measure `scrollWidth-clientWidth` on the row AND each zone — the alarm covers both since the grid promotion). If a threshold needs raising (~36px landed in the bar), raise BOTH arms of the affected boundary together (trap 8) and note the measured width.

- [ ] **Step 4: Gate + commit** `feat(theme): cycle control in the command bar`.

---

### Task 5: the allowlisted literals join the theme

**Files:**
- Modify: `app/globals.css` (three new tokens + RailThread ruler classes), `components/TopBar.tsx:140`, `components/RailThread.tsx:26-28,58` (+ the scrim consumer — grep `rgba(3, 5, 12` / `#03050c` in `components/`), `src/engine/noHardcodedColors.test.ts` (allowlist SHRINKS)

- [ ] **Step 1: Tokens.** In globals.css beside `--panel`:

```css
  /* Chrome surfaces that were raw literals in JSX (the old rule-3 allowlist): themed here so
     the theme reaches them; trap 3 — the gradient token is consumed as [background:var()],
     never bg-[var()]. */
  --topbar-glass: linear-gradient(180deg,
    light-dark(rgba(250, 252, 255, 0.86), rgba(20, 26, 46, 0.82)),
    light-dark(rgba(240, 244, 252, 0.80), rgba(10, 14, 28, 0.76)));
  --scrim: light-dark(rgba(235, 240, 250, 0.86), rgba(3, 5, 12, 0.86));
  --thread-punch: light-dark(oklch(0.965 0.008 265), #0c1020);
```

(Adjust `--scrim`'s alpha to whatever the current consumer uses — read it first; the light side keeps the SAME alpha.)

- [ ] **Step 2: Consumers.** TopBar line 140: `"bg-[linear-gradient(…)]"` → `"[background:var(--topbar-glass)]"`. The scrim consumer(s): literal → `var(--scrim)` (CSS property positions only). RailThread: delete the `TICK_LINE`/`TICK_MINOR`/`TICK_MAJOR`/`PUNCH` consts; the ruler `<line>`s get `className="thread-rule"` / `"thread-tick"` / `"thread-tick-major"` and the punch-out ring `className="thread-punch"`, styled from globals.css (CSS **properties** on SVG resolve `var()` — the 2026-08-08 finding was about attributes):

```css
/* RailThread's ruler ink — CSS properties, not SVG attributes, so the tokens resolve and the
   theme reaches the thread (rule-3's old allowlisted literals, retired). */
.thread-rule { stroke: var(--thread-line); }
.thread-tick { stroke: var(--thread-tick); }
.thread-tick-major { stroke: var(--thread-tick-major); }
.thread-punch { stroke: var(--thread-punch); }
```

(Where a line currently picks minor/major by index, set the class conditionally instead of the stroke.)

- [ ] **Step 3: Shrink the allowlist.** Remove from `noHardcodedColors.test.ts` `COMPONENTS_ALLOWED`: `0xb2c1df`, `0x0c1020`, `0x141a2e`, `0x0a0e1c`, `0x03050c` and their comment block (replace with one line: "RailThread/TopBar/scrim literals became themed tokens — light/dark spec §1"). Run it → it must PASS because the literals are truly gone (if it fails, a consumer was missed — the test is the proof).

- [ ] **Step 4: Verify live** (both themes): the thread ruler, topbar glass and sheet scrim render correctly dark (byte-identical eyeball) and flip with the theme. **Screenshot the thread** — the SVG fade mask clips ink overflow, so attribute checks pass while pixels fail.

- [ ] **Step 5: Gate + commit** `refactor(theme): chrome literals become themed tokens; rule-3 allowlist shrinks`.

---

### Task 6: identity lanes per theme

**Files:**
- Modify: `src/palette/identity.ts`, `src/palette/identity.test.ts`, `src/data/network.ts` (`filterAccent`), `src/data/unlisted.ts` (`UNLISTED_SCENE_HEX` pair), `src/data/hoverSubject.test.ts` (one regex)

**Interfaces:**
- Produces: `identityHudCss(id: string): string` (returns `oklch(var(--ident-l) var(--ident-c) <deg>deg)`) · `SCENE_L/SCENE_C` unchanged as the DARK values plus `SCENE_L_LIGHT = 0.45` / `SCENE_C_LIGHT = 0.17` · `identitySceneHex(id: string, theme?: Theme): string` (default `"dark"` — every existing caller keeps its behaviour) · `UNLISTED_SCENE_HEX_BY_THEME: Record<Theme, number>`. Task 7 consumes `identitySceneHex(id, theme)` and the unlisted pair.

- [ ] **Step 1: Tests first.** In `identity.test.ts`: pin the dark pairs (`expect(HUD_L).toBe(0.74)` etc. — the dark byte-identity pin, the mainnet-ALLOWED move), add:

```ts
it("identityHudCss defers L/C to the CSS tokens so the HUD retints with zero re-renders", () => {
  const m0 = (METAGRAPHS as { id: string }[])[0];
  expect(identityHudCss(m0.id)).toMatch(/^oklch\(var\(--ident-l\) var\(--ident-c\) [\d.]+deg\)$/);
});
it("the scene lane themes explicitly, defaulting dark", () => {
  const m0 = (METAGRAPHS as { id: string }[])[0];
  expect(identitySceneHex(m0.id)).toBe(identitySceneHex(m0.id, "dark"));
  expect(identitySceneHex(m0.id, "light")).not.toBe(identitySceneHex(m0.id, "dark"));
});
```

Run → FAIL. Implement in `identity.ts`: `identityHudCss(id)` returns the template with `resolve(id)`'s hueDeg (fallback: the hash path's hue — same resolution `identityHudHex` uses; the CORE fallback becomes `"var(--primary)"` for the css variant); `identitySceneHex(id, theme: Theme = "dark")` renders `oklchToHex(theme === "light" ? SCENE_L_LIGHT : SCENE_L, theme === "light" ? SCENE_C_LIGHT : SCENE_C, hueDeg)` (light pair from spec §5: 0.45 / 0.17). Cache per theme (the file's existing memo idiom).

- [ ] **Step 2: Migrate `filterAccent`.** Its metagraph branch `hex(cfg.color)` → `identityHudCss(cfg.id)`. Every consumer already treats the return as a CSS colour string (verified in the multi-network work: style props, `currentColor`); run `components/useSubjectPairing.test.ts` + the full suite. **`hoverSubject.test.ts`'s DOR assertion** `toMatch(/^#[0-9a-f]{6}$/)` becomes `toMatch(/^oklch\(var\(--ident-l\)/)` — hoverSubject's metaSnap/meta cases follow whatever `identityHudHex`→`identityHudCss` migration lands there (Tooltip renders a CSS `color`, so the css form is correct; migrate those call sites too).

- [ ] **Step 3: The holdout grep.** `grep -rn "identityHudHex" src components app` — every remaining caller must consume a genuine hex (canvas drawing, THREE). Migrate CSS-consumed ones to `identityHudCss`; leave real-hex ones and note each in a one-line comment ("genuine hex: canvas"). `UNLISTED_SCENE_HEX` becomes the pair with `UNLISTED_SCENE_HEX = UNLISTED_SCENE_HEX_BY_THEME.dark` kept for existing callers (light value: `0x5a6478` — the same neutral family, ink-weight); update `unlisted.test.ts` references.

- [ ] **Step 4: Gate + commit** `feat(theme): identity HUD lane rides CSS tokens; scene lane themes explicitly`.

---

### Task 7: the engine re-thread

**Files:**
- Modify: `src/engine/Engine.ts` (subscription + `_refreshTheme()` + drift gate + bloom multiplier), `src/engine/scene/SceneContext.ts` (clear colour setter), scene adapters per Step 3's grep (each gains `setColors`)

**Interfaces:**
- Consumes: store `theme`, `identitySceneHex(id, theme)`, `UNLISTED_SCENE_HEX_BY_THEME` (Task 6).
- Produces: `Engine._refreshTheme(theme: Theme)` — internal; each touched adapter's `setColors(c: SceneColors)` (name it exactly `setColors` everywhere).

- [ ] **Step 1: The swap-in-place core.** In the Engine: keep the constructor's `colors` object and identity scene map as instance fields; subscribe to `store.theme` in the existing bridge (reference-change guard like `focusRung`); on change:

```ts
private _refreshTheme(theme: Theme) {
  // Swap IN PLACE: every per-frame writer (dimModel resolvers, instanced colour passes, tile
  // brightness) reads THIS object each frame, so mutating it repaints the scene next frame
  // with no further calls. Only construction-time consumers need the setColors fan-out below.
  Object.assign(this._colors, readSceneColors()); // CSS already flipped — tokens resolve new
  const ids = [...new Set([...this._metaIds, "dag"])];
  for (const id of ids) this._sceneColorMap[id] = new THREE.Color(identitySceneHex(id, theme)); // event-time
  // …then the construction-time survivors:
  this.ctx.setClearColor(this._colors.bg);
  for (const m of this._colorConsumers) m.setColors(this._colors); // registered at construction
  this._bloomMul = theme === "light" ? 0.15 : 1; // spec §5 — day look runs bloom near-off
}
```

Adapt names to the Engine's actual fields (read the constructor region 305–350 first); the bloom multiplier applies where the Engine writes the per-view bloom each frame (`viewPolicy` values × `_bloomMul` — strength only; radius/threshold unchanged). The `sceneColorsFor` map handed to HyperView/Globe/LedgerView must be the SAME object mutated here — if the constructor builds it inline, lift it to a field first. Gate the dev drift warning: `NET === "mainnet" && theme === "dark"` at construction (resolve theme there via `resolveTheme(parseThemePref(localStorage.getItem(THEME_KEY)), matchMedia("(prefers-color-scheme: dark)").matches)` — the store may not be corrected yet at construction time).

- [ ] **Step 2: SceneContext.** Add `setClearColor(bg: number)` (renderer clear + fog/background if set — read what the constructor does with `colors.bg` and mirror it).

- [ ] **Step 3: The copy hunt.** `grep -n "new THREE.Color(colors\.\|new THREE.Color(this.colors\|colors\.\w* )" src/engine/scene -r` plus a manual read of each adapter's constructor: every construction-time capture of a threaded colour (material `color`/`emissive` set once, shader uniform, starfield tint, TextLabel ink, glass fill) becomes a `setColors(c)` method that re-applies it; the Engine registers those adapters in `_colorConsumers`. The Ribbons' baked vertex colours re-push through their existing `?tune` `onChange` path; `TextLabel` gets a redraw call. **Do not touch per-frame paths** — they already read the swapped object.

- [ ] **Step 4: Verify live, hard.** Flip the toggle on EACH 3D view and LOOK (JPEG screenshots, both directions): the whole scene retints in one frame — clear colour to paper, nodes to ink, glass shading dark, bloom collapsing, starfield ~0 (its `setColors` sets light opacity ~0 — spec §5). **Any element still dark-styled after a flip is a stale copy — fix it, don't note it.** Full page reload after every engine edit (long-lived instance). Then flip during: a committed filter, a hovered row, the ledger with a pinned snapshot — state must survive untouched.

- [ ] **Step 5: Gate + commit** `feat(theme): engine re-thread — instant scene retint on flip`.

---

### Task 8: whole-feature verification + docs

**Files:** `CLAUDE.md` (theme section), `.superpowers/sdd/progress.md` (append)

- [ ] **Step 1: Suites + build.** `npx tsc --noEmit && npm test` (exit codes); `npm run build` clean.
- [ ] **Step 2: The matrix.** Theme × network spot (dark/light × mainnet/testnet minimum): accents correct per cell (dark-testnet magenta glow / light-testnet magenta ink); `/design` both themes; System state follows an emulated OS flip (chrome-devtools `emulate` colorScheme); persistence + no dark-flash on stored light; phone strip (toggle + NetworkSwitch both reachable at 360).
- [ ] **Step 3: Dark byte-identity.** On the bare URL, dark theme: spot-compare ≥8 computed token values and 2 scene screenshots against master's (checkout master in a scratch worktree or trust the pinned tests + eyeball). Any drift is a bug.
- [ ] **Step 4: Docs.** CLAUDE.md gets a short "Light/dark" section beside "The three networks": the color-scheme/light-dark() mechanism, the two-token number exception, THE one owner (ThemeController), the engine swap-in-place contract, the React-19 mount-state rule reference, and that sub-project 2 (per-view day-look refinement) is open. Append the outcome to `.superpowers/sdd/progress.md`.
- [ ] **Step 5: Commit** `docs: light/dark invariants; verification pass complete`.

---

## Self-review notes (already applied)

- **Spec coverage:** §1 → Tasks 2, 5; §2 → Tasks 1, 3, 4; §3 → Task 7; §4 → Task 6; §5 values → Tasks 2, 6, 7; §6 → Tasks 1, 5, 6 (tests) + 8 (live). Sub-project 2 deliberately has no task.
- **The light-dark() number exception** (found while planning): `--ident-l/c` are numbers and `light-dark()` is `<color>`-only — they use the guarded override pair, stated as THE one exception in the CSS comment.
- **The hydration trap is pre-empted**: ThemeToggle renders from the store pref, which is `"system"` on server AND first client render — no mismatch, no regenerated tree, the data-net stamp survives.
- **Type consistency:** `ThemePref`/`Theme`/`THEME_KEY` (Task 1) are consumed by name in Tasks 3, 4, 7; `setColors` is the one adapter method name; `identitySceneHex(id, theme?)` defaults dark so Task 6 lands green before Task 7 exists.
