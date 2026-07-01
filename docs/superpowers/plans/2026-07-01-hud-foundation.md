# HUD Refresh — Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the design-system foundation for the Instrument-Glass HUD refresh — Tailwind v4 + shadcn, the two-lane token layer, the shared glass primitives, the runtime identity-hue generator, and the `/design` styleguide — without changing how the current app looks.

**Architecture:** Adopt Tailwind v4 (CSS-first) + shadcn/Radix alongside the existing hand-written `app/styles/*.css` (nothing is retired this phase — the app stays shippable). The **structural lane** lives in `globals.css :root` as oklch shadcn CSS variables; the **identity lane** is a pure `src/palette/palette.ts` OKLCH generator surfaced through `/api/metagraphs` and applied at runtime as `--mg-<id>` custom properties. A new `/design` route renders the real tokens + primitives + live palette and is the screenshot-verified reference.

**Tech Stack:** Next 15 (App Router) · React 19 · TypeScript · Tailwind v4 (`@tailwindcss/postcss`) · shadcn/Radix · vitest (new, for the pure palette logic) · Zustand (existing).

## Global Constraints

- **Node ≥ 18.18** (`package.json engines`). Do not lower it.
- **Branch: `dev`.** All commits on `dev`. Commit as author `digitaltwinnn` (`git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" commit …`), short messages, ending with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Two colour lanes, never cross.** Structural (chrome + status) → shadcn CSS vars. Identity (per-metagraph) → the OKLCH generator / `--mg-<id>`. A metagraph hue never sets a chrome/status token and vice-versa.
- **Factual, never fabricated.** Identity hues derive from real metagraph ids (hash) or, later, real brand assets — never invented sample data. The `/design` page may use clearly-labelled illustrative placeholders for *primitive* demos, but the live-palette section must read the real `/api/metagraphs` output.
- **Path alias:** `@/*` → repo root (tsconfig). Import as `@/lib/…`, `@/components/…`, `@/src/…`.
- **Keep the app visually unchanged this phase** — the existing `app/styles/*.css` imports and every current panel must render exactly as before. Tailwind Preflight is the risk; verify with a before/after screenshot of `/`.
- **Headless screenshot verification** (no test runner for visuals) — the standard flags:
  ```bash
  google-chrome-stable --headless=new --no-sandbox \
    --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader \
    --window-size=1400,900 --hide-scrollbars \
    --virtual-time-budget=8000 --screenshot=/tmp/shot.png "http://localhost:3000/design"
  ```
  Ignore benign console noise (`mojo … rejected`, `PHONE_REGISTRATION_ERROR`, `BackForwardCache`).
- **Dev-server gotcha:** after big edits, restart clean — `pkill -f "next dev"` (NOT `-f next`), `rm -rf .next`, `nohup npm run dev &`.

**Source specs:** `docs/superpowers/specs/2026-07-01-00-overview.md`, `…-design-system-tokens-design.md`, `…-identity-hue-generator-design.md`.

**Out of scope this phase (later plans):** the interactive primitives that belong to their zones (Command/ToggleGroup/Avatar/Tooltip/ScrollArea), retiring any old CSS file, swapping `config.METAGRAPHS` hub colours / feeding the THREE engine (the engine token-bridge), and **brand extraction** (logo dominant-colour + `theme-color`) — the spec leaves the extraction approach open, so Phase 1 ships the fully-specified **hash-fallback tier + manual-pin override**; brand candidates slot in later behind the same `assignPalette` signature without touching call sites.

---

## File Structure

