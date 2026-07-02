# HUD Refresh — Phase 3: Right-Rail Subject Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the read-only cards into a single threaded "subject stack" on the right rail — the metagraph dossier moves from the left rail to the top as the **Context (parent)** card, the node/snapshot **Detail (children)** cards hang off an identity-hued **anchor-line thread**, and a neutral **View-default** card fills the Detail slot at rest.

**Architecture:** The right-rail `Inspector` already renders a generic recency-ordered card stack (`selStack` of node/snap slots). This phase adds a non-dismissible **Context** card at the top (relocating `ContextPanel`, + an "All · whole network" variant), a CSS **instrument-channel thread** on the rail's outer edge with a per-card node-dot, **breadcrumb eyebrows** on the detail cards, and a **View-default** card (expanded at rest → collapses to a slim view-header strip when a selection exists). The left rail loses the dossier and becomes purely the view's tool. **Card *content* (dossier logo-avatar, node-composition block, status buckets, snapshot focus row) is unchanged this phase — deferred to Phase 4.**

**Tech Stack:** Next 15 (App Router) · React 19 · TypeScript · Tailwind v4 + the Phase-1 tokens · Zustand (existing store) · the existing `InspectorCard`/`MetaCard`/`useFlashOnChange`.

## Global Constraints

- **Node ≥ 18.18.** Branch **`dev`**. Commit as author `digitaltwinnn` (`git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" commit …`), short messages ending with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Two colour lanes, never cross.** The **identity thread/spine + the dossier avatar-ring/ticker/site** carry the active metagraph's **identity hue** (source = `config.METAGRAPHS` via `filterAccent(filter)` / `hex(cfg.color)` — the SAME source the scene uses; do NOT use the Phase-1 generator). Everything else — the **instrument-channel ticks, the View-default card, breadcrumbs, node-dots, card chrome** — is **neutral structural chrome**. **Filter = all → the spine goes structural cyan** (`var(--primary)`), never an identity hue.
- **View-default is neutral, NOT identity yellow.** Its only colour is the **cyan node-halo pick-invite** (`var(--primary)`). Gold/identity hues here are a lane violation.
- **The thread is static chrome — no data-driven pulse/gauge on the rail.** Live acknowledgement happens in the panels (the odometer roll), not the rail. Ticks are neutral (measurement, not identity), gradient-faded (densest at the middle, dissolving top & bottom).
- **Count rule:** one Context card (always) + at most one card **per detail kind** the current view surfaces; a new click of the same kind **replaces** it (already how `selStack` works — preserve it).
- **Rail geometry:** the thread hugs the **screen's outer edge** (right rail → the cards' **right** side); cards face the scene. Node-dots sit at **each card's vertical middle**; the `×` stays **top-right** (they must not collide).
- **Factual:** the "All · whole network" summary shows real counts (metagraph count + total located nodes); never fabricate.
- **App stays shippable throughout.** **Path alias** `@/*` → repo root.
- **Dev server (shared) + verification:** ONE `next dev` runs at `http://localhost:3000` — do NOT start/kill/restart it and do NOT `rm -rf .next`; HMR recompiles edits. **Do NOT run `npm run build`** while it's up (shared `.next` corruption); use `npx tsc --noEmit` for type checks. Verify visuals with the **chrome-devtools MCP** (`mcp__plugin_chrome-devtools-mcp__*`; `ToolSearch` "chrome-devtools navigate screenshot click snapshot" if not loaded): `navigate_page` to `:3000`, reload after edits, `take_snapshot` + `click` to reach states (click a view in the switch; click the `Filter` + a metagraph row to filter; click a globe node / a LiveStrip bar to select a detail), `take_screenshot`, and Read the PNG. Ignore benign console noise (`mojo … rejected`, `PHONE_REGISTRATION_ERROR`, `BackForwardCache`).

