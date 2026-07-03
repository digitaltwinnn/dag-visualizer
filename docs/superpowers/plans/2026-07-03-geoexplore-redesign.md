# GeoExplore Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `components/GeoExplore.tsx` (the geo view's left "explore" tool) up to its spec — smooth-scroll the full country list (no fold), tint the magnitude bar to the filtered metagraph's hue, show the shared node-status treatment on node rows — and fix the Distribution-score orphan by putting it in the top-bar GeoVitals (removing Densest).

**Architecture:** GeoExplore is a client component reading `store.leaderboard` (per-country stats + a 0–1 `score`) and `store.selNodes` (the drilled country's node rows). The redesign is presentational + a small formatter helper; no engine/data-layer changes. Node status reuses the existing shared system (`src/data/nodeStatus.ts` + `components/inspector/parts.tsx`'s `StatusMark`). The Distribution score already exists on `leaderboard.score` (engine-pushed, `Engine.ts:522`) but currently renders nowhere — GeoVitals dropped it "to the GeoExplore header" while GeoExplore dropped it "to the vitals"; this plan lands it in the vitals.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Zustand, Tailwind v4 + plain CSS in `app/styles/*`, vitest (node env) for pure helpers, chrome-devtools MCP for visual verification.

## Global Constraints

- **Two colour lanes, never cross.** Structural chrome/status = CSS vars (`--core` cyan, `BUCKET_COLOR` for status). Identity (per-metagraph) = the OKLCH identity map — HUD reads use `identityHudHex(id)` (NEVER the scene accessor). The country magnitude bar is structural cyan by default; it tints to the **filtered metagraph's HUD hue** only while a single metagraph is selected.
- **Number-colour rule:** data numbers are neutral; cyan = accent only; identity hue only on per-metagraph marks (the node-row dot, the tinted bar).
- **Status system:** colour = bucket (green ready / amber in-progress / red down / muted unknown), text = the exact state. Use `nodeStatus(state)` / `StatusMark` — do not invent new status colours.
- **Factual, never fabricated:** empty selections show honest empty states (the existing `quietEmpty` path stays).
- **Dev-server discipline:** ONE shared `next dev`; workers reuse `http://localhost:3000`, never start/stop it. `next build` is a coordinator-only, dev-stopped, phase-boundary check.
- **Visual verification** is via the chrome-devtools MCP against the running dev server (no test suite for components).
- **Distribution score** stays in the **top-bar GeoVitals**; the **Densest** vital is removed. The GeoExplore panel stays purely the country→nodes accordion (no score meter in its header).

---

### Task 1: Distribution score in GeoVitals (remove Densest)

**Files:**
- Create/modify: `src/util/format.ts` — add `fmtScore`
- Test: `src/util/format.test.ts` (create if absent)
- Modify: `components/topbar/Vitals.tsx` — `GeoVitals` (lines ~65–83)

**Interfaces:**
- Consumes: `store.leaderboard.score: number | null` (already set by `Engine.ts:522`).
- Produces: `fmtScore(score: number | null): string` — used only here for now.

- [ ] **Step 1: Write the failing test**

Create `src/util/format.test.ts` (or append if it exists):

```ts
import { describe, it, expect } from "vitest";
import { fmtScore } from "./format";

describe("fmtScore", () => {
  it("renders a 0–1 score to two decimals", () => {
    expect(fmtScore(0.7234)).toBe("0.72");
    expect(fmtScore(1)).toBe("1.00");
    expect(fmtScore(0)).toBe("0.00");
  });
  it("shows an em dash for null", () => {
    expect(fmtScore(null)).toBe("—");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/util/format.test.ts`
Expected: FAIL — `fmtScore is not a function` / not exported.

- [ ] **Step 3: Implement `fmtScore`**

Append to `src/util/format.ts`:

```ts
// Distribution / decentralisation score — a computed 0–1 metric. Two decimals so it reads as a
// "score" (not a count); em dash when there's no selection yet.
export const fmtScore = (score: number | null): string =>
  score == null ? "—" : score.toFixed(2);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/util/format.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Wire GeoVitals — Distribution in, Densest out**

In `components/topbar/Vitals.tsx`, add `fmtScore` to the `@/src/util/format` import (alongside `ccToFlag`). Replace the `GeoVitals` body's return so the third vital is Distribution, not Densest:

```tsx
// Geography vitals — the active selection's **footprint** (where): total mapped nodes, how many
// countries it spans, and its distribution (decentralisation) score. Densest was dropped — the
// densest country is already visible as the top row of the GeoExplore list.
function GeoVitals() {
  const lb = useStore((s) => s.leaderboard);
  const countries = lb?.countries ?? [];
  const nodes = countries.length ? countries.reduce((s, c) => s + c.count, 0) : null;
  return (
    <>
      <Vital label="Nodes" value={<Odometer value={nodes} />} />
      <Vital label="Countries" value={<Odometer value={countries.length || null} />} />
      <Vital label="Distribution" value={<span className="tb-vital-score">{fmtScore(lb?.score ?? null)}</span>} />
    </>
  );
}
```

Remove the now-unused `top`/`ccToFlag` usage inside `GeoVitals` (keep `ccToFlag` imported only if still used elsewhere in the file — it is, by other vitals? verify; if unused after this edit, drop it from the import to keep tsc clean).

- [ ] **Step 6: Verify types + tests**

Run: `npx tsc --noEmit` (Expected: clean) and `npx vitest run` (Expected: all pass).

- [ ] **Step 7: Visual verify**

With the shared dev server running, drive the chrome-devtools MCP: open `http://localhost:3000`, click the geo view glyph, confirm the top-bar right vitals now read **Nodes / Countries / Distribution** with a 0.xx score, and **no Densest**. Filter a metagraph and confirm Distribution updates (or shows — for that selection).

- [ ] **Step 8: Commit**

```bash
git add src/util/format.ts src/util/format.test.ts components/topbar/Vitals.tsx
git commit -m "feat(geo): distribution score in vitals, drop densest"
```

---

### Task 2: Full country list (remove fold) + panel title

**Files:**
- Modify: `components/GeoExplore.tsx` (title in `PanelHead`; drop `TOP`/`showAll`/`hiddenCount` fold; render all rows)
- Modify: `app/styles/10-country-leaderboard-distribution-score.css` — themed thin cyan scrollbar on `.geo-list`

**Interfaces:**
- Consumes: `store.leaderboard.countries` (already read as `lb.countries`).
- Produces: nothing new (behavioural change).

Rationale: `.geo-list` already has `overflow-y: auto` — the "fold" is purely the JS `TOP = 9` slice plus the `showAll` toggle. The spec rejects the fold ("it hid flags") and wants a smooth scroll of every country. We satisfy this with a native themed scrollbar (YAGNI — no new primitive), rendering all rows.

- [ ] **Step 1: Change the panel title + remove the fold state**

In `components/GeoExplore.tsx`:
- In `<PanelHead …>` change `title="Geographic footprint"` → `title="Nodes by country"` (eyebrow stays `Geography · explore`).
- Delete `const TOP = 9;`.
- Delete `const [showAll, setShowAll] = useState(false);`.
- Replace `const rows = showAll ? list : list.slice(0, TOP);` and `const hiddenCount = list.length - rows.length;` with just: `const rows = list;`
- Delete the entire `{hiddenCount > 0 && (…)}` and `{showAll && list.length > TOP && (…)}` toggle blocks at the bottom of the list.
- If `useState` is now unused, remove it from the React import — BUT `collapsed` still uses `useState`, so keep the import.

- [ ] **Step 2: Theme the scrollbar**

In `app/styles/10-country-leaderboard-distribution-score.css`, add a thin cyan scrollbar for `.geo-list` (WebKit + Firefox):

```css
/* Smooth-scroll the whole country list (no fold) — thin cyan thumb, matches the rail. */
.geo-list { scrollbar-width: thin; scrollbar-color: color-mix(in oklch, var(--core) 55%, transparent) transparent; }
.geo-list::-webkit-scrollbar { width: 6px; }
.geo-list::-webkit-scrollbar-track { background: transparent; }
.geo-list::-webkit-scrollbar-thumb {
  background: color-mix(in oklch, var(--core) 45%, transparent);
  border-radius: 4px;
}
.geo-list::-webkit-scrollbar-thumb:hover { background: color-mix(in oklch, var(--core) 65%, transparent); }
```