- `postcss.config.mjs` — **create** — Tailwind v4 PostCSS plugin.
- `components.json` — **create** — shadcn config (aliases, Tailwind v4, css vars).
- `lib/utils.ts` — **create** — shadcn `cn()` helper.
- `app/globals.css` — **modify** — prepend Tailwind entry; add the `:root` two-lane token layer, the `@theme inline` mapping, the `breathe` keyframe, and the `.ig-panel` glass surface. Existing `@import "./styles/*.css"` lines stay.
- `components/ui/card.tsx`, `components/ui/badge.tsx`, `components/ui/separator.tsx` — **create** (via shadcn CLI) then **modify** `card.tsx` to use the Instrument-Glass surface.
- `src/palette/palette.ts` — **create** — the pure OKLCH identity generator + `oklch→hex`.
- `src/palette/palette.test.ts` — **create** — vitest unit tests.
- `vitest.config.ts` — **create** — test config.
- `app/api/metagraphs/route.ts` — **modify** — attach a generated `hue` to each metagraph.
- `lib/mgVars.tsx` — **create** — runtime `--mg-<id>` applier (helper + `<MetagraphVars>` component).
- `app/design/page.tsx` — **create** — the styleguide route (grows across Tasks 2, 3, 5).

---

## Task 1: Tailwind v4 + shadcn init (visuals unchanged)

**Files:**
- Create: `postcss.config.mjs`, `components.json`, `lib/utils.ts`
- Modify: `app/globals.css` (first line only), `package.json` (deps via install)

**Interfaces:**
- Produces: a working Tailwind v4 build; the `cn(...)` helper at `@/lib/utils`; a `components.json` so `npx shadcn add …` runs non-interactively in later tasks.

- [ ] **Step 1: Capture the "before" baseline screenshot**

Ensure a dev server is running (`nohup npm run dev &` if needed), then:

Run:
```bash
google-chrome-stable --headless=new --no-sandbox --use-gl=angle --use-angle=swiftshader \
  --enable-unsafe-swiftshader --window-size=1400,900 --hide-scrollbars \
  --virtual-time-budget=8000 --screenshot=/tmp/before.png "http://localhost:3000"
```
Expected: `/tmp/before.png` written, showing the current HUD. Keep it for the Step 6 comparison.

- [ ] **Step 2: Install Tailwind v4 + shadcn peer deps**

Run:
```bash
npm install -D tailwindcss@^4 @tailwindcss/postcss@^4 tw-animate-css
npm install class-variance-authority clsx tailwind-merge lucide-react
```
Expected: installs succeed; `package.json` gains the deps.

- [ ] **Step 3: Create the PostCSS config**

Create `postcss.config.mjs`:
```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
export default config;
```

- [ ] **Step 4: Add the Tailwind entry + `cn` helper + shadcn config**

Prepend as the **very first line** of `app/globals.css` (before the existing `@import "./styles/00-base.css";`):
```css
@import "tailwindcss";
@import "tw-animate-css";
```

Create `lib/utils.ts`:
```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Create `components.json` (so the shadcn CLI is configured for later `add` calls):
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "app/globals.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

- [ ] **Step 5: Build to verify Tailwind compiles**

Run: `npm run build`
Expected: build succeeds. `/api/metagraphs` still marked `○` (Static, `10m`) in the route table — NOT `ƒ` (Dynamic). If the build fails on a missing Tailwind directive, confirm Step 4's first-line import landed.

- [ ] **Step 6: Screenshot `/` and confirm visuals are unchanged**

Restart clean (`pkill -f "next dev"; rm -rf .next; nohup npm run dev &`), wait for the server, then:

Run:
```bash
google-chrome-stable --headless=new --no-sandbox --use-gl=angle --use-angle=swiftshader \
  --enable-unsafe-swiftshader --window-size=1400,900 --hide-scrollbars \
  --virtual-time-budget=8000 --screenshot=/tmp/after.png "http://localhost:3000"