**Source spec:** `docs/superpowers/specs/2026-07-01-right-rail-subject-stack-design.md` (+ the "amends the empty-states spec" note; the `2026-07-01-00-overview.md` IA rule). Current code: `components/Inspector.tsx`, `components/ContextPanel.tsx`, `components/InspectorCard.tsx`, `components/inspector/cards.tsx`, `components/LeftColumn.tsx`, `app/styles/13-right-column.css`, `app/styles/05-inspector-metagraph-context-pane.css`.

**Out of scope (Phase 4+):** the dossier **content** refinements (logo-avatar header, renamed Node-composition block, the shared green/amber/red status-bucket system, snapshot focus row, geo-node card) — the `context-dossier` / `geo-node-card` / `snapshot-card` specs. This phase only RELOCATES + THREADS the existing cards and adds the View-default + "All" context. Don't restyle card bodies. Also out: left/bottom rail work, responsive.

---

## File Structure

- `components/ContextCard.tsx` — **create** — the right-rail Context (parent) card: the metagraph dossier (reusing `InspectorCard kind:meta`) when filtered, or the compact "All · whole network" summary when `filter === "all"`. Non-dismissible; `×` clears the filter (metagraph case only).
- `components/ViewDefault.tsx` — **create** — the per-view neutral orientation card (title + one line + cyan pick-invite), with an expanded and a collapsed-strip render.
- `components/Inspector.tsx` — **modify** — render `ContextCard` at the top, then the ViewDefault (expanded at rest / collapsed strip when a detail exists) + the detail panes; add per-pane breadcrumb eyebrows; wire the identity thread class/vars.
- `components/LeftColumn.tsx` — **modify** — remove `ContextPanel`; the left rail is now just the view tool.
- `components/ContextPanel.tsx` — **delete** (folded into `ContextCard`).
- `src/data/breadcrumb.ts` — **create** — a tiny pure helper resolving a detail pick's parent-metagraph breadcrumb label (TDD).
- `src/data/breadcrumb.test.ts` — **create** — its unit test.
- `app/styles/13-right-column.css` — **modify** — the subject-stack layout, the instrument-channel thread (groove + faded neutral ticks + identity spine), per-card node-dots, breadcrumb eyebrows, the view-default expanded card + collapsed strip.
- `app/styles/05-inspector-metagraph-context-pane.css` — **modify** — the dossier styles this file holds now apply to the right-rail Context card (retarget selectors from `#metapane`/left to the right-rail context); keep the shared `.insp-*` card rules used by all cards.

---

## Task 1: Relocate the dossier to the right rail as the Context card (+ "All" variant)

**Files:**
- Create: `components/ContextCard.tsx`
- Modify: `components/Inspector.tsx`, `components/LeftColumn.tsx`, `app/styles/13-right-column.css`, `app/styles/05-inspector-metagraph-context-pane.css`
- Delete: `components/ContextPanel.tsx`

**Interfaces:**
- Consumes: `store.{filter,setFilter,metaList}`, `metagraphById` (`@/src/data/network`), `metaToken` (`@/components/inspector/parts`), `InspectorCard`, `useFlashOnChange`.
- Produces: `<ContextCard />` (no props) — the top-of-stack parent card.

- [ ] **Step 1: Create `ContextCard.tsx`**