- [ ] **Step 3: Verify types**

Run: `npx tsc --noEmit` — Expected: clean (no unused `TOP`/`showAll`/`hiddenCount`).

- [ ] **Step 4: Visual verify**

chrome-devtools MCP: geo view, GeoExplore left panel. Confirm the header reads **"Nodes by country"**, the "N more countries / Show fewer" toggle is gone, and the full country list scrolls with a thin cyan thumb — every flag reachable.

- [ ] **Step 5: Commit**

```bash
git add components/GeoExplore.tsx app/styles/10-country-leaderboard-distribution-score.css
git commit -m "feat(geo): scroll the full country list, drop the top-9 fold"
```

---

### Task 3: Magnitude bar tints to the filtered metagraph's hue

**Files:**
- Modify: `components/GeoExplore.tsx` (the `.lb-bar > span` fill)
- Modify: `app/styles/10-country-leaderboard-distribution-score.css` (`.lb-bar > span` reads a CSS var with a cyan fallback)

**Interfaces:**
- Consumes: `identityHudHex(filter)` (already imported), `filter` (already read).
- Produces: nothing new.

- [ ] **Step 1: Compute the bar accent**

In `components/GeoExplore.tsx`, near the existing `isMetaFilter` derivation, add:

```tsx
// The magnitude bar is a distribution leaderboard cue: structural cyan for the whole network /
// DAG, but when a single metagraph is filtered the list is ITS nodes, so the bar tints to that
// metagraph's identity hue (HUD lane).
const barHue = isMetaFilter ? identityHudHex(filter) : undefined;
```

(`isMetaFilter` already exists: `filter !== "all" && filter !== "dag"`.)

- [ ] **Step 2: Pass the hue to each bar**

In the country row, change the bar span to carry a CSS var (fall back to the default gradient when unset):

```tsx
<span className="lb-bar">
  <span
    style={{
      width: `${Math.round((c.count / max) * 100)}%`,
      ...(barHue ? { ["--lb-bar-fill" as string]: barHue } : {}),
    }}
  />
</span>
```

- [ ] **Step 3: CSS honours the var**

In `app/styles/10-country-leaderboard-distribution-score.css`, update the fill rule so a set `--lb-bar-fill` wins, else the cyan gradient:

```css
.lb-bar > span {
  display: block; height: 100%; border-radius: 4px;
  background: var(--lb-bar-fill, linear-gradient(90deg, var(--l0), var(--core)));
  box-shadow: 0 0 6px color-mix(in oklch, var(--lb-bar-fill, var(--core)) 40%, transparent);
}
```

- [ ] **Step 4: Verify types**

Run: `npx tsc --noEmit` — Expected: clean.

- [ ] **Step 5: Visual verify**

chrome-devtools MCP: geo view. With filter = "All", bars are cyan. Open the top-bar filter, pick a metagraph with locatable nodes (e.g. DOR) — the country list narrows and the bars **tint to that metagraph's hue** with a matching faint glow. Clear the filter → bars return to cyan.

- [ ] **Step 6: Commit**

```bash
git add components/GeoExplore.tsx app/styles/10-country-leaderboard-distribution-score.css
git commit -m "feat(geo): tint the magnitude bar to the filtered metagraph hue"
```

---

### Task 4: Node rows show the shared status treatment

**Files:**
- Modify: `components/GeoExplore.tsx` (node-row content: hue dot · id · ticker · status; drop `RoleTags`)
- Modify: `app/styles/13-right-column.css` and/or `app/styles/10-*.css` (row layout for the dot + ticker + status)