```
Then Read both `/tmp/before.png` and `/tmp/after.png`.
Expected: the HUD looks the same — panels, filter chips, top bar, colours all intact. If Preflight has stripped panel/button styling, add `@layer base { /* re-assert only what regressed */ }` in `globals.css`, or confirm the existing `app/styles/*.css` still loads after the Tailwind import. Do not proceed until parity is confirmed.

- [ ] **Step 7: Commit**

Run:
```bash
git add -A && git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" \
  commit -m "chore: init Tailwind v4 + shadcn (visuals unchanged)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Structural token layer + minimal `/design` harness

**Files:**
- Modify: `app/globals.css` (add `:root` tokens, `@theme inline`, `breathe` keyframe, `.ig-panel`)
- Create: `app/design/page.tsx`

**Interfaces:**
- Produces: CSS variables `--background --foreground --muted-foreground --primary --ring --accent --destructive --success --core-l0 --core-l1 --border --radius` (structural lane) reused by every later primitive; Tailwind colour utilities `bg-primary`, `text-success`, `bg-core-l0`, etc.; the `breathe` animation; the `.ig-panel` glass surface class; the `/design` route as the screenshot harness.

- [ ] **Step 1: Add the two-lane token layer to `globals.css`**

Append to `app/globals.css` (after the `@import` lines). Values are a tuned first pass — flagged for the spec's "exact oklch" follow-up:
```css
/* ── Structural lane (chrome + status) — shadcn CSS variables in oklch ── */
:root {
  --radius: 14px;

  --background: oklch(0.09 0.02 265);        /* #05060e app bg */
  --foreground: oklch(0.94 0.02 255);        /* #e8eefc text */
  --muted-foreground: oklch(0.66 0.04 265);  /* #8a96b8 muted */

  --card: oklch(0.15 0.03 265);
  --card-foreground: var(--foreground);
  --popover: var(--card);
  --popover-foreground: var(--foreground);

  --primary: oklch(0.88 0.13 195);           /* accent cyan #2af5ff — the sole live/accent signal */
  --primary-foreground: oklch(0.14 0.02 265);
  --ring: oklch(0.88 0.13 195);
  --accent: var(--primary);
  --accent-foreground: var(--primary-foreground);

  --destructive: oklch(0.63 0.20 25);        /* warn red */
  --destructive-foreground: var(--foreground);

  /* Added beyond shadcn defaults (structural, still not identity) */
  --success: oklch(0.80 0.15 165);           /* ready / green */
  --core-l0: oklch(0.66 0.16 265);           /* DAG L0 blue #5b8cff */
  --core-l1: oklch(0.66 0.19 300);           /* DAG L1 violet #b06bff */

  --border: rgba(90, 140, 255, 0.22);        /* matches the existing --panel-border */
  --input: var(--border);
  --muted: oklch(0.18 0.03 265);
  --secondary: var(--muted);
  --secondary-foreground: var(--foreground);
}

/* ── Tailwind v4 theme mapping — expose the vars as utilities ── */
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-success: var(--success);
  --color-core-l0: var(--core-l0);
  --color-core-l1: var(--core-l1);
  --color-border: var(--border);
  --color-ring: var(--ring);
  --radius-lg: var(--radius);
  --radius-md: calc(var(--radius) - 4px);
  --radius-sm: calc(var(--radius) - 8px);
  --animate-breathe: breathe 1.5s ease-in-out infinite;
}

@keyframes breathe {
  0%, 100% { opacity: 0.55; }
  50%      { opacity: 1; }
}

/* ── Instrument-Glass surface — the shared panel frame + left accent spine ── */
@layer components {
  .ig-panel {
    position: relative;
    background: linear-gradient(180deg, rgba(20, 26, 46, 0.78), rgba(10, 14, 28, 0.72));
    border: 1px solid var(--border);
    border-radius: var(--radius);
    backdrop-filter: blur(12px);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 8px 30px rgba(0, 0, 0, 0.35);
  }
  .ig-panel::before {
    content: "";
    position: absolute;
    left: 0; top: 10px; bottom: 10px;
    width: 2px;
    border-radius: 2px;
    /* structural cyan by default; identity panels set --spine: var(--mg) */
    background: var(--spine, var(--primary));
    opacity: 0.8;
  }
}
```

- [ ] **Step 2: Create the minimal `/design` harness rendering the tokens**

Create `app/design/page.tsx`:
```tsx
const STRUCTURAL: { name: string; var: string }[] = [
  { name: "background", var: "--background" },
  { name: "foreground", var: "--foreground" },
  { name: "muted-foreground", var: "--muted-foreground" },
  { name: "primary / accent (live cyan)", var: "--primary" },
  { name: "destructive (warn)", var: "--destructive" },
  { name: "success (ready)", var: "--success" },
  { name: "core-l0 (blue)", var: "--core-l0" },
  { name: "core-l1 (violet)", var: "--core-l1" },
];