```tsx
"use client";

import { useStore } from "@/src/store/store";
import { metagraphById } from "@/src/data/network";
import InspectorCard from "@/components/InspectorCard";
import { metaToken } from "@/components/inspector/parts";
import { useFlashOnChange } from "@/components/useFlashOnChange";
import type { PickDescriptor } from "@/src/data/types";

// The Context (parent) card at the top of the right-rail subject stack. It mirrors the
// top-bar filter: a metagraph selected there shows its dossier here; "all" shows the compact
// whole-network summary. Non-dismissible (it IS the filter) — the × clears the filter (only
// meaningful for a metagraph; "all" has no ×). Read-only identity; its live readout is the
// top-bar vitals. Card CONTENT is unchanged this phase (Phase 4 refines the dossier body).
export default function ContextCard() {
  const filter = useStore((s) => s.filter);
  const setFilter = useStore((s) => s.setFilter);
  const metaList = useStore((s) => s.metaList);
  const flashRef = useFlashOnChange(filter);
  const mgCfg = metagraphById(filter);

  if (mgCfg) {
    const mg = metaList.find((m) => m.id === mgCfg.id) ?? null;
    const context: PickDescriptor = { kind: "meta", title: mgCfg.name, cfg: mgCfg };
    const titleSuffix =
      mgCfg.id !== "dag" ? <span className="insp-token"> ({metaToken(mgCfg, mg)})</span> : null;
    const eyebrow = mgCfg.id === "dag" ? "Selected core" : "Selected metagraph";
    return (
      <aside id="metapane" className="panel rc-context" ref={flashRef}>
        <button id="metapane-close" title="Clear selection" onClick={() => setFilter("all")}>
          ×
        </button>
        <div id="metapane-content">
          <InspectorCard p={context} eyebrow={eyebrow} titleSuffix={titleSuffix} />
        </div>
      </aside>
    );
  }

  // "All · whole network" — the compact context at rest (no filter). Factual counts.
  const cores = metaList.filter((m) => (m.located ?? 0) > 0).length;
  const nodes = metaList.reduce((s, m) => s + (m.located ?? 0), 0);
  return (
    <aside className="panel rc-context rc-context--all" ref={flashRef}>
      <div id="metapane-content">
        <span className="insp-eyebrow">Context</span>
        <h3 className="insp-title">All · whole network</h3>
        <p className="rc-empty-text">
          {cores} metagraph{cores === 1 ? "" : "s"} · {nodes.toLocaleString()} mapped nodes.
          Pick one from the filter to focus.
        </p>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Render `ContextCard` at the top of the right rail**

In `components/Inspector.tsx`: import it (`import ContextCard from "@/components/ContextCard";`) and render it as the FIRST child of `#rightcol`, before `{panes}`:
```tsx
  return (
    <div id="rightcol" style={accent}>
      <ContextCard />
      {panes}
      {hint && ( /* unchanged for now — Task 4 replaces this with the ViewDefault */
```
(Leave the existing `hint` block for now; Task 4 swaps it for the ViewDefault.)

- [ ] **Step 3: Remove the dossier from the left rail**

In `components/LeftColumn.tsx`: remove the `import ContextPanel from "@/components/ContextPanel";` line and the `<ContextPanel />` render (the line `<ContextPanel />` before the tool cards). The left rail now renders only the view tool. Then delete `components/ContextPanel.tsx`.

- [ ] **Step 4: Retarget the dossier CSS to the right rail**

The dossier styles live in `app/styles/05-inspector-metagraph-context-pane.css` under `#metapane` (which was inside `#leftcol`). `#metapane` now lives inside `#rightcol` — most rules still apply by id, but verify no rule is scoped to `#leftcol #metapane`. In `app/styles/13-right-column.css`, add a `.rc-context` rule so the Context card sits at the top of the stack with the same panel treatment as the detail panes and a bottom margin separating it from the children:
```css
.rc-context { position: relative; }
.rc-context--all #metapane-content { padding: var(--panel-pad-y) var(--panel-pad-x); }
```
Grep for any `#leftcol #metapane` / `#leftcol .insp-` scoping and unscope it (make it `#metapane` / `.insp-`), so the dossier renders identically on the right. Do NOT restyle the dossier body (Phase 4).

- [ ] **Step 5: Typecheck + verify via chrome-devtools MCP**

Run `npx tsc --noEmit` (clean). Then via the MCP against the running server: `navigate_page` to `:3000`, reload; screenshot the default (filter=all) — the right rail shows the **"All · whole network"** context card at top; the left rail no longer shows a dossier. Then `click` the `Filter` control + a metagraph row (e.g. DOR) — the right rail's top card becomes the DOR **dossier** (identity header, node fabric — unchanged content), with a `×` that clears back to All. Read both PNGs; confirm the dossier moved right and the left rail is just the tool.

- [ ] **Step 6: Commit**

