# Placeholder-View Blueprint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the three scaffolded ("SOON") views — Network, Transactions, Staking — the spec's **center schematic blueprint**: a faint, abstract wireframe of what each view will become, explicitly labelled `preview · in development`, on an empty scene (no fabricated data, no numbers).

**Architecture:** A single client component `Blueprint` reads `store.mode`, renders nothing for the three 3D views, and for each placeholder view renders a centered `<figure>` with that view's static SVG schematic + the `preview · in development` label. It mounts in `app/page.tsx` alongside the other HUD overlays. The 3D canvas is faded out for the flat placeholder views (it currently just idles on the last scene) so the blueprint sits on a genuinely empty backdrop. The LiveStrip is intentionally KEPT (user override of the spec's "no LiveStrip") — no change needed; `BottomStream` already renders it in every view.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Zustand, plain CSS in `app/styles/*`, chrome-devtools MCP for visual verification.

## Global Constraints

- **Scaffolded views are `status`, `transactions`, `staking`.** The 3D views are `hyper`, `geo`, `ledger`. "Flat" = `mode` not in the 3D set.
- **Factual, never fabricated:** the blueprint is explicitly labelled `preview · in development`; it carries **no numbers, no real values** — it's a schematic of the future view, rendered in **neutral structural chrome** (blueprint = chrome, not identity), with flow/accent lines in **cyan** (`--core`) only.
- **Two colour lanes:** the blueprint is structural only — no per-metagraph identity hues.
- **Keep the LiveStrip** in placeholder views (user override of the spec). Do NOT remove `BottomStream`/`LiveStrip` for these modes.
- **Orientation copy stays on the LEFT rail** (existing `PlaceholderPanel`) — the spec's "move it to a right-rail view-default" is superseded and is handled separately by the forthcoming "about this view" left-rail system. This plan does NOT touch the left rail.
- **Per-view behaviour is allow-list:** the blueprint renders ONLY for the three placeholder modes; the 3D views must be untouched.
- **Dev-server discipline:** ONE shared `next dev`; visual verification via chrome-devtools MCP; `next build` is a coordinator-only phase-boundary check.

---

### Task 1: Blueprint component + mount + empty scene + Network schematic

**Files:**
- Create: `components/Blueprint.tsx`
- Create: `app/styles/17-blueprint.css` (and import it wherever the other `app/styles/*.css` are aggregated — check `app/globals.css` for the `@import` list and add it there)
- Modify: `components/SceneCanvas.tsx` (fade the canvas out on flat placeholder views)
- Modify: `app/page.tsx` (mount `<Blueprint />`)

**Interfaces:**
- Consumes: `useStore((s) => s.mode)`, `Mode` from `@/src/store/store`.
- Produces: `export default function Blueprint()`; an internal `SCHEMATIC: Partial<Record<Mode, ReactNode>>` map (Network filled this task; Transactions/Staking added in Task 2).

- [ ] **Step 1: Fade the canvas out on flat views**

In `components/SceneCanvas.tsx`, read the mode and drop `scene-in` for placeholder views so the scene is genuinely empty behind the blueprint:

```tsx
import { useStore } from "@/src/store/store";
// …
const mode = useStore((s) => s.mode);
const is3D = mode === "hyper" || mode === "geo" || mode === "ledger";
// …
return <canvas ref={canvasRef} className={"scene-canvas" + (phase === "live" && is3D ? " scene-in" : "")} />;
```

(`useStore` is already imported; add the `mode`/`is3D` lines. `scene-canvas` fades via its existing `opacity` transition — 00-base.css.)

- [ ] **Step 2: Create the Blueprint component with the Network schematic**