export default function DesignPage() {
  return (
    <main className="min-h-screen bg-background text-foreground p-8 font-sans">
      <h1 className="text-2xl font-semibold mb-1">Instrument-Glass styleguide</h1>
      <p className="text-muted-foreground mb-8">
        Live tokens + primitives — the screenshot-verified design reference.
      </p>

      <section className="mb-10">
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-3">
          Structural lane
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STRUCTURAL.map((t) => (
            <div key={t.var} className="ig-panel p-3">
              <div
                className="h-10 rounded-md mb-2"
                style={{ background: `var(${t.var})` }}
              />
              <div className="text-xs font-mono text-muted-foreground">{t.name}</div>
              <div className="text-xs font-mono">{t.var}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Screenshot `/design` and verify the tokens render**

Restart clean, then:

Run:
```bash
google-chrome-stable --headless=new --no-sandbox --use-gl=angle --use-angle=swiftshader \
  --enable-unsafe-swiftshader --window-size=1400,900 --hide-scrollbars \
  --virtual-time-budget=6000 --screenshot=/tmp/design.png "http://localhost:3000/design"
```
Then Read `/tmp/design.png`.
Expected: eight swatch cards on the dark bg — cyan reads as the accent, blue/violet distinct, green for success, red for destructive. Each card shows the faint glass surface with a cyan left spine (`.ig-panel::before`). If a swatch is blank, the `@theme`/`:root` var name is mismatched — fix and re-shoot.

- [ ] **Step 4: Commit**

Run:
```bash
git add -A && git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" \
  commit -m "feat(design): structural token layer + /design harness

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Instrument-Glass Card + Badge + Separator primitives

**Files:**
- Create (CLI): `components/ui/card.tsx`, `components/ui/badge.tsx`, `components/ui/separator.tsx`
- Modify: `components/ui/card.tsx` (Instrument-Glass surface), `app/design/page.tsx` (render them)

**Interfaces:**
- Consumes: `.ig-panel`, the structural tokens, and `cn` from Task 1–2.
- Produces: themed `<Card>`, `<CardHeader>`, `<CardTitle>`, `<CardContent>`, `<Badge variant=…>`, `<Separator>` — the shared atoms every later zone reuses.

- [ ] **Step 1: Add the primitives via the shadcn CLI**

Run: `npx shadcn@latest add card badge separator --yes`
Expected: creates `components/ui/card.tsx`, `badge.tsx`, `separator.tsx` (and installs `@radix-ui/react-separator`). Non-interactive because `components.json` exists.

- [ ] **Step 2: Re-skin `Card` as the Instrument-Glass surface**

In `components/ui/card.tsx`, the **root** `Card` component renders a `<div data-slot="card" className={cn("…", className)}>`. The exact default class string varies by CLI version (something like `bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm`). Replace **only that root `Card`'s** class string (the first `cn(...)` in the file, the one alongside `data-slot="card"`) — leave `CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`CardFooter` exactly as generated. The root `cn(...)` becomes:
```tsx
      className={cn(
        "ig-panel text-card-foreground flex flex-col gap-4 py-4 pl-5 pr-4",
        className
      )}
```
(The `pl-5` clears the accent spine; `.ig-panel` supplies the glass bg + border + radius, so the shadcn `bg-card`/`border`/`rounded`/`shadow` utilities are intentionally dropped from the root.)

- [ ] **Step 3: Render the primitives on `/design`**

In `app/design/page.tsx`, add imports at the top:
```tsx
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
```
Add this section before the closing `</main>`:
```tsx
      <section className="mb-10">
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-3">
          Primitives
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle>Glass card</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Translucent glass surface with a structural-cyan accent spine.
              <Separator className="my-3" />
              <div className="flex flex-wrap gap-2">
                <Badge>default</Badge>
                <Badge variant="secondary">secondary</Badge>
                <Badge variant="destructive">down</Badge>
                <Badge variant="outline">outline</Badge>
              </div>
            </CardContent>
          </Card>
          <Card style={{ ["--spine" as string]: "var(--success)" }}>
            <CardHeader>
              <CardTitle>Spine override</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              The accent spine reads <code className="font-mono">--spine</code>; identity
              panels point it at <code className="font-mono">--mg</code>. Here it is success-green.
            </CardContent>
          </Card>
        </div>
      </section>
```

- [ ] **Step 4: Screenshot and verify the glass + spine + badges**

Restart clean, screenshot `/design` as in Task 2 Step 3.
Then Read `/tmp/design.png`.
Expected: two glass cards — the first with a cyan spine, the second with a green spine — plus the four badge variants. Glass blur + inner highlight visible. If the spine is missing, confirm `pl-5` isn't covering it and `.ig-panel::before` is in `@layer components`.

- [ ] **Step 5: Commit**

Run:
```bash
git add -A && git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" \
  commit -m "feat(design): Instrument-Glass Card + Badge + Separator

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Identity-hue generator (`palette.ts`) — TDD

**Files:**
- Create: `src/palette/palette.ts`, `src/palette/palette.test.ts`, `vitest.config.ts`
- Modify: `package.json` (add `test` script + vitest dev dep)

**Interfaces:**
- Produces:
  ```ts
  export interface PaletteEntry { id: string; hueDeg: number; oklch: string; hex: string; }
  // Deterministic: identical input set → identical id→entry map, independent of array order.
  export function assignPalette(ids: string[], pins?: Record<string, number>): Map<string, PaletteEntry>;
  export function oklchToHex(L: number, C: number, hDeg: number): string; // "#rrggbb"
  export const IDENTITY_L = 0.80;
  export const IDENTITY_C = 0.15;
  ```
  `assignPalette` is consumed by Task 5 (the API route) and later the engine token-bridge.

- [ ] **Step 1: Add vitest + the test script**

Run: `npm install -D vitest`

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
```

Add to `package.json` `"scripts"`:
```json
    "test": "vitest run"
```

- [ ] **Step 2: Write the failing tests**

Create `src/palette/palette.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { assignPalette, oklchToHex, IDENTITY_L, IDENTITY_C } from "./palette";

// The reserved structural hue centres and the ±16° guard band (spec).
const RESERVED = [25, 90, 165, 195, 265, 300];
const GUARD = 16;
function inGuardBand(h: number): boolean {
  return RESERVED.some((r) => {
    const d = Math.abs(((h - r + 180 + 360) % 360) - 180);
    return d < GUARD;
  });
}

const IDS = [
  "DAG0eQr94qUQSUhmYGNXt6CoBKWu5K6htvRMGC6M",
  "DAG7X5idd4aLfp4XC6WQdG1eDfR3LGPVEwtUUB2W",
  "DAG0S16WDgdAvh8VvroR6MWLdjmHYdzAF5S181xh",
  "DAG7Ghth1WhWK83SB3MtXnnHYZbCsmiRTwJrgaW1",
  "DAG06z64ifT2HzXoHfMexRfrcnpYFEwMqjFiPKze",
];

describe("assignPalette", () => {
  it("keeps every hue out of the reserved guard bands", () => {
    for (const e of assignPalette(IDS).values()) {
      expect(inGuardBand(e.hueDeg), `hue ${e.hueDeg} for ${e.id}`).toBe(false);
    }
  });

  it("is deterministic and order-independent", () => {
    const a = assignPalette(IDS);
    const b = assignPalette([...IDS].reverse());
    for (const id of IDS) {
      expect(b.get(id)!.hueDeg).toBe(a.get(id)!.hueDeg);
    }
  });

  it("gives distinct ids distinct hues (no collisions within budget)", () => {
    const hues = [...assignPalette(IDS).values()].map((e) => e.hueDeg);
    expect(new Set(hues).size).toBe(IDS.length);
  });

  it("honours a manual pin exactly", () => {
    const pinned = assignPalette(IDS, { [IDS[0]]: 220 });
    expect(pinned.get(IDS[0])!.hueDeg).toBe(220);
  });

  it("renders glow-tuned L/C in the oklch string", () => {
    const e = [...assignPalette(IDS).values()][0];
    expect(e.oklch).toBe(`oklch(${IDENTITY_L} ${IDENTITY_C} ${e.hueDeg}deg)`);
  });
});

describe("oklchToHex", () => {
  it("returns a 7-char #hex", () => {
    expect(oklchToHex(0.8, 0.15, 120)).toMatch(/^#[0-9a-f]{6}$/);
  });
  it("maps distinct hues to distinct colours", () => {
    expect(oklchToHex(0.8, 0.15, 40)).not.toBe(oklchToHex(0.8, 0.15, 220));
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './palette'` / exports undefined.

- [ ] **Step 4: Implement `palette.ts`**

Create `src/palette/palette.ts`:
```ts
// Identity-lane colour generator. Pure, deterministic. See
// docs/superpowers/specs/2026-07-01-identity-hue-generator-design.md.
// Phase 1 ships the hash-fallback tier + manual pins; brand extraction slots in
// later behind this same signature (an internal candidate source), no call-site change.

export const IDENTITY_L = 0.8;
export const IDENTITY_C = 0.15;

export interface PaletteEntry {
  id: string;
  hueDeg: number;
  oklch: string;
  hex: string;
}

// Allowed hue zones (deg): the gaps between the reserved structural guard-bands
// (red 25 · amber 90 · green 165 · cyan 195 · blue 265 · violet 300, ±16°).
// The 41–149 band is split by the amber guard into 41–74 and 106–149.
const ALLOWED: [number, number][] = [
  [41, 74],
  [106, 149],
  [211, 249],
  [316, 369], // wraps past 360; normalised on read
];

// Discrete slots stepped ~8° through the allowed zones (~20 distinct at fixed L/C).
const SLOT_STEP = 8;
const SLOTS: number[] = (() => {
  const out: number[] = [];
  for (const [lo, hi] of ALLOWED) {
    for (let h = lo; h < hi; h += SLOT_STEP) out.push(((h % 360) + 360) % 360);
  }
  return out;
})();

// FNV-1a 32-bit — stable hash of a metagraph id.
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function entry(id: string, hueDeg: number): PaletteEntry {
  return {
    id,
    hueDeg,
    oklch: `oklch(${IDENTITY_L} ${IDENTITY_C} ${hueDeg}deg)`,
    hex: oklchToHex(IDENTITY_L, IDENTITY_C, hueDeg),
  };
}

// Deterministic assignment: process ids in a stable order (by id), each takes its
// hashed slot, or linear-probes to the next free slot (de-collision). Pins win outright.
export function assignPalette(
  ids: string[],
  pins: Record<string, number> = {},
): Map<string, PaletteEntry> {
  const out = new Map<string, PaletteEntry>();
  const taken = new Set<number>();

  for (const id of ids) {
    if (id in pins) taken.add(pins[id]); // reserve pinned hues so probing avoids them
  }

  for (const id of [...ids].sort()) {
    if (id in pins) {
      out.set(id, entry(id, pins[id]));
      continue;
    }
    const start = hash32(id) % SLOTS.length;
    let slotHue = SLOTS[start];
    for (let i = 0; i < SLOTS.length; i++) {
      const cand = SLOTS[(start + i) % SLOTS.length];
      if (!taken.has(cand)) {
        slotHue = cand;
        break;
      }
    }
    taken.add(slotHue);
    out.set(id, entry(id, slotHue));
  }
  return out;
}

// OKLCH → sRGB hex. Standard OKLab → linear sRGB → gamma pipeline (Björn Ottosson).
export function oklchToHex(L: number, C: number, hDeg: number): string {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  let r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  let bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  const gamma = (u: number) =>
    u <= 0.0031308 ? 12.92 * u : 1.055 * Math.pow(u, 1 / 2.4) - 0.055;
  const ch = (u: number) => {
    const v = Math.round(Math.min(1, Math.max(0, gamma(u))) * 255);
    return v.toString(16).padStart(2, "0");
  };
  return `#${ch(r)}${ch(g)}${ch(bl)}`;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all 7 assertions green. If the guard-band test fails, a slot boundary is too close to a reserved hue — narrow the `ALLOWED` zone edge inward and re-run.

- [ ] **Step 6: Commit**

Run:
```bash
git add -A && git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" \
  commit -m "feat(palette): deterministic OKLCH identity-hue generator + tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Wire the palette into `/api/metagraphs` + runtime `--mg` + live styleguide

**Files:**
- Modify: `app/api/metagraphs/route.ts` (attach `hue` to each metagraph)
- Create: `lib/mgVars.tsx` (runtime applier)
- Modify: `app/design/page.tsx` (live palette section)

**Interfaces:**
- Consumes: `assignPalette` (Task 4).
- Produces: each metagraph in the `/api/metagraphs` response carries `hue: { deg, oklch, hex }`; `applyMetagraphVars(entries)` sets `--mg-<id>` on `:root`; `<MetagraphVars entries={…} />` applies them from a client component.

- [ ] **Step 1: Attach a generated hue to each metagraph in the route**

In `app/api/metagraphs/route.ts`:

Add near the top imports:
```ts
import { assignPalette } from "@/src/palette/palette";
```

Extend the `Metagraph` type (around line 28-30) to carry the hue:
```ts
  id: string; name: string; symbol: string; description: string;
  siteUrl: string; iconUrl: string; nodes: MetaNode[];
  hue?: { deg: number; oklch: string; hex: string };
```

Add a helper and apply it to whichever list is returned. Add this function above the `GET` handler:
```ts
function withHues(list: Metagraph[]): Metagraph[] {
  const palette = assignPalette(list.map((m) => m.id));
  return list.map((m) => {
    const e = palette.get(m.id);
    return e ? { ...m, hue: { deg: e.hueDeg, oklch: e.oklch, hex: e.hex } } : m;
  });
}
```

In the `GET` handler, wrap both return paths so live **and** baked responses get hues. Change:
```ts
    return NextResponse.json(await getLive());
```
to:
```ts
    const live = await getLive();
    return NextResponse.json({ ...live, metagraphs: withHues(live.metagraphs) });
```
and change the fallback:
```ts
    return NextResponse.json(baked); // live fetch failed/empty — serve the bake
```
to:
```ts
    return NextResponse.json({ ...baked, metagraphs: withHues(baked.metagraphs) }); // bake + hues
```

- [ ] **Step 2: Verify the route emits hues**

Restart clean, then:

Run: `curl -s http://localhost:3000/api/metagraphs | head -c 600`
Expected: JSON where the first metagraph object includes a `"hue":{"deg":…,"oklch":"oklch(0.8 0.15 …deg)","hex":"#…"}`. If `hue` is absent, confirm `withHues` wraps the returned object and the import path `@/src/palette/palette` resolves.

- [ ] **Step 3: Build to confirm the route stays statically cached**

Run: `npm run build`
Expected: build succeeds; `/api/metagraphs` still `○` (Static, `10m`) in the route table — the palette is pure/synchronous so it does not make the route dynamic. If it flipped to `ƒ`, nothing in this task should have caused it — re-check you didn't add a request-time read.

- [ ] **Step 4: Create the runtime `--mg` applier**

Create `lib/mgVars.tsx`:
```tsx
"use client";
import { useEffect } from "react";

export interface MgHue {
  id: string;
  hue?: { deg: number; oklch: string; hex: string };
}

// Sets --mg-<id> on :root so any chip/dot/thread/spine can read its metagraph's
// identity hue via var(--mg-<id>). Structural tokens are never touched (two-lane rule).
export function applyMetagraphVars(list: MgHue[]): void {
  const root = document.documentElement;
  for (const m of list) {
    if (m.hue) root.style.setProperty(`--mg-${m.id}`, m.hue.oklch);
  }
}

export function MetagraphVars({ entries }: { entries: MgHue[] }) {
  useEffect(() => {
    applyMetagraphVars(entries);
  }, [entries]);
  return null;
}
```

- [ ] **Step 5: Render the live palette on `/design`**

`app/design/page.tsx` is a server component, so it can fetch. Add this section before `</main>` and a small server fetch at the top of the component body:
```tsx
  const origin =
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000";
  let metas: { id: string; symbol: string; hue?: { deg: number; oklch: string; hex: string } }[] = [];
  try {
    const r = await fetch(`${origin}/api/metagraphs`, { cache: "no-store" });
    metas = (await r.json()).metagraphs ?? [];
  } catch {
    metas = [];
  }
```
Make the component `async`:
```tsx
export default async function DesignPage() {
```
Add the section:
```tsx
      <section className="mb-10">
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-3">
          Identity lane — live generated hues
        </h2>
        {metas.length === 0 ? (
          <p className="text-sm text-muted-foreground">No metagraph data (API unreachable).</p>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {metas.map((m) => (
              <div key={m.id} className="ig-panel p-3" style={{ ["--spine" as string]: m.hue?.oklch }}>
                <div className="h-10 rounded-md mb-2" style={{ background: m.hue?.oklch }} />
                <div className="text-xs font-mono">{m.symbol}</div>
                <div className="text-[10px] font-mono text-muted-foreground">
                  {m.hue ? `${m.hue.deg}°` : "—"}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
```
This section doubles as proof the two-lane rule holds: each card's spine reads the **identity** hue (`--spine` = the metagraph oklch) while the structural swatches above stay chrome.

- [ ] **Step 6: Screenshot `/design` and verify distinct, guard-banded hues**

Restart clean, screenshot `/design` (Task 2 Step 3 command).
Then Read `/tmp/design.png`.
Expected: a row of ~10 metagraph swatches, each a **distinct** glowing hue with its ticker + degree, none landing on cyan/blue/violet/green/red/amber (the structural bands). Each card's left spine matches its swatch (identity), visually separate from the cyan structural spine on the primitives above. If two swatches look identical, that's a real de-collision gap — verify against `npm test` (it should already guard this).

- [ ] **Step 7: Commit**

Run:
```bash
git add -A && git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" \
  commit -m "feat(palette): serve generated hues from /api/metagraphs + runtime --mg + live styleguide

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Done-when (Phase 1 acceptance)

- `npm run build` is clean; `/api/metagraphs` stays `○` (Static, `10m`).
- `npm test` passes (palette generator).
- `/` renders visually identical to before Tailwind was added.
- `/design` renders: the structural token swatches, the glass Card/Badge/Separator primitives (cyan + green spines), and the live identity-hue row (distinct, guard-banded, ticker-labelled).
- The two lanes are visibly separate on `/design` and never share a variable.

## Follow-ups (next phase plans, per the overview build order)

- Brand extraction (logo dominant-colour + `theme-color`) feeding `assignPalette` candidates — its own plan (extraction approach still open in the spec).
- Zone migrations, each adding its shadcn primitive (Command/ToggleGroup/Avatar/Tooltip/ScrollArea) and **retiring the matching `app/styles/*.css`** file: command bar → right rail + cards → left rail + bottom strip → scene tie-in → states/first-load → responsive.
- The engine token-bridge: swap `config.METAGRAPHS` hub colours to the generated hues and feed structural tokens into the THREE materials.
```