```bash
git add -A && git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" \
  commit -m "feat(rail): move dossier to right rail as Context card (+ All variant)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Instrument-channel identity thread on the right rail

**Files:**
- Modify: `app/styles/13-right-column.css`, `components/Inspector.tsx`

**Interfaces:**
- Consumes: `--filter-accent` (already set on `#rightcol` by `Inspector` via `filterAccent(filter)` — cyan for all, identity hue for a metagraph).
- Produces: the outer-edge instrument channel (groove + faded neutral ticks + identity spine) and a per-card `.rc-node-dot` at each card's vertical middle.

- [ ] **Step 1: Add the instrument-channel + spine to `#rightcol`**

The rail's cards sit in `#rightcol`; the thread runs its **right (outer) edge**. Add to `app/styles/13-right-column.css`:
```css
#rightcol {
  /* reserve the outer channel so cards don't overlap the thread */
  padding-right: 18px;
  /* NOTE: #rightcol is already `position: fixed` (its own positioning context) — do NOT add
     `position: relative` here; it clobbers the fixed placement. Absolute ::before/::after still
     anchor to the fixed element. Also: the outer-edge node-dot (`right: -16px`) sits OUTSIDE the
     panel, so move any panel scroll (`overflow-y: auto`) to the inner content wrapper
     (`#metapane-content`/`.rc-content`) — a panel `overflow` would clip the dot. */
}
/* Recessed groove on the outer edge (neutral chrome). */
#rightcol::before {
  content: "";
  position: absolute;
  top: 0; bottom: 0; right: 6px;
  width: 6px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.25);
  box-shadow: inset 0 0 0 1px rgba(120, 160, 255, 0.10);
  /* neutral gradient-faded tick-marks: densest at the middle, dissolving top & bottom */
  background-image: repeating-linear-gradient(
    to bottom,
    rgba(160, 175, 205, 0.28) 0 1px,
    transparent 1px 9px
  );
  -webkit-mask-image: linear-gradient(to bottom, transparent, #000 22%, #000 78%, transparent);
  mask-image: linear-gradient(to bottom, transparent, #000 22%, #000 78%, transparent);
  pointer-events: none;
}
/* Identity-hued spine inside the groove (cyan for "all" via --filter-accent). */
#rightcol::after {
  content: "";
  position: absolute;
  top: 8px; bottom: 8px; right: 7px;
  width: 2px;
  border-radius: 2px;
  background: var(--filter-accent, var(--primary));
  opacity: 0.75;
  pointer-events: none;
}
```

- [ ] **Step 2: Add a node-dot at each card's vertical middle**

Every stack panel (Context + details + the view-default) attaches to the spine with a dot at its vertical centre, on the outer edge. Add:
```css
#rightcol > .panel { position: relative; }
#rightcol > .panel::after {
  content: "";
  position: absolute;
  right: -16px;               /* out into the channel, over the spine */
  top: 50%;
  transform: translateY(-50%);
  width: 7px; height: 7px;
  border-radius: 50%;
  background: var(--filter-accent, var(--primary));
  box-shadow: 0 0 0 2px var(--bg);
  z-index: 1;
  pointer-events: none;
}
```
(The `×` is top-right *inside* the card; the dot is in the outer channel at mid-height — they don't collide.)

- [ ] **Step 3: Verify via chrome-devtools MCP**

Reload `:3000`. Screenshot filter=all: the right rail shows a subtle recessed groove with faint neutral ticks (fading top/bottom) and a **cyan** spine down the outer edge, with a dot at each card's middle. Then filter to a metagraph (click Filter + row): the spine + dots **re-tint to that metagraph's identity hue**. Read both PNGs; confirm the ticks stay neutral (not tinted) and the spine/dots carry the hue.

- [ ] **Step 4: Commit**

```bash
git add -A && git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" \
  commit -m "feat(rail): instrument-channel identity thread + per-card node-dots

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Breadcrumb eyebrows on the detail cards (TDD helper)

**Files:**
- Create: `src/data/breadcrumb.ts`, `src/data/breadcrumb.test.ts`
- Modify: `components/Inspector.tsx`, `app/styles/13-right-column.css`