**Interfaces:**
- Consumes: `StatusMark` from `@/components/inspector/parts` (renders exact state; Ready = green text, else a bucket-coloured pill), `identityHudHex`, `metagraphById`, `CORE_HEX` (all already imported except `StatusMark`).
- `NodeRow` fields available: `r.state?: string`, `r.id?: string`, `r.roles: string[]`, `r.pick` (kind-discriminated; `metanode` carries `meta.id`).
- Produces: nothing new.

Spec row shape: **metagraph-hue dot · id · ticker · status**. The hue dot is the node's network identity (metanode → `identityHudHex(meta.id)`; validator `l0`/`l1` → DAG/core cyan `CORE_HEX`). Ticker = the metagraph's ticker (validators → `DAG`). Status = `StatusMark` (bucket colour + exact state text).

- [ ] **Step 1: Import `StatusMark`**

Add to the parts import in `components/GeoExplore.tsx`:

```tsx
import { StatusMark } from "@/components/inspector/parts";
```

(Remove `RoleTags` from that import — it's being replaced.)

- [ ] **Step 2: Rewrite the node-row body**

Replace the node `<button …>` inner content (the `nb-label` + `RoleTags`) with the spec row. Derive the ticker and hue once per row:

```tsx
const isMeta = r.pick.kind === "metanode" && !!r.pick.meta;
const rowHue = isMeta ? identityHudHex(r.pick.meta!.id) : CORE_HEX;   // (already computed as rowHue above — reuse it)
const cfg = isMeta ? metagraphById(r.pick.meta!.id) : null;
const ticker = cfg ? cfg.ticker || cfg.name : "DAG";
```

Row content:

```tsx
<span className="nb-dot" style={{ background: rowHue }} aria-hidden />
<span className={"nb-label" + (r.id ? " insp-hash" : "")}>
  {r.id ? shortHash(r.id) : r.label}
</span>
<span className="nb-ticker">{ticker}</span>
<StatusMark state={r.state} />
```

Note: `rowHue` is already computed in the existing row map for the subject-pairing hue — reuse that variable rather than recomputing.

- [ ] **Step 3: Row layout CSS**

Add to `app/styles/13-right-column.css` (near `.nb-row`):

```css
.nb-row { gap: 8px; }
.nb-dot { flex: none; width: 7px; height: 7px; border-radius: 50%; box-shadow: 0 0 5px currentColor; }
.nb-ticker { flex: none; margin-left: auto; font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
.nb-row .st-ready, .nb-row .st-pill { flex: none; }
```

(`StatusMark` from `components/inspector/parts.tsx:26` emits `.st-ready` for Ready or `.st-pill` for any other bucket — the selectors above match both. `.nb-ticker` uses `margin-left: auto` to push the ticker + status to the right edge; the status pill follows the ticker.)

- [ ] **Step 4: Verify types**

Run: `npx tsc --noEmit` — Expected: clean (no unused `RoleTags`).

- [ ] **Step 5: Visual verify**

chrome-devtools MCP: geo view → expand a country row → confirm each node row shows a **metagraph-hue dot · short id · ticker · status** (Ready = green text; a syncing/waiting node = amber pill; down = red pill). Clicking a row still opens the node card on the right rail. Hover still glows the node on the globe.

- [ ] **Step 6: Commit**

```bash
git add components/GeoExplore.tsx app/styles/13-right-column.css
git commit -m "feat(geo): node rows show shared status (hue dot, id, ticker, state)"
```

---

## Self-Review

- **Spec coverage:** ScrollArea/no-fold → Task 2; magnitude bar tint → Task 3; node-row shared status → Task 4; title "Nodes by country" → Task 2; Distribution score placement (reconciled to vitals) + Densest removal → Task 1. The spec's "Distribution score in the header" is intentionally superseded per the user's decision (kept in vitals) — noted in Global Constraints.
- **Placeholder scan:** one call-out — Task 4 Step 3 says "confirm the class StatusMark emits and match it": the implementer must Read `parts.tsx` to use the real class; this is a directed lookup, not a vague TODO.
- **Type consistency:** `fmtScore(score: number | null): string` defined in Task 1, consumed only in Task 1. `barHue`/`rowHue` local to GeoExplore. `StatusMark({ state })` matches `parts.tsx`.