Create `components/Blueprint.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import { useStore } from "@/src/store/store";
import type { Mode } from "@/src/store/store";

// The center schematic BLUEPRINT for the not-yet-built ("SOON") views. A faint, abstract wireframe
// of what each view will become — explicitly labelled `preview · in development` so it never reads
// as live data (no numbers, no real values). Structural chrome only (blueprint = chrome, not
// identity); accent/flow lines in cyan. Renders on the empty scene (SceneCanvas fades out for flat
// views). Not shown for the three 3D views.

// Network → a health GRID of node cells (a couple dashed = waiting, one hollow = offline —
// schematic states, not counts).
function NetworkSchematic() {
  const cells = [];
  const cols = 8, rows = 4, gap = 26, r = 7;
  let i = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++, i++) {
      const cx = x * gap + r, cy = y * gap + r;
      const dashed = i === 9 || i === 22;   // "waiting"
      const hollow = i === 17;              // "offline"
      cells.push(
        <rect
          key={i}
          x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={3}
          className={"bp-cell" + (dashed ? " bp-cell--wait" : "") + (hollow ? " bp-cell--off" : "")}
        />,
      );
    }
  }
  return (
    <svg viewBox={`-6 -6 ${cols * gap} ${rows * gap}`} className="bp-svg" role="img" aria-label="Network health grid preview">
      {cells}
    </svg>
  );
}

const SCHEMATIC: Partial<Record<Mode, ReactNode>> = {
  status: <NetworkSchematic />,
};

const CAPTION: Partial<Record<Mode, string>> = {
  status: "Network health — validator uptime, node states and version spread across the network.",
  transactions: "Transactions — $DAG and metagraph currencies moving between addresses, plus lookup and economics.",
  staking: "Delegated staking — who is staked to which validators, total delegated, and rewards flowing back.",
};

export default function Blueprint() {
  const mode = useStore((s) => s.mode) as Mode;
  const art = SCHEMATIC[mode];
  if (!art) return null; // 3D views + any placeholder without art yet
  return (
    <figure id="blueprint" aria-hidden={false}>
      <div className="bp-art">{art}</div>
      <figcaption className="bp-cap">
        <span className="bp-tag">preview · in development</span>
        <span className="bp-line">{CAPTION[mode]}</span>
      </figcaption>
    </figure>
  );
}
```

- [ ] **Step 3: Blueprint CSS**

Create `app/styles/17-blueprint.css`:

```css
/* Center schematic blueprint for the SOON views — faint structural chrome, cyan accents. Sits
   above the (faded-out) canvas, below the HUD chrome. */
#blueprint {
  position: fixed; inset: 0; z-index: 6;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 22px; pointer-events: none; padding: 0 24px;
}
.bp-art { opacity: 0.5; }
.bp-svg { width: min(46vw, 420px); height: auto; overflow: visible; }
.bp-cell { fill: none; stroke: color-mix(in oklch, var(--core) 40%, var(--panel-border)); stroke-width: 1.25; }
.bp-cell--wait { stroke-dasharray: 3 3; stroke: color-mix(in oklch, var(--core) 55%, transparent); }
.bp-cell--off { stroke: var(--panel-border); opacity: 0.5; }
.bp-cap { display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; max-width: 380px; }
.bp-tag {
  font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
  color: color-mix(in oklch, var(--core) 80%, #fff); opacity: 0.85;
}
.bp-line { font-size: 13px; color: var(--muted); line-height: 1.5; }
```

Then add its import to the aggregator (check `app/globals.css` — it `@import`s `styles/00-base.css` … `styles/16-responsive-shell.css`; add `@import "styles/17-blueprint.css";` in sequence).

- [ ] **Step 4: Mount in page.tsx**

In `app/page.tsx`, import and mount `Blueprint` (place it after `SceneCanvas`, before `TopBar`, so z-order/DOM order is scene → blueprint → HUD):

```tsx
import Blueprint from "@/components/Blueprint";
// … inside <main>, right after <SceneCanvas />:
<Blueprint />
```

- [ ] **Step 5: Verify types**

Run: `npx tsc --noEmit` — Expected: clean.

- [ ] **Step 6: Visual verify (Network)**

chrome-devtools MCP: open `http://localhost:3000`, click the **Network** (◉) view glyph in the top bar. Confirm: the 3D scene is gone (empty backdrop), a faint **health-grid** wireframe sits centered with two dashed cells + one hollow cell, and below it the **`preview · in development`** tag + the one-line caption. The LiveStrip still runs along the bottom. Switch back to Hypergraph — the 3D scene returns and the blueprint disappears.

- [ ] **Step 7: Commit**

```bash
git add components/Blueprint.tsx app/styles/17-blueprint.css app/globals.css components/SceneCanvas.tsx app/page.tsx
git commit -m "feat(views): center blueprint for the SOON views + empty scene (Network)"
```

---

### Task 2: Transactions + Staking schematics

**Files:**
- Modify: `components/Blueprint.tsx` (add two schematics + register them in `SCHEMATIC`)
- Modify: `app/styles/17-blueprint.css` (styles for flow arrows + delegation lines)

**Interfaces:**
- Consumes: the `SCHEMATIC` map + `.bp-svg` frame from Task 1.
- Produces: `TransactionsSchematic`, `StakingSchematic` added to `SCHEMATIC` under `transactions` / `staking`.

- [ ] **Step 1: Add the two schematics**

In `components/Blueprint.tsx`, add above the `SCHEMATIC` map:

```tsx
// Transactions → an address/flow graph (address nodes + dashed flow arrows between them).
function TransactionsSchematic() {
  const nodes = [
    { x: 20, y: 30 }, { x: 120, y: 16 }, { x: 210, y: 54 },
    { x: 70, y: 96 }, { x: 168, y: 110 }, { x: 30, y: 150 }, { x: 140, y: 168 },
  ];
  const edges: [number, number][] = [[0, 1], [1, 2], [0, 3], [3, 4], [4, 2], [3, 5], [5, 6], [6, 4]];
  return (
    <svg viewBox="0 0 230 190" className="bp-svg" role="img" aria-label="Transaction flow preview">
      <defs>
        <marker id="bp-arrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L8 4 L0 8" className="bp-arrowhead" />
        </marker>
      </defs>
      {edges.map(([a, b], i) => (
        <line key={i} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y}
          className="bp-flow" markerEnd="url(#bp-arrow)" />
      ))}
      {nodes.map((n, i) => (
        <circle key={i} cx={n.x} cy={n.y} r={7} className="bp-addr" />
      ))}
    </svg>
  );
}

// Staking → validators (sized) with delegation lines converging from smaller staker dots.
function StakingSchematic() {
  const validators = [{ x: 70, y: 60, r: 16 }, { x: 170, y: 120, r: 13 }];
  const stakers = [
    { x: 14, y: 20, v: 0 }, { x: 20, y: 96, v: 0 }, { x: 120, y: 22, v: 0 },
    { x: 220, y: 60, v: 1 }, { x: 210, y: 170, v: 1 }, { x: 110, y: 176, v: 1 }, { x: 60, y: 150, v: 0 },
  ];
  return (
    <svg viewBox="0 0 230 190" className="bp-svg" role="img" aria-label="Delegated staking preview">
      {stakers.map((s, i) => {
        const val = validators[s.v];
        return <line key={"l" + i} x1={s.x} y1={s.y} x2={val.x} y2={val.y} className="bp-delegate" />;
      })}
      {stakers.map((s, i) => <circle key={"s" + i} cx={s.x} cy={s.y} r={3.5} className="bp-staker" />)}
      {validators.map((v, i) => <circle key={"v" + i} cx={v.x} cy={v.y} r={v.r} className="bp-validator" />)}
    </svg>
  );
}
```

Register them:

```tsx
const SCHEMATIC: Partial<Record<Mode, ReactNode>> = {
  status: <NetworkSchematic />,
  transactions: <TransactionsSchematic />,
  staking: <StakingSchematic />,
};
```

- [ ] **Step 2: Styles for the new marks**

Append to `app/styles/17-blueprint.css`:

```css
/* Transactions flow graph */
.bp-addr { fill: none; stroke: color-mix(in oklch, var(--core) 40%, var(--panel-border)); stroke-width: 1.25; }
.bp-flow { stroke: color-mix(in oklch, var(--core) 55%, transparent); stroke-width: 1.25; stroke-dasharray: 4 4; fill: none; }
.bp-arrowhead { fill: none; stroke: color-mix(in oklch, var(--core) 55%, transparent); stroke-width: 1; }
/* Staking delegation */
.bp-validator { fill: none; stroke: color-mix(in oklch, var(--core) 45%, var(--panel-border)); stroke-width: 1.5; }
.bp-staker { fill: color-mix(in oklch, var(--core) 45%, transparent); stroke: none; }
.bp-delegate { stroke: var(--panel-border); stroke-width: 1; }
```

- [ ] **Step 3: Verify types**

Run: `npx tsc --noEmit` — Expected: clean.

- [ ] **Step 4: Visual verify (Transactions + Staking)**

chrome-devtools MCP: click the **Transactions** (⇄) glyph — confirm a centered address/flow graph (nodes + dashed arrows) + the `preview · in development` tag + caption, empty scene, LiveStrip present. Click the **Staking** (⬢) glyph — confirm two sized validators with delegation lines converging from smaller staker dots + tag/caption. Both must read as schematic (no numbers).

- [ ] **Step 5: Commit**

```bash
git add components/Blueprint.tsx app/styles/17-blueprint.css
git commit -m "feat(views): Transactions + Staking blueprint schematics"
```

---

## Self-Review

- **Spec coverage:** center schematic blueprint per view (Network grid / Transactions flow / Staking delegation) → Tasks 1–2; `preview · in development` label → Task 1; neutral chrome + cyan accents → CSS in both tasks; empty scene → SceneCanvas fade (Task 1); dimmed `soon` top-bar glyph → already shipped (`TopBar.tsx:18-20`), no task needed. **Deliberately superseded:** spec's "no LiveStrip" (kept, per user) and "move orientation to right rail / empty left rail" (handled by the separate about-card system) — both in Global Constraints.
- **Placeholder scan:** Task 1 Step 3 directs the implementer to find the `@import` aggregator in `app/globals.css` and add line 17 — a directed lookup, not a vague TODO. No other placeholders.
- **Type consistency:** `SCHEMATIC`/`CAPTION` are `Partial<Record<Mode, …>>`; `Blueprint` returns `null` for unlisted modes; `is3D` gate in SceneCanvas matches the 3D-mode set used across the engine.