**Interfaces:**
- Produces: `breadcrumbLabel(kind: "node" | "snap", filter: string): string` — the child card's breadcrumb eyebrow, reading toward the edge (e.g. `"node ‹ DOR"`, `"snapshot ‹ DOR"`, and `"node ‹ all"` / `"snapshot ‹ network"` when unfiltered).

- [ ] **Step 1: Write the failing test**

Create `src/data/breadcrumb.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { breadcrumbLabel } from "./breadcrumb";

describe("breadcrumbLabel", () => {
  it("names the parent metagraph when filtered (child ‹ parent)", () => {
    // DOR's config id → ticker "DOR"
    expect(breadcrumbLabel("node", "DAG0CyySf35ftDQDQBnd1bdQ9aPyUdacMghpnCuM")).toBe("node ‹ DOR");
    expect(breadcrumbLabel("snap", "DAG0CyySf35ftDQDQBnd1bdQ9aPyUdacMghpnCuM")).toBe("snapshot ‹ DOR");
  });
  it("falls back to the network when unfiltered", () => {
    expect(breadcrumbLabel("node", "all")).toBe("node ‹ network");
    expect(breadcrumbLabel("snap", "all")).toBe("snapshot ‹ network");
  });
  it("names the DAG core", () => {
    expect(breadcrumbLabel("node", "dag")).toBe("node ‹ DAG");
  });
});
```

- [ ] **Step 2: Run it RED**

Run: `npm test -- breadcrumb`
Expected: FAIL — `Cannot find module './breadcrumb'`.

- [ ] **Step 3: Implement `breadcrumb.ts`**

```ts
// Resolve the ticker straight from the pure config data — NOT from `@/src/data/network`,
// which imports the browser-only `js/api.js` at module level and would break this Node test.
// `js/config.js` is plain constants (no imports, no browser globals), so it's test-safe.
import { METAGRAPHS } from "../../js/config.js";

// The breadcrumb eyebrow for a Detail (child) card, naming its parent — the active
// metagraph (identity context), reading child ‹ parent toward the rail's outer edge.
export function breadcrumbLabel(kind: "node" | "snap", filter: string): string {
  const child = kind === "snap" ? "snapshot" : "node";
  let parent = "network";
  if (filter === "dag") {
    parent = "DAG";
  } else if (filter !== "all") {
    const m = (METAGRAPHS as { id: string; ticker: string; name: string }[]).find(
      (x) => x.id === filter,
    );
    parent = m ? m.ticker || m.name : "network";
  }
  return `${child} ‹ ${parent}`;
}
```

- [ ] **Step 4: Run it GREEN**

Run: `npm test -- breadcrumb`
Expected: PASS (3/3).

- [ ] **Step 5: Use the breadcrumb as the detail eyebrow**

In `components/Inspector.tsx`, import `breadcrumbLabel` and replace the two detail panes' `eyebrow` props (currently `"Selected node"` / `"Selected snapshot"`) with the breadcrumb:
```tsx
import { breadcrumbLabel } from "@/src/data/breadcrumb";
// node pane:
          eyebrow={breadcrumbLabel("node", filter)}
// snap pane:
          eyebrow={breadcrumbLabel("snap", filter)}
```
(The Context card keeps its `Selected metagraph`/`Selected core`/`Context` eyebrow.) Add a CSS nudge so the breadcrumb eyebrow reads toward the outer edge:
```css
.rc-pane .insp-eyebrow { text-align: right; }
```

- [ ] **Step 6: Verify via chrome-devtools MCP**

Reload. Filter to DOR (click Filter + row), then `click` a globe node (in geo view — click Geography first) or a LiveStrip bar (ledger view) to open a detail card. Screenshot; confirm the detail card's eyebrow reads `node ‹ DOR` / `snapshot ‹ DOR`, right-aligned toward the edge, with the `×` top-right and the node-dot at mid-height. Read the PNG.

- [ ] **Step 7: Commit**

```bash
git add -A && git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" \
  commit -m "feat(rail): breadcrumb eyebrows on detail cards (child ‹ parent)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: View-default cards (expanded orientation at rest)

**Files:**
- Create: `components/ViewDefault.tsx`
- Modify: `components/Inspector.tsx`, `app/styles/13-right-column.css`

**Interfaces:**
- Consumes: `store.mode`.
- Produces: `<ViewDefault collapsed={boolean} onToggle={() => void} />` — the neutral per-view orientation card (expanded) / slim view-header strip (collapsed).

- [ ] **Step 1: Create `ViewDefault.tsx`**

```tsx
"use client";

import { useStore } from "@/src/store/store";
import type { Mode } from "@/src/store/store";

// The View-default card: "what this lens is for" — a short title + one line + a pick-invite.
// Neutral structural chrome (NOT an identity hue); its only colour is the cyan node-halo
// invite. It is the Detail slot at rest; when a detail selection exists it collapses to a slim
// view-header strip at the top of the rail (one click to re-expand). Every view has one.
const COPY: Record<string, { title: string; line: string; invite: string }> = {
  hyper: { title: "Hypergraph", line: "The network's architecture — the Global L0 core, its validator shells, and the metagraphs orbiting as hubs.", invite: "Hover a hub to preview it; click to focus." },
  geo: { title: "Node geography", line: "Every validator at its real location — density, distribution, and the country breakdown.", invite: "Click a node on the globe (or a row in the explorer) to inspect it." },
  ledger: { title: "Snapshots", line: "The settlement timeline — global snapshots and the metagraph snapshots they anchor, over time.", invite: "Click a snapshot in the bar-chart below to inspect it." },
  status: { title: "Network status", line: "A health read of the network. In development.", invite: "" },
  transactions: { title: "Transactions", line: "Money flow and $DAG economics. In development.", invite: "" },
  staking: { title: "Delegated staking", line: "Validator staking and rewards. In development.", invite: "" },
};

export default function ViewDefault({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const mode = useStore((s) => s.mode) as Mode;
  const c = COPY[mode] ?? COPY.hyper;

  if (collapsed) {
    return (
      <button className="rc-vd-strip" onClick={onToggle} title="What this view is for">
        <span className="rc-vd-strip-title">{c.title}</span>
        <span className="rc-vd-strip-hint">▾</span>
      </button>
    );
  }
  return (
    <aside className="panel rc-vd">
      <span className="insp-eyebrow">This view</span>
      <h3 className="insp-title">{c.title}</h3>
      <p className="rc-empty-text">{c.line}</p>
      {c.invite && (
        <p className="rc-vd-invite">
          <span className="rc-vd-halo" aria-hidden /> {c.invite}
        </p>
      )}
    </aside>
  );
}
```

- [ ] **Step 2: Add the View-default styles**

`app/styles/13-right-column.css`:
```css
.rc-vd .rc-vd-invite {
  display: flex; align-items: center; gap: 8px;
  margin: 10px 0 0; font-size: 12px; color: var(--muted);
}
.rc-vd-halo {
  width: 10px; height: 10px; border-radius: 50%; flex: none;
  background: var(--primary);
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--primary) 30%, transparent);
  animation: breathe 1.5s ease-in-out infinite;   /* the cyan node-halo pick-invite */
}
.rc-vd-strip {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  width: 100%; padding: 8px 12px; cursor: pointer;
  background: rgba(16, 22, 44, 0.5); border: 1px solid var(--panel-border);
  border-radius: var(--radius); color: var(--muted);
}
.rc-vd-strip:hover { color: var(--text); }
.rc-vd-strip-title { font-size: 12px; letter-spacing: 0.02em; }
.rc-vd-strip-hint { font-size: 10px; opacity: 0.7; }
@media (prefers-reduced-motion: reduce) { .rc-vd-halo { animation: none; } }
```

- [ ] **Step 3: Render the ViewDefault (expanded) in place of the old hint**

In `components/Inspector.tsx`, replace the `hint`/`#rc-empty` block with the ViewDefault in its **expanded** state whenever there are no detail panes. (Task 5 adds the collapsed strip.) For now:
```tsx
import ViewDefault from "@/components/ViewDefault";
// …in the return, after {panes}:
      {panes.length === 0 && <ViewDefault collapsed={false} onToggle={() => {}} />}
```
Remove the old `hint` computation + the `#rc-empty` aside. After removing `hint`, the `const mode = useStore((s) => s.mode)` line in `Inspector` is unused (the `ViewDefault` reads `mode` itself) — delete it too so `tsc`/lint stays clean. (In Task 5 no new `mode` use is added to `Inspector`.)

- [ ] **Step 4: Verify via chrome-devtools MCP**

Reload. With nothing selected, screenshot each 3D view (click Hypergraph / Geography / Snapshots in the switch): the Detail slot shows the neutral **View-default** card — title + one line + the breathing **cyan** halo + invite — NOT tinted to any identity hue (verify even when a metagraph is filtered: the view-default stays neutral, only the Context card + thread carry the hue). Read the PNGs.

- [ ] **Step 5: Commit**

```bash
git add -A && git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" \
  commit -m "feat(rail): neutral View-default orientation cards (expanded, cyan pick-invite)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: View-default expand ↔ collapsed-strip behaviour

**Files:**
- Modify: `components/Inspector.tsx`

**Interfaces:**
- Consumes: `ViewDefault`, `store.mode`, the detail `panes`.
- Produces: the collapse rule — at rest the ViewDefault is expanded in the Detail slot; when a detail exists it collapses to the slim strip at the **top of the rail** (above the Context card), one click to re-expand.

- [ ] **Step 1: Add collapse state + placement in `Inspector.tsx`**

The ViewDefault should: (a) be **expanded in the Detail slot** when no detail pane is present; (b) **collapse to the strip at the top of the rail** when a detail pane appears; (c) let the user re-expand the strip (shown as an overlay/expanded card) and re-collapse. Implement with local state that auto-follows the pane count but is user-toggleable:
```tsx
import { useState, useEffect } from "react";
// inside Inspector():
  const [vdOpen, setVdOpen] = useState(true);
  const hasDetail = panes.length > 0;
  // Auto-collapse when a detail appears, auto-expand when the last detail is dismissed.
  useEffect(() => { setVdOpen(!hasDetail); }, [hasDetail]);
```
Then structure the rail:
```tsx
  return (
    <div id="rightcol" style={accent}>
      {hasDetail && !vdOpen && (
        <ViewDefault collapsed onToggle={() => setVdOpen(true)} />
      )}
      <ContextCard />
      {hasDetail && vdOpen && (
        <ViewDefault collapsed={false} onToggle={() => setVdOpen(false)} />
      )}
      {panes}
      {!hasDetail && <ViewDefault collapsed={false} onToggle={() => {}} />}
    </div>
  );
```
So: **no detail →** Context + expanded ViewDefault (the resting state). **Detail present →** the collapsed strip on top (tap to expand it inline above the details), then Context, then the details. When the user dismisses the last detail, it auto-expands back into the Detail slot.

- [ ] **Step 2: Typecheck**

Run `npx tsc --noEmit` — clean.

- [ ] **Step 3: Verify via chrome-devtools MCP**

Reload. (a) At rest → Context + expanded View-default. (b) Select a detail (click a node in geo / a bar in ledger) → the View-default becomes the **slim strip at the top**, Context + the detail below. (c) `click` the strip → it expands inline (still with the details present); click again → collapses. (d) Dismiss the detail (its `×`) → the View-default returns expanded in the Detail slot. Read PNGs for (a)/(b)/(c).

- [ ] **Step 4: Commit**

```bash
git add -A && git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" \
  commit -m "feat(rail): View-default expand↔collapse strip (collapses when a detail is selected)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Left-rail + CSS cleanup + final verification

**Files:**
- Modify: `app/styles/05-inspector-metagraph-context-pane.css`, `app/styles/13-right-column.css`
- (verify) `components/LeftColumn.tsx`

**Interfaces:** none new — reconciliation + confirmation.

- [ ] **Step 1: Confirm the left rail is tool-only and no dead dossier refs remain**

Run:
```bash
cd /home/alexander/Workspace/dag-visualizer
grep -rnE "ContextPanel" app components src | grep -v "app/styles/" || echo "no ContextPanel refs"
grep -rnE "#leftcol\s+#metapane|#leftcol\s+\.insp-" app/styles || echo "no left-scoped dossier css"
```
Expected: `no ContextPanel refs` (deleted in Task 1) and `no left-scoped dossier css` (retargeted in Task 1). If a `#leftcol`-scoped dossier rule remains, unscope it so the right-rail Context renders correctly, and re-verify.

- [ ] **Step 2: Fold the moved dossier tokens into the right-rail sheet**

Any rule in `05-inspector-metagraph-context-pane.css` that positioned the dossier for the LEFT rail (e.g. left-specific margins, the old `#metapane` top offset that assumed `#leftcol`) should be neutralised or moved so the Context card sits cleanly at the top of `#rightcol` (it inherits the stack's `--rail-gap`). Keep the shared `.insp-*` card-body rules (used by every card) untouched. Do not restyle the dossier body content (Phase 4).

- [ ] **Step 3: Final regression pass via chrome-devtools MCP**

Reload `:3000`. Walk the full matrix and Read each PNG:
- **hyper / all:** right rail = "All · whole network" Context + expanded View-default; cyan thread; left rail = hyper tool only.
- **hyper / DOR filtered:** Context = DOR dossier (identity header) with `×`; thread + dots re-tinted to DOR's hue; View-default stays **neutral**.
- **geo / node selected:** Context (dossier or All) + the node Detail card with `node ‹ …` breadcrumb + `×`; the View-default collapsed to the strip on top.
- **ledger / snapshot selected:** Context + the snapshot Detail card with `snapshot ‹ …` breadcrumb.
Confirm: identity hue only on the thread/spine/dots + dossier ring/ticker/site; ticks + View-default + breadcrumbs neutral; `×` top-right never colliding with the mid-height node-dot; nothing from the old left-rail dossier looks broken.

- [ ] **Step 4: Commit**

```bash
git add -A && git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" \
  commit -m "chore(rail): reconcile dossier CSS to the right rail; left rail is tool-only

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Done-when (Phase 3 acceptance)

- `npx tsc --noEmit` clean; `npm test` passes (the `breadcrumb` helper).
- The **right rail is the subject stack**: a non-dismissible **Context** card at the top (the metagraph dossier when filtered — with a `×` that clears the filter — or the compact **"All · whole network"** summary when unfiltered), the node/snapshot **Detail** children below (each with a `child ‹ parent` breadcrumb eyebrow + `×`), and a neutral **View-default** card that is expanded in the Detail slot at rest and **collapses to a slim view-header strip** (above the Context card) when a detail is selected.
- An **instrument-channel thread** runs the rail's **outer edge**: a recessed groove with **neutral gradient-faded ticks**, an **identity-hued spine** (cyan for "all"), and a **node-dot at each card's vertical middle**. The rail is static chrome — no data-driven pulse.
- **Two-lane discipline holds:** identity hue only on the thread/spine/dots + the dossier's ring/ticker/site; the ticks, View-default, breadcrumbs, and card chrome are neutral; filter=all → the spine is structural cyan.
- The **left rail no longer shows the dossier** — it's just the view tool. `ContextPanel.tsx` is deleted.

## Follow-ups (Phase 4+)

- **Card-content refinements** (their own plan): the dossier logo-avatar header + renamed **Node-composition** block (headline total, role+code rows, chip stacks); the shared **green/amber/red node status-bucket** system (consolidating the old 6-colour `nodeStateColor`) used by the dossier + geo-node card; the **snapshot focus row** + settlement; the geo-node card composition/status/IP/location. (`context-dossier` / `geo-node-card` / `snapshot-card` specs.)
- Deferred by the spec: reorder/collapse of children when the stack gets tall; the exact eligible detail kinds per view as more clickables are added.
- Fold the thread/breadcrumb/view-default tokens into the shared Instrument-Glass token pass.
