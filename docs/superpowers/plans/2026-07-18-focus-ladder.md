# Focus/Zoom Ladder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the per-view focus/zoom ladder data (`domain/focusLadder.ts`), collapse the
Engine's four hand-rolled camera walks into one `_resolveFocus()`, and fill the two
consistency gaps: the geo cohort (city×provider) rung and the ledger node browser — plus the
country + provider facts cards with a rail-manifest boundary test.

**Spec:** `docs/superpowers/specs/2026-07-18-focus-ladder-design.md` (read it first — the
consistency matrix is the contract; the deliberate exemptions are recorded there).

**Architecture:** A pure domain rung table per 3D view (level → `active(sel)` predicate →
resolver KEY); the Engine walks it finest→coarsest and calls named resolver methods (scene
side effects stay in the Engine). `pickActions` imports the same level order so store-side
deselect stepping and camera resolution can't drift. New selection channel `cohort`; new
action kind `"cohort"`; two new facts cards; `railCards` checked against `LADDERS` by test.

**Tech Stack:** Existing only — TypeScript, Three.js, Zustand, vitest. No new dependencies.

**Branch:** `focus-ladder` (from current `master`).

## Global Constraints

- Every task ends green: `npx tsc --noEmit` AND `npm test` (452 tests at base; counts grow).
- The six executable gates (CLAUDE.md "The rules") apply to every change — notably: domain
  modules ship colocated tests covering every value export (`domainExportCoverage`); no
  component writes selection setters directly (`selectionBoundary`); no raw hex in
  scene/components outside allowlists; no per-frame allocations in loop-phase methods.
- Behaviour-preserving EXCEPT the labelled changes (spec Part 2): ledger double-walk
  collapse, reversal-gap re-resolve, `layer` becoming view-scoped, ledger scene node clicks
  gaining layer ancestry — plus the two gap-fill features.
- User-facing vocabulary for the cohort subject is **provider** (eyebrow `PROVIDER`);
  internal identifiers keep `cohort` (spec Part 6 records the split as deliberate).
- Design tokens only (HUD type scale, `--wash-*`, radii tokens); no new `text-[..px]`/hex.
- Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- ONE shared dev server on :3000 (coordinator-owned); workers never start/kill servers.
- Visual verification via the chrome-devtools MCP against the running app (CLAUDE.md
  "Verifying changes"); `?slowmo=4` for mid-transition states.

---

### Task 1: `domain/focusLadder.ts` — the rung table

**Files:**
- Create: `src/engine/domain/focusLadder.ts`
- Test: `src/engine/domain/focusLadder.test.ts`

**Interfaces:**
- Produces (later tasks rely on these exact names):
  - `type FocusLevel = "node" | "cohort" | "country" | "layer" | "network" | "all"`
  - `interface CohortSel { cc: string; city: string | null; isp: string | null }`
  - `interface SelectionSnapshot { inspectIsNode: boolean; cohort: CohortSel | null; country: string | null; layerId: string | null; filter: string }`
  - `type ResolverKey = "geoNode" | "geoCohort" | "geoCountry" | "geoNetwork" | "geoOverview" | "hyperNode" | "hyperNetwork" | "hyperOverview" | "ledgerNode" | "ledgerLayer" | "ledgerOverview"`
  - `interface Rung { level: FocusLevel; active(sel: SelectionSnapshot): boolean; resolver: ResolverKey }`
  - `const LADDERS: Record<View3D, Rung[]>` (finest→coarsest)
  - `const LEVEL_CARRY: Record<Exclude<FocusLevel, "all">, "always" | "view-scoped">`
  - `function finerLevels(view: View3D, level: FocusLevel): FocusLevel[]`
- Consumes: `View3D` from `./viewTransition` (type import), `Mode` unused (View3D suffices).

- [ ] **Step 1: Write the failing test**

`src/engine/domain/focusLadder.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { LADDERS, LEVEL_CARRY, finerLevels, type SelectionSnapshot } from "./focusLadder";

const sel = (over: Partial<SelectionSnapshot> = {}): SelectionSnapshot => ({
  inspectIsNode: false, cohort: null, country: null, layerId: null, filter: "all", ...over,
});
const COHORT = { cc: "DE", city: "Falkenstein", isp: "Hetzner" };

describe("focusLadder — the per-view rung tables (spec 2026-07-18)", () => {
  it("pins each view's rung order, finest→coarsest", () => {
    expect(LADDERS.geo.map((r) => r.level)).toEqual(["node", "cohort", "country", "network", "all"]);
    expect(LADDERS.hyper.map((r) => r.level)).toEqual(["node", "network", "all"]);
    expect(LADDERS.ledger.map((r) => r.level)).toEqual(["node", "layer", "all"]);
  });

  it("every ladder ends in an unconditional 'all' rung (the walk always resolves)", () => {
    for (const rungs of Object.values(LADDERS)) {
      const last = rungs[rungs.length - 1];
      expect(last.level).toBe("all");
      expect(last.active(sel())).toBe(true);
    }
  });

  it("active() truth table — geo", () => {
    const [node, cohort, country, network] = LADDERS.geo;
    expect(node.active(sel({ inspectIsNode: true }))).toBe(true);
    expect(node.active(sel())).toBe(false);
    expect(cohort.active(sel({ cohort: COHORT }))).toBe(true);
    expect(cohort.active(sel())).toBe(false);
    expect(country.active(sel({ country: "DE" }))).toBe(true);
    expect(country.active(sel())).toBe(false);
    expect(network.active(sel({ filter: "dor" }))).toBe(true);
    expect(network.active(sel({ filter: "all" }))).toBe(false);
  });

  it("active() truth table — hyper and ledger", () => {
    expect(LADDERS.hyper[0].active(sel({ inspectIsNode: true }))).toBe(true);
    expect(LADDERS.hyper[1].active(sel({ filter: "dag" }))).toBe(true);
    expect(LADDERS.hyper[1].active(sel())).toBe(false);
    expect(LADDERS.ledger[0].active(sel({ inspectIsNode: true }))).toBe(true);
    expect(LADDERS.ledger[1].active(sel({ layerId: "ml0" }))).toBe(true);
    expect(LADDERS.ledger[1].active(sel())).toBe(false);
  });

  it("resolver keys are view-prefixed and unique within a view", () => {
    for (const [view, rungs] of Object.entries(LADDERS)) {
      const keys = rungs.map((r) => r.resolver);
      expect(new Set(keys).size).toBe(keys.length);
      for (const k of keys) expect(k.startsWith(view === "hyper" ? "hyper" : view)).toBe(true);
    }
  });

  it("finerLevels — the deselect-stepping data pickActions consumes", () => {
    expect(finerLevels("geo", "country")).toEqual(["node", "cohort"]);
    expect(finerLevels("geo", "cohort")).toEqual(["node"]);
    expect(finerLevels("geo", "node")).toEqual([]);
    expect(finerLevels("ledger", "layer")).toEqual(["node"]);
    expect(finerLevels("hyper", "network")).toEqual(["node"]);
  });

  it("carry policy — universal subjects carry, view-scoped rungs clear (spec Part 2)", () => {
    expect(LEVEL_CARRY.node).toBe("always");
    expect(LEVEL_CARRY.network).toBe("always");
    expect(LEVEL_CARRY.cohort).toBe("view-scoped");
    expect(LEVEL_CARRY.country).toBe("view-scoped");
    expect(LEVEL_CARRY.layer).toBe("view-scoped");
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL** (`npx vitest run src/engine/domain/focusLadder.test.ts` → module not found).

- [ ] **Step 3: Implement `src/engine/domain/focusLadder.ts`**

```ts
// The FOCUS/ZOOM LADDER as data (spec 2026-07-18) — the per-view subject-level contract the
// Engine's camera resolution walks and pickActions' deselect stepping derives from. One rung
// per committable level, finest→coarsest; the Engine calls the first ACTIVE rung's resolver
// and falls through on resolver failure (unlocatable node, topology not loaded). Resolvers
// are NAMED here but IMPLEMENTED as Engine methods — they carry real scene side effects
// (globe lean/spin, autoRotate) that don't belong in domain/. viewPolicy's sibling idiom.
import type { View3D } from "./viewTransition";

export type FocusLevel = "node" | "cohort" | "country" | "layer" | "network" | "all";

// The committed cohort (city × provider) selection — geo-only, country-scoped. Matches
// GeoExplore's cohort key fields; internal name stays `cohort`, user-facing copy says
// "provider" (spec Part 6 records the deliberate two-register naming).
export interface CohortSel { cc: string; city: string | null; isp: string | null }

// Plain selection snapshot the Engine builds from the store each resolve — keeps the table
// store-free (domain rule).
export interface SelectionSnapshot {
  inspectIsNode: boolean;
  cohort: CohortSel | null;
  country: string | null;
  layerId: string | null;
  filter: string; // "all" | "dag" | metagraph id
}

export type ResolverKey =
  | "geoNode" | "geoCohort" | "geoCountry" | "geoNetwork" | "geoOverview"
  | "hyperNode" | "hyperNetwork" | "hyperOverview"
  | "ledgerNode" | "ledgerLayer" | "ledgerOverview";

export interface Rung {
  level: FocusLevel;
  active(sel: SelectionSnapshot): boolean;
  resolver: ResolverKey;
}

// Finest→coarsest; the last rung is unconditional so the walk always resolves.
export const LADDERS: Record<View3D, Rung[]> = {
  geo: [
    { level: "node",    active: (s) => s.inspectIsNode,    resolver: "geoNode" },
    { level: "cohort",  active: (s) => s.cohort != null,   resolver: "geoCohort" },
    { level: "country", active: (s) => s.country != null,  resolver: "geoCountry" },
    { level: "network", active: (s) => s.filter !== "all", resolver: "geoNetwork" },
    { level: "all",     active: () => true,                resolver: "geoOverview" },
  ],
  hyper: [
    { level: "node",    active: (s) => s.inspectIsNode,    resolver: "hyperNode" },
    { level: "network", active: (s) => s.filter !== "all", resolver: "hyperNetwork" },
    { level: "all",     active: () => true,                resolver: "hyperOverview" },
  ],
  ledger: [
    { level: "node",    active: (s) => s.inspectIsNode,    resolver: "ledgerNode" },
    { level: "layer",   active: (s) => s.layerId != null,  resolver: "ledgerLayer" },
    { level: "all",     active: () => true,                resolver: "ledgerOverview" },
  ],
};

// Cross-view carry (spec Part 2): a rung that exists in only one view clears when leaving
// that view; universal subjects carry. The snapshot subject is NOT a rung — its pin/follow
// behaviour stays with FollowController + snapshotSelectActions.
export const LEVEL_CARRY: Record<Exclude<FocusLevel, "all">, "always" | "view-scoped"> = {
  node: "always",
  network: "always",
  cohort: "view-scoped",
  country: "view-scoped",
  layer: "view-scoped",
};

// The levels FINER than `level` in this view's ladder — the deselect-stepping data
// pickActions derives its drop-the-finer rules from (one list, two consumers).
export function finerLevels(view: View3D, level: FocusLevel): FocusLevel[] {
  const order = LADDERS[view].map((r) => r.level);
  const i = order.indexOf(level);
  return i < 0 ? [] : order.slice(0, i);
}
```

- [ ] **Step 4: Run tests — expect PASS**: `npx vitest run src/engine/domain/focusLadder.test.ts`, then full `npm test` + `npx tsc --noEmit` (the new module is inert — no consumers yet; `domainExportCoverage` is satisfied by the colocated test referencing every value export).

- [ ] **Step 5: Commit** — `feat(domain): focusLadder — per-view rung tables, carry policy, finerLevels`

---

### Task 2: store `cohort` channel + `"cohort"` action + pickActions builders/ancestry

**Files:**
- Modify: `src/store/store.ts` (SelSlot + cohort channel), `src/store/applyClickActions.ts`
- Modify: `src/engine/domain/pickActions.ts`
- Modify: `components/selectionBoundary.test.ts` (regex gains `Cohort`)
- Test: `src/engine/domain/pickActions.test.ts` (extend), `src/store/applyClickActions.test.ts` (extend)

**Interfaces:**
- Consumes: `CohortSel`, `finerLevels` from Task 1.
- Produces:
  - store: `cohort: CohortSel | null`, `setCohort(c: CohortSel | null)`, `SelSlot` gains `"country" | "cohort"` (bumped by `setCountry`/`setCohort` — the facts-card slots Task 8 renders).
  - `ClickAction` gains `| { kind: "cohort"; sel: CohortSel | null }`.
  - `cohortToggleActions(c: CohortSel, current: { cohort: CohortSel | null; hasInspect: boolean }): ClickAction[]`.
  - `sameCohort(a: CohortSel | null, b: CohortSel | null): boolean` (exported for tests + GeoExplore's ✓).
  - `nodeSelectActions` opts gain `{ ledgerLayerId?: string | null }`; geo ancestry now emits `cohort` (from `p.geo`), ledger emits `layer` (browser row's floor, else `autoLayerForNode`).
  - `countryToggleActions` current gains `{ cohort: CohortSel | null }` and clears it.

- [ ] **Step 1: Write the failing tests**

Append to `src/engine/domain/pickActions.test.ts` (imports: add `cohortToggleActions, sameCohort` from `./pickActions`, `finerLevels` from `./focusLadder`):

```ts
const CO = { cc: "DE", city: "Falkenstein", isp: "Hetzner" };

describe("cohortToggleActions — the provider/cohort rung toggle (spec Part 4)", () => {
  it("commits the cohort, dropping a selected node first (zoom-level rule)", () => {
    expect(cohortToggleActions(CO, { cohort: null, hasInspect: true })).toEqual([
      { kind: "inspect", pick: null },
      { kind: "cohort", sel: CO },
    ]);
  });
  it("re-clicking the committed cohort clears it (one toggle language)", () => {
    expect(cohortToggleActions(CO, { cohort: CO, hasInspect: false })).toEqual([
      { kind: "cohort", sel: null },
    ]);
  });
  it("sameCohort matches by cc+city+isp, null-safe", () => {
    expect(sameCohort(CO, { ...CO })).toBe(true);
    expect(sameCohort(CO, { ...CO, isp: "OVH" })).toBe(false);
    expect(sameCohort(null, CO)).toBe(false);
    expect(sameCohort(null, null)).toBe(false); // no committed cohort ≠ "same"
  });
});

describe("ladder-derived stepping — pickActions cannot drift from focusLadder", () => {
  it("the country toggle drops exactly geo's finer levels (node + cohort)", () => {
    const acts = countryToggleActions("DE", { country: null, hasInspect: true, cohort: CO });
    const dropped = acts.filter((a) => (a.kind === "inspect" && a.pick === null) || (a.kind === "cohort" && a.sel === null));
    // finerLevels("geo","country") = ["node","cohort"] — one clearing action per finer level.
    expect(finerLevels("geo", "country")).toEqual(["node", "cohort"]);
    expect(dropped).toHaveLength(2);
    expect(acts[acts.length - 1]).toEqual({ kind: "country", cc: "DE" });
  });
  it("the cohort toggle drops exactly geo's finer levels (node)", () => {
    expect(finerLevels("geo", "cohort")).toEqual(["node"]);
    const acts = cohortToggleActions(CO, { cohort: null, hasInspect: true });
    expect(acts.filter((a) => a.kind === "inspect")).toHaveLength(1);
  });
});

describe("nodeSelectActions ancestry (spec Part 3 — full-ancestry rule)", () => {
  const geoPick = {
    kind: "metanode", meta: { id: "dor" },
    geo: { cc: "DE", city: "Falkenstein", isp: "Hetzner" },
  } as unknown as PickDescriptor;
  it("geo: filter → country → cohort → inspect LAST", () => {
    const acts = nodeSelectActions(geoPick, { mode: "geo", currentFilter: "all" });
    expect(acts.map((a) => a.kind)).toEqual(["filter", "country", "cohort", "inspect"]);
    expect(acts[2]).toEqual({ kind: "cohort", sel: { cc: "DE", city: "Falkenstein", isp: "Hetzner" } });
  });
  it("geo: a pick without isp/city still commits its cohort (nullable fields)", () => {
    const p = { kind: "l0", node: { id: "x" }, geo: { cc: "FI" } } as unknown as PickDescriptor;
    const acts = nodeSelectActions(p, { mode: "geo", currentFilter: "dag" });
    expect(acts.find((a) => a.kind === "cohort")).toEqual({ kind: "cohort", sel: { cc: "FI", city: null, isp: null } });
  });
  it("ledger: browser row commits its parent floor before inspect", () => {
    const acts = nodeSelectActions(geoPick, { mode: "ledger", currentFilter: "dor", ledgerLayerId: "ml1" });
    expect(acts.map((a) => a.kind)).toEqual(["layer", "inspect"]);
    expect(acts[0]).toEqual({ kind: "layer", pick: { kind: "layer", layerId: "ml1" } });
  });
  it("ledger: scene click commits the autoLayerForNode L0 floor", () => {
    const acts = nodeSelectActions(geoPick, { mode: "ledger", currentFilter: "dor" });
    expect(acts[0]).toEqual({ kind: "layer", pick: { kind: "layer", layerId: "ml0" } });
  });
  it("deselect stays a bare inspect-clear", () => {
    expect(nodeSelectActions(geoPick, { mode: "geo", currentFilter: "all", deselect: true }))
      .toEqual([{ kind: "inspect", pick: null }]);
  });
});
```

Append to `src/store/applyClickActions.test.ts`:

```ts
it('"cohort" maps to setCohort (and only that)', () => {
  const CO = { cc: "DE", city: "Falkenstein", isp: "Hetzner" };
  applyClickActions([{ kind: "cohort", sel: CO }]);
  expect(useStore.getState().cohort).toEqual(CO);
  applyClickActions([{ kind: "cohort", sel: null }]);
  expect(useStore.getState().cohort).toBeNull();
});
it("setCohort participates in the selStack (the provider card slot)", () => {
  useStore.getState().setCohort({ cc: "DE", city: null, isp: null });
  expect(useStore.getState().selStack[0]).toBe("cohort");
  useStore.getState().setCohort(null);
  expect(useStore.getState().selStack).not.toContain("cohort");
});
```

- [ ] **Step 2: Run — expect FAIL** (`npx vitest run src/engine/domain/pickActions.test.ts src/store/applyClickActions.test.ts`).

- [ ] **Step 3: Implement**

`src/store/store.ts`:
- `export type SelSlot = "node" | "snap" | "layer" | "country" | "cohort";`
- Import `type { CohortSel } from "@/src/engine/domain/focusLadder";` (type-only — the store may not import domain values, and doesn't).
- State: `cohort: CohortSel | null;` + `setCohort: (c: CohortSel | null) => void;`; initial `cohort: null`.
- `setCountry: (country) => set((s) => ({ country, selStack: bumpStack(s.selStack, "country", !!country) })),`
- `setCohort: (cohort) => set((s) => ({ cohort, selStack: bumpStack(s.selStack, "cohort", !!cohort) })),`

`src/engine/domain/pickActions.ts`:
- Import `type { CohortSel } from "./focusLadder";` and keep `autoLayerForNode` (used below).
- `ClickAction` union gains: `| { kind: "cohort"; sel: CohortSel | null } // commit/clear the city×provider cohort (geo)`.
- New exports:

```ts
// Cohort identity — cc+city+isp (all three; city/isp may be null and must match as null).
export const sameCohort = (a: CohortSel | null, b: CohortSel | null): boolean =>
  !!a && !!b && a.cc === b.cc && a.city === b.city && a.isp === b.isp;

// The cohort/provider zoom-level TOGGLE (spec Part 4) — GeoExplore's cohort row. Entering/
// leaving the cohort level drops the finer node selection first (finerLevels("geo","cohort")).
export function cohortToggleActions(
  c: CohortSel,
  current: { cohort: CohortSel | null; hasInspect: boolean },
): ClickAction[] {
  const acts: ClickAction[] = [];
  if (current.hasInspect) acts.push({ kind: "inspect", pick: null });
  acts.push({ kind: "cohort", sel: sameCohort(current.cohort, c) ? null : c });
  return acts;
}
```

- `countryToggleActions`: `current` gains `cohort: CohortSel | null`; body drops the cohort too (before the country move — same zoom-level rule):

```ts
export function countryToggleActions(
  cc: string,
  current: { country: string | null; hasInspect: boolean; cohort: CohortSel | null },
): ClickAction[] {
  const acts: ClickAction[] = [];
  if (current.hasInspect) acts.push({ kind: "inspect", pick: null });
  if (current.cohort) acts.push({ kind: "cohort", sel: null });
  acts.push({ kind: "country", cc: current.country === cc ? null : cc });
  return acts;
}
```

- `nodeSelectActions`: opts gain `ledgerLayerId?: string | null`; after the country push, geo
  also pushes the node's cohort ancestry; ledger pushes layer ancestry FIRST (before
  inspect, so the node camera still wins — inspect stays LAST):

```ts
export function nodeSelectActions(
  p: PickDescriptor,
  opts: { mode: Mode; currentFilter: string; deselect?: boolean; ledgerLayerId?: string | null },
): ClickAction[] {
  if (opts.deselect) return [{ kind: "inspect", pick: null }];
  const acts: ClickAction[] = [];
  const netId = pickNetId(p);
  if (netId && netId !== opts.currentFilter) acts.push({ kind: "filter", id: netId });
  if (opts.mode === "geo" && "geo" in p && p.geo?.cc) {
    acts.push({ kind: "country", cc: p.geo.cc });
    // Full-ancestry rule (spec Part 3): the node's cohort commits too, so deselect steps
    // node → cohort → country → network regardless of how the node was reached.
    acts.push({ kind: "cohort", sel: { cc: p.geo.cc, city: p.geo.city ?? null, isp: p.geo.isp ?? null } });
  }
  if (opts.mode === "ledger") {
    // Ledger ancestry: the browser row's parent floor, else the node's related-L0 floor
    // (the same mapping the view-entry auto-commit uses).
    const layerId = opts.ledgerLayerId ?? autoLayerForNode(p.kind);
    if (layerId) acts.push({ kind: "layer", pick: { kind: "layer", layerId } });
  }
  acts.push({ kind: "inspect", pick: p });
  return acts;
}
```

- Update the two `countryToggleActions` call sites inside `clickActions` (empty-click path):
  `current` already flows through — extend `clickActions`' `current` type with
  `cohort: CohortSel | null` and pass it along.

`src/store/applyClickActions.ts` — new case:

```ts
case "cohort":
  st.setCohort(a.sel);
  break;
```

`components/selectionBoundary.test.ts` — the regex gains the new setter:

```ts
const SELECTION_SETTERS = /\bset(Filter|Country|Inspect|Snap|Layer|Following|Cohort)\b/;
```

- Fix the existing callers the type changes break: `Engine._handleClick`'s `clickActions`
  `current` object gains `cohort: this.cohortSel` (add a `private cohortSel: CohortSel | null = null` field, kept in sync in Task 3's subscription); `GeoExplore.drill` passes
  `cohort: useStore.getState().cohort` (read via a store selector, not a setter — allowed).

- [ ] **Step 4: Run — expect PASS**: targeted files, then `npm test` + `npx tsc --noEmit`. Expect `selectionBoundary` still green (no component writes `setCohort` directly).

- [ ] **Step 5: Commit** — `feat(store+pickActions): cohort channel, cohort toggle, full-ancestry node selects`

---

### Task 3: Engine `_resolveFocus` — the one ladder walk (pixel-neutral refactor)

**Files:**
- Modify: `src/engine/Engine.ts`

**Interfaces:**
- Consumes: `LADDERS`, `SelectionSnapshot`, `ResolverKey` (Task 1); store `cohort` (Task 2).
- Produces: `private _resolveFocus(): void` + `private _resolvers: Record<ResolverKey, () => boolean>` — Task 5 fills in the real `geoCohort` resolver; here it returns `false` (inert fall-through, so behaviour is unchanged until the feature lands).

This task is a REFACTOR: after it, every existing interaction frames identically. The
resolvers WRAP the existing `_focus*` bodies — move code, don't rewrite math.

- [ ] **Step 1: Build the resolver map + walk**

Add to `Engine.ts` (construction-time field + two methods):

```ts
// The ladder walk (domain/focusLadder): first ACTIVE rung whose resolver succeeds wins the
// camera; resolver failure (unlocatable subject, topology not loaded) falls through — the
// per-view fallback chains, made uniform. Resolvers are the ONLY camera-framing entry points
// for selection state; they keep their scene side effects (globe lean/spin, autoRotate).
private _resolvers: Record<ResolverKey, () => boolean> = {
  geoNode: () => {
    const p = useStore.getState().inspect;
    if (!p || !("geo" in p) || !this.globe.focusNode(p.geo)) return false;
    this.ctx.controls.autoRotate = false;
    this._focusNode();
    return true;
  },
  geoCohort: () => false, // Task 5 (feature) — inert fall-through until then
  geoCountry: () => {
    if (this.country == null) return false;
    const shape = this.globe.focusCountryShape(this.country);
    if (shape) {
      countryFraming(shape.latAngle, shape.angularRadius, this._framingOut);
      this._tweenTo(this._framingOut.pos, this._framingOut.target);
      return true;
    }
    // Degraded mode while the countries topology loads: the node-mean concentration framing
    // (still a COUNTRY-level pose — this rung handles its own fallback, it does not fall to
    // the network rung; matches the pre-ladder behaviour).
    const R = this.globe.focusDensest(true);
    if (R == null) return false;
    this._focusGeo(R);
    return true;
  },
  geoNetwork: () => {
    const R = this.globe.focusDensest(true);
    if (R == null) return false;
    this.focus("geoNetwork");
    return true;
  },
  geoOverview: () => {
    this.globe.focusDensest(false);
    this.focus("geo");
    return true;
  },
  hyperNode: () => {
    const p = useStore.getState().inspect;
    const id = !p ? null : p.kind === "metanode" ? p.node?.ip : p.kind === "l0" || p.kind === "l1" ? p.node?.id : null;
    const pos = id ? this.globe.hyperWorldPos(id) : null;
    if (!pos) return false;
    this.ctx.controls.autoRotate = false;
    this.layers.focusId = null;
    hyperNodeFraming(pos, this._framingOut);
    this._tweenTo(this._framingOut.pos, this._framingOut.target);
    return true;
  },
  hyperNetwork: () => {
    this.globe.focusDensest(false);
    this._focusFilter(this.filter); // handles hub-not-found by falling to overview internally
    return true;
  },
  hyperOverview: () => {
    this.globe.focusDensest(false);
    this._focusFilter("all"); // the existing "all" path: focusId cleared, tilt eased, overview pose
    return true;
  },
  ledgerNode: () => {
    const p = useStore.getState().inspect;
    return !!p && this._focusLedgerNode(p);
  },
  ledgerLayer: () => {
    const layerId = useStore.getState().layer?.layerId;
    if (!layerId) return false;
    this._focusLayer(layerId);
    return true;
  },
  ledgerOverview: () => {
    this.focus("overview");
    return true;
  },
};

private _resolveFocus(): void {
  const st = useStore.getState();
  if (this.mode !== "hyper" && this.mode !== "geo" && this.mode !== "ledger") return;
  const sel: SelectionSnapshot = {
    inspectIsNode: !!st.inspect && (st.inspect.kind === "l0" || st.inspect.kind === "l1" || st.inspect.kind === "metanode"),
    cohort: st.cohort,
    country: this.country,
    layerId: st.layer?.layerId ?? null,
    filter: this.filter,
  };
  for (const rung of LADDERS[this.mode]) {
    if (rung.active(sel) && this._resolvers[rung.resolver]()) return;
  }
}
```

Notes for the implementer (parity traps):
- `geoNetwork`/`geoOverview`: the pre-ladder `_applyGeoFocus` called `focusDensest(narrowed)`
  with `narrowed = filter !== "all" || country != null` — the rung split reproduces it: the
  network rung is only reached when `filter !== "all"` (→ `focusDensest(true)`), the all
  rung only when nothing is selected (→ `focusDensest(false)`).
- `hyperNode` failure previously fell to `focusDensest(false) + _focusFilter(filter)` — the
  ladder reproduces it: node rung fails → network rung (filter set) or all rung.
- `geoNode` previously checked kind before `focusNode`; the snapshot's `inspectIsNode`
  gate on the rung covers it — the resolver only re-checks `"geo" in p`.

- [ ] **Step 2: Rewire the callers**

Replace the four hand-rolled walks with `_resolveFocus()`:
- Store subscription: the `inspect`-change geo branch (`this._focusInspectNode(st.inspect)`)
  and ledger branch (`this._focusLedgerInspect(st.inspect)`) both become `this._resolveFocus()`;
  the `country`-change branch keeps `this.country = st.country; this.globe.setCountry(st.country);`
  then calls `this._resolveFocus()`; the `layer`-change ledger branch
  (`if (st.layer) this._focusLayer(...) else this.focus("overview")`) becomes `this._resolveFocus()`.
  Add the new cohort branch (kept inert until Task 5 wires the scene):
  ```ts
  if (st.cohort !== prev.cohort) {
    this.cohortSel = st.cohort;
    if (st.mode === "geo") this._resolveFocus();
  }
  ```
- `applyFilter(focusCamera)`: the geo branch's `if (focusCamera) this._applyGeoFocus();`,
  the hyper branch's `if (focusCamera) { this.globe.focusDensest(false); this._focusFilter(this.filter); }`,
  and the ledger branch's `if (focusCamera && selLayer) this._focusLayer(...)` ALL become
  `if (focusCamera) this._resolveFocus();`. ⚠️ Ledger parity: pre-ladder, a filter change
  with NO layer committed left the camera alone; post-ladder the all rung re-tweens to
  `overview` — the pose it is already at (the only way to be in settled ledger without a
  layer), so the tween is a no-op in practice. Verify live.
- `_setMode`'s ledger entry block: keep the non-camera lines (focusDensest(false), autoRotate,
  setFilter, `_refreshLedger`, the `autoLayerForNode` auto-commit through `applyClickActions`)
  and replace the camera ladder (`if (isNode && this._focusLedgerNode…) else if (layerId)…
  else this.focus("overview")`) with `this._resolveFocus()` (the auto-commit runs first, so
  the snapshot sees the layer). Same in the hyper/geo tail: `this._focusSelection()` becomes
  `this._resolveFocus()`.
- DELETE the now-unreferenced `_focusSelection`, `_applyGeoFocus`, `_focusInspectNode`,
  `_focusHyperNode`, `_focusLedgerInspect` (their bodies moved into resolvers). KEEP
  `_focusNode`, `_focusGeo`, `_focusLayer`, `_focusFilter`, `_focusLedgerNode` (shared
  helpers the resolvers call). Grep for stragglers: `grep -n "_focusSelection\|_applyGeoFocus\|_focusInspectNode\|_focusHyperNode\|_focusLedgerInspect" src/`.
  ⚠️ `_applyDestLayout` (transition boundary) calls into the deleted walks — point its
  per-view camera application at `_resolveFocus()` as well (it runs at the boundary with
  committed state, which is exactly the ladder's input).

- [ ] **Step 3: Verify** — `npx tsc --noEmit` + `npm test` green. Live pass (chrome-devtools MCP): in each 3D view — commit a filter, drill a country (geo), select a node from the explorer, deselect stepwise, switch views with a node selected — every framing identical to `master` (side-by-side screenshots).

- [ ] **Step 4: Commit** — `refactor(engine): _resolveFocus walks the focusLadder — four hand-rolled camera walks collapsed`

---

### Task 4: folded behaviour fixes — view-scoped carry + reversal gap

**Files:**
- Modify: `src/engine/Engine.ts`

**Interfaces:** consumes `_resolveFocus` (Task 3), `LEVEL_CARRY` semantics (Task 1 — the
Engine implements the policy; the table documents it).

- [ ] **Step 1: View-scoped clears in `setMode`**

The existing country-clear block generalizes (spec: view-scoped rungs clear when leaving
their view). Replace it with:

```ts
// View-scoped selections (focusLadder.LEVEL_CARRY): country + cohort live only in geo,
// layer only in ledger — clear them when the destination view isn't theirs, so no
// view-scoped card/framing lingers (the layer card used to follow into hyper/geo).
const st0 = useStore.getState();
if (mode !== "geo") {
  if (this.country != null) { this.country = null; this.globe.setCountry(null); }
  if (st0.country != null) st0.setCountry(null);
  if (st0.cohort != null) st0.setCohort(null);
}
if (mode !== "ledger" && st0.layer != null) st0.setLayer(null);
```

⚠️ Parity note: the old block cleared country on EVERY view change (even into geo); the new
gate (`mode !== "geo"`) keeps hyper→geo entries from wiping nothing (country can only be
set in geo, so entering geo never has one) — net behaviour identical for country, NEW for
cohort/layer. The layer clear changes what `_setMode`'s ledger-entry block sees: a RE-entry
now never resumes a stale layer (the auto-commit path still derives one from a selected
node) — this is the spec's labelled behaviour change.

- [ ] **Step 2: Reversal-gap re-resolve**

In `setMode`'s 3D→3D branch, the reverse-to-origin retarget is the path where
`this.transition.phase === "in"` right after `start()` (the existing `_pendingBoundary`
null-out). Set a flag there:

```ts
this._pendingBoundary = this.transition.phase === "in" ? null : mode;
this._resettleFocus = this.transition.phase === "in"; // no boundary will fire — re-derive at settle
```

Add the field `private _resettleFocus = false;`. In `_integrateInputs`, where the
transition tick is processed, detect completion (`transition.active()` false this frame,
was true last frame — reuse/extend the existing settled-edge handling if present, else
track `private _wasTransitionActive = false`):

```ts
if (this._wasTransitionActive && !this.transition.active() && this._resettleFocus) {
  this._resettleFocus = false;
  this._resolveFocus(); // a mid-OUT commit's framing was held — re-derive from committed state
}
this._wasTransitionActive = this.transition.active();
```

(Any commit landing mid-OUT already updated the STORE; only the camera was held by
`holdCamera()` — the resolve replays it against the settled origin view.)

- [ ] **Step 3: Verify live** — (a) commit a layer in ledger, switch to geo: the layer card
clears (no lingering card), re-entering ledger rests at overview; with a node selected the
auto-layer still commits. (b) `?slowmo=4`: start hyper→geo, commit a filter mid-OUT, flip
back to hyper before the boundary — on settle the camera flies to the committed hub (was:
stale). `npm test` + `npx tsc --noEmit` green.

- [ ] **Step 4: Commit** — `fix(engine): view-scoped carry (layer/cohort/country) + reversal-gap re-resolve at settle`

---

### Task 5: cohort 3D — `cohortFraming`, `Globe.focusCohort`/`setSelectedCohort`, live rung

**Files:**
- Modify: `src/engine/domain/cameraRig.ts` (+ its test), `src/engine/scene/Globe.ts`, `src/engine/Engine.ts`

**Interfaces:**
- Produces: `cohortFraming(out: CameraFraming): void` (cameraRig); `Globe.setSelectedCohort(sel: CohortSel | null): void` (resolves member ids + representative geo internally); `Globe.focusCohort(): boolean` (leans the globe to the resolved cohort centroid; false if unresolved/empty).
- Consumes: `CohortSel` (Task 1), the `geoCohort` resolver stub (Task 3).

- [ ] **Step 1: Failing test for the framing**

Append to `src/engine/domain/cameraRig.test.ts`:

```ts
it("cohortFraming sits BETWEEN the country band and the node pose (the ladder's zoom order)", () => {
  const out = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  cohortFraming(out);
  const cohortDist = out.pos.length();
  nodeFraming(out);
  const nodeDist = out.pos.length();
  // Wider than the node pose, tighter than the country framing floor (countryShape dist ≥ 4.3
  // from R≈15-based math — assert against the node pose + the geoNetwork preset instead).
  expect(cohortDist).toBeGreaterThan(nodeDist);
  expect(cohortDist).toBeLessThan(FOCI.geoNetwork.pos.length());
});
```

- [ ] **Step 2: Implement `cohortFraming`** in `cameraRig.ts` (after `nodeFraming`):

```ts
// ---- the geo COHORT/provider pose ----------------------------------------------------------
// One rung wider than the node pose (spec Part 4): frames the whole honeycomb stack field of
// a committed city×provider cohort. Rides the SAME Globe lean contract as nodeFraming
// (focusCohort aims the cohort centroid with the NODE_RAISE lift), so like nodeFraming it is
// ABSOLUTE / CAM_ZOOM-dolly-EXEMPT (composed far-up look-at — see the CAM_ZOOM note).
// Seed values tuned live against Falkenstein·Hetzner (the tallest stack field).
export function cohortFraming(out: CameraFraming): void {
  out.pos.set(0, 5.4, 23.5);
  out.target.set(0, 18.8, 2);
}
```

- [ ] **Step 3: Globe support** (`src/engine/scene/Globe.ts`)

Next to `_selectedNodeId`/`setSelectedNode`, add (all event-time — mark allocations):

```ts
private _selCohort: CohortSel | null = null;
private _selCohortIds: Set<string> | null = null;   // committed-glow membership (event-time)
private _selCohortDir = new THREE.Vector3();        // resolved centroid unit dir (scratch)
private _selCohortOk = false;

// Commit/clear the cohort selection: resolve member ids + the representative direction from
// the CURRENT node records by cc+city+isp match (event-time — re-run by the data-rebuild
// sites exactly like setSelectedNode's re-resolve). Membership matching mirrors
// GeoExplore.cohortsOf: geoPrimary rows only, keyed on geo.cc/city/isp.
setSelectedCohort(sel: CohortSel | null): void {
  this._selCohort = sel;
  this._selCohortIds = null;
  this._selCohortOk = false;
  if (!sel) return;
  const ids = new Set<string>(); // event-time
  let lat = 0, lon = 0, n = 0;
  const scan = (rows: NodeRecLike[]) => { /* iterate this.nodes + this.metaNodes records;
    for each geoPrimary row whose pick.geo matches sel.cc && (geo.city ?? null) === sel.city
    && (geo.isp ?? null) === sel.isp: add its hover key (same id the hoverCohort set uses)
    and accumulate lat/lon */ };
  scan(this.nodes); scan(this.metaNodes);
  if (n === 0) return;
  this._selCohortIds = ids;
  this._selCohortDir.copy(latLonToVec3(lat / n, lon / n, 1)).normalize(); // event-time
  this._selCohortOk = true;
}

// Aim the committed cohort's centroid to the front — the same lean contract as focusNode
// (NODE_RAISE), so cohortFraming can be one fixed pose. false = nothing resolved (caller
// falls down the ladder).
focusCohort(): boolean {
  if (!this._selCohortOk) return false;
  this._aimAt(this._selCohortDir, Math.PI / 2, NODE_RAISE);
  return true;
}
```

(Write `scan` as a real private method over the concrete record arrays — follow how
`setSelectedNode`/`_frameCtx` reads them; `NodeRecLike` here is shorthand for the plan, use
the file's actual record types.) The committed GLOW: in `_frameCtx`, the FrameCtx's
`hoverCohort` consumer already glows a member set — extend the ctx write to
`c.hoverCohort = this._hoverCohort ?? this._selCohortIds;` (hover preview wins while
active; the committed set holds otherwise — same strength, per the hover-previews-commit
rule). Re-resolve on data rebuilds: add `this.setSelectedCohort(this._selCohort);` beside
BOTH existing `setSelectedNode(this._selectedNodeId)` re-resolve sites.

- [ ] **Step 4: Engine wiring** — replace the Task 3 stub:

```ts
geoCohort: () => {
  if (!this.globe.focusCohort()) return false;
  this.ctx.controls.autoRotate = false;
  cohortFraming(this._framingOut);
  this._tweenTo(this._framingOut.pos, this._framingOut.target, false); // dolly-exempt, like nodeFraming
  return true;
},
```

And in the subscription's cohort branch (Task 3), forward the commit to the scene BEFORE
resolving: `this.globe.setSelectedCohort(st.cohort);` (in every mode — the glow is
geo-gated by the fabric's morph ramps; the camera resolve stays geo-gated).

- [ ] **Step 5: Verify** — `npm test` (incl. the alloc gate: no per-frame allocations added — the resolve work is event-time) + `npx tsc --noEmit`. Live: commit will only be reachable from Task 6's UI, so drive the store directly via the devtools MCP (`evaluate_script` on the page: `useStore` isn't global — instead temporarily seed `cohort` in `store.ts` defaults, screenshot, revert; or wait and verify in Task 6). Framing check: stacks centred, whole field visible, deselect steps to country pose.

- [ ] **Step 6: Commit** — `feat(engine+scene): geo cohort rung — cohortFraming, focusCohort, committed stack glow`

---

### Task 6: GeoExplore — committable cohort rows

**Files:**
- Modify: `components/GeoExplore.tsx`

**Interfaces:** consumes `cohortToggleActions`, `sameCohort` (Task 2), store `cohort`.

- [ ] **Step 1: Wire the commit**

- Read the committed cohort: `const cohortSel = useStore((s) => s.cohort);`
- Row commit handler (replaces the pure open/close in `onToggle` — disclosure AND commit in
  one click, the country-row idiom):

```ts
const commitCohort = (c: Cohort) => {
  const sel: CohortSel = { cc, city: c.city, isp: c.isp }; // cc = the enclosing country row's cc
  applyClickActions(cohortToggleActions(sel, { cohort: cohortSel, hasInspect: !!selPick }));
};
```

- In the cohort `DisclosureRow`'s `onToggle`: keep the `setOpenCohort` disclosure logic and
  the single-node shortcut, and ADD `commitCohort(c)` — the single-node shortcut's
  `selectNode` already commits the cohort ancestry via Task 2's `nodeSelectActions`, so in
  the `c.rows.length === 1` branch call ONLY `selectNode` (not `commitCohort` too — the
  ancestry handles it; a double toggle would clear it).
- Committed look: compute `const on = sameCohort(cohortSel, { cc, city: c.city, isp: c.isp });`
  and pass it into `DisclosureRow` — the row wears `SELECTED_ROW` + `SelectedRowMark` when
  `on` (mirror how the country row does it; keep `holdsSel`'s ✓ for the collapsed-with-
  selected-node case — `on` wins when both).
- The `drill` handler already passes `cohort` from Task 2's type change; deselecting the
  country clears the cohort through the table (no component logic).

- [ ] **Step 2: Verify live** — geo → drill Germany → click `Falkenstein · Hetzner`: camera
flies to the stack field, stacks glow steadily, row wears ✓; click a node inside: node zoom
wins, cohort stays committed; clear the node (card ×): camera steps BACK to the cohort pose;
re-click the row: cohort clears, camera steps to the country pose. Hover another cohort row:
preview glow still works (hover wins over committed set). Tune `cohortFraming` numbers live
if the field sits off-centre; keep them absolute. `npm test` + `npx tsc --noEmit`.

- [ ] **Step 3: Commit** — `feat(geo): cohort rows commit — zoom + steady glow + selection language`

---

### Task 7: LedgerPanel node browser + `nodeList` for ledger

**Files:**
- Modify: `components/LedgerPanel.tsx`, `src/engine/domain/viewPolicy.ts` (+ its test if it pins `nodeList`)

**Interfaces:** consumes `nodeSelectActions` (with `ledgerLayerId`, Task 2), store
`selNodes` (published for ledger once `nodeList: true`), `hoverCohort`/`hoverNodeId`
channels, `NodeRow`.

- [ ] **Step 1: Flip the policy** — `viewPolicy.ts` ledger row: `nodeList: false` → `true`
(comment: the ledger node browser reads `store.selNodes`). Update the viewPolicy test if it
pins the old value. `selNodes` publication (`Engine._publishLeaderboard`) is already
policy-driven — no Engine change.

- [ ] **Step 2: Disclosures in `LedgerPanel`**

The four node-kind floors by layer id: `ml1`, `ml0`, `hypl0`, `hypl1` (LEDGER_LAYERS ids;
`msnap`/`gl0` are snapshot floors — no disclosure; `rowProducers` has no panel row at all).
Structure per disclosing row, under the existing layer button (sibling, matching
GeoExplore's disclosure indent):

- Which nodes stand on a floor (derive from `store.selNodes` rows):
  - `ml1`: metanode rows whose `roles`/`layer` include `cl1` or `dl1`;
  - `ml0`: metanode rows with `l0`;
  - `hypl0`: validator rows (`pick.kind === "l0"`);
  - `hypl1`: validator rows (`pick.kind === "l1"`).
- For `ml0`/`ml1`, group rows by metagraph (`pick.kind === "metanode"` → `pick.meta.id`),
  one **cluster group row** per metagraph: `IdentityDot` (correct here — one lane, one
  metagraph) + name + count; `hypl0`/`hypl1` render their single cluster's node rows
  directly. Cluster rows are disclosures (single-open, GeoExplore's `openCohort` idiom) and
  hover-glow their members: `setHoverCohort(rows.map((r) => hoverKeyOf(r.pick)).filter(Boolean))`
  on enter, `null` on leave.
- Node id rows: reuse `NodePickerRow` if exportable from GeoExplore's module, else a local
  row with the same classes — `onSelect` runs:

```ts
applyClickActions(nodeSelectActions(r.pick, {
  mode: "ledger", currentFilter: filter, deselect: on, ledgerLayerId: floorId,
}));
```

  with `on` = selected-match by ip+layer (copy GeoExplore's `selIp`/`selLayer` logic), the ✓
  via `SelectedRowMark`, hover pairing via `hoverNodeId`.
- A layer row click keeps its existing commit (`layerToggleActions`) AND toggles its
  disclosure open (commit+expand in one click, the country-row idiom); the committed row
  auto-opens.

- [ ] **Step 3: Verify live** — ledger view: expand `Metagraph L0` → DOR group → click a
node id: the filter commits to DOR (ancestry), the layer card shows Metagraph L0, the
camera zooms to the chip (`ledgerNodeFraming`); the row wears ✓; clearing the node steps the
camera back to the layer pose. Hover a cluster row: the 3D stack glows. Empty-data floors
show an honest "No nodes reported." line (copy GeoExplore's empty state). `npm test` +
`npx tsc --noEmit`. NB `selectionBoundary` still green — all writes route through the
executor.

- [ ] **Step 4: Commit** — `feat(ledger): node browser — floors disclose lane clusters → node rows; nodeList on`

---

### Task 8: country + provider facts cards

**Files:**
- Modify: `components/railCards.ts`, `components/Inspector.tsx`, `components/InspectorCard.tsx`, `components/inspector/cards.tsx`, `components/icons.tsx` (two kind marks)
- Test: extend `components/railCards.test.ts` (or create if the manifest has no test yet — check first)

**Interfaces:** consumes store `country`, `cohort`, `selNodes`, `SelSlot` (Task 2);
produces `RailCardKind` gains `"country" | "cohort"`; `RailManifestState` gains
`country: string | null; cohort: CohortSel | null;`.

- [ ] **Step 1: Manifest entries** (`railCards.ts`)

```ts
function countryHint(s: RailManifestState): string | null {
  return s.mode === "geo" ? "Drill a country on the globe (or a row in the explorer) to inspect it." : null;
}
function cohortHint(s: RailManifestState): string | null {
  return s.mode === "geo" ? "Open a city · provider row in the explorer to inspect it." : null;
}
```

`detailsCards` slot order (fixed, stable): context, **country**, **cohort**, node, snap,
layer — the two new slots sit between the dossier and the node card (coarse→fine matches
the ladder; snapshot/layer unmoved at the tail). Entries:

```ts
const country: RailCard = {
  id: "country", kind: "country", icon: iconForPick("country"),
  subjectKey: s.country, present: s.country != null, hint: countryHint(s),
};
const cohort: RailCard = {
  id: "cohort", kind: "cohort", icon: iconForPick("cohort"),
  subjectKey: s.cohort ? `${s.cohort.cc}|${s.cohort.city}|${s.cohort.isp}` : null,
  present: s.cohort != null, hint: cohortHint(s),
};
```

`icons.tsx`: extend `iconForPick` with `"country"` → `MapPin` and `"cohort"` → `Server`
(lucide, monochrome — the one icon system).

- [ ] **Step 2: Card bodies** (`components/inspector/cards.tsx` + dispatch in
`InspectorCard.tsx` + slot rendering in `Inspector.tsx`)

Follow the layer card's exact pattern (eyebrow → title/titleKey → labelled body rows;
`RIGHT_CARD` frame; × = "Clear selection" through the executor —
`applyClickActions(countryToggleActions(cc, current))` for country /
`applyClickActions(cohortToggleActions(sel, current))` for cohort, i.e. the toggle CLEARS
because the subject is the committed one). All rows derive from `store.selNodes` (the
card's scope = the explorer's scope, deliberately — same data lane):

```tsx
// COUNTRY (eyebrow "COUNTRY", title `${ccToFlag(cc)} ${countryName}` from the rows,
// titleKey = cc): rows —
//   NODES     <count of selNodes with r.cc === cc>
//   SHARE     <count / selNodes.length as %>  (of the current selection)
//   CITIES    <distinct r.city, non-null>
//   PROVIDERS <distinct geo.isp over "geo" in r.pick, non-null>
// COHORT/provider card (eyebrow "PROVIDER", title `${city ?? "Unlocated"} · ${isp ?? "Unknown"}`,
// titleKey = the subjectKey string): rows —
//   NODES     <member count (sameCohort match on r.pick.geo)>
//   NETWORKS  <distinct networks among members — pickNetId per row — as IdentityDot + ticker list>
//   ASN       <first member's geo.asn ?? "—">
//   COUNTRY   <ccToFlag(cc) + country name>
```

Write these as real components (`CountryCard`, `ProviderCard`) with the repo's row idiom
(`Separator`-grouped labelled rows — copy a body block from the node card). `Inspector.tsx`
builds the manifest state around line 169 (`detailsCards({ mode, filter, inspect, snap,
layer, selNodesCount, filterLabel })`) — extend that object with `country: useStore((s) =>
s.country)` and `cohort: useStore((s) => s.cohort)` (new selectors beside the existing
ones), or `tsc` fails on the widened `RailManifestState`. Kind marks tint
via `text-[var(--filter-accent,var(--primary))]` (the standing rule). `Inspector.tsx`: add
the two slots to the render map + hue wiring (`filterAccent(filter)` for both — the country
is structural; the provider row has no single network hue, matching the explorer's no-dot
rule; per-network identity appears only on the NETWORKS row's dots).

- [ ] **Step 3: Manifest tests** — extend/create `components/railCards.test.ts`:

```ts
it("geo ghosts cover the whole ladder (country + cohort + node + context)", () => {
  const s = { mode: "geo", filter: "all", inspect: null, snap: null, layer: null,
    country: null, cohort: null, selNodesCount: 5, filterLabel: null } as RailManifestState;
  const hints = detailsCards(s).filter((c) => c.hint != null).map((c) => c.id);
  expect(hints).toEqual(expect.arrayContaining(["context", "country", "cohort", "node"]));
});
it("country/cohort cards never ghost outside geo", () => {
  for (const mode of ["hyper", "ledger"] as const) {
    const s = { mode, filter: "all", inspect: null, snap: null, layer: null,
      country: null, cohort: null, selNodesCount: 5, filterLabel: null } as RailManifestState;
    for (const id of ["country", "cohort"]) {
      expect(detailsCards(s).find((c) => c.id === id)?.hint).toBeNull();
    }
  }
});
```

- [ ] **Step 4: Verify live** — geo at rest: 4 quiet ghosts in order (dossier, country,
provider, node); drill a country → country card populates (flag, counts) with the edge
pulse; commit a cohort → provider card; the × on each steps the ladder exactly like the
row re-click. Tablet: the Details tray gains the two icons only when populated. `npm test`
+ `npx tsc --noEmit`.

- [ ] **Step 5: Commit** — `feat(rail): country + provider facts cards — full ladder coverage in the facts rail`

---

### Task 9: the ladder↔manifest boundary test

**Files:**
- Create: `components/railLadderBoundary.test.ts`

**Interfaces:** consumes `LADDERS`, `FocusLevel` (Task 1), `detailsCards`,
`RailManifestState` (Task 8).

- [ ] **Step 1: Write the test** (it should PASS immediately after Task 8 — it's the
regression gate for FUTURE rungs):

```ts
import { describe, it, expect } from "vitest";
import { LADDERS, type FocusLevel } from "@/src/engine/domain/focusLadder";
import { detailsCards, type RailManifestState } from "@/components/railCards";

// THE LADDER↔RAIL CONTRACT (spec Part 6): every committable ladder rung has a right-rail
// facts slot — a future rung cannot land without deciding its card. Exemptions must be
// EXPLICIT here with a reason, the allow-list way.
const LEVEL_CARD: Record<Exclude<FocusLevel, "all">, string> = {
  network: "context", node: "node", country: "country", cohort: "cohort", layer: "layer",
};
const EXEMPT: Partial<Record<Exclude<FocusLevel, "all">, string>> = {
  // (none today — add `level: "reason"` only with a spec decision)
};

const stateFor = (mode: RailManifestState["mode"]): RailManifestState => ({
  mode, filter: "all", inspect: null, snap: null, layer: null,
  country: null, cohort: null, selNodesCount: 5, filterLabel: null,
});

describe("ladder↔rail boundary — every rung has a facts slot", () => {
  for (const [view, rungs] of Object.entries(LADDERS)) {
    it(`${view}: each committable rung maps to a hinted card slot`, () => {
      const cards = detailsCards(stateFor(view as RailManifestState["mode"]));
      for (const rung of rungs) {
        if (rung.level === "all" || EXEMPT[rung.level]) continue;
        const id = LEVEL_CARD[rung.level];
        expect(id, `rung "${rung.level}" has no card mapping`).toBeTruthy();
        const card = cards.find((c) => c.id === id);
        expect(card, `view ${view}: no "${id}" slot for rung "${rung.level}"`).toBeTruthy();
        expect(card!.hint, `view ${view}: slot "${id}" renders no ghost — the rung is invisible when unselected`).not.toBeNull();
      }
    });
  }
});
```

- [ ] **Step 2: Prove it toothy** — temporarily null `cohortHint`'s geo return → run → FAIL
with the "renders no ghost" message → revert → PASS. Note the check in the task report.

- [ ] **Step 3: Run full suite + commit** — `test(rail): ladder↔manifest boundary — every rung has a facts slot`

---

### Task 10: docs — CLAUDE.md + README

**Files:**
- Modify: `CLAUDE.md`, `README.md` (only if it names the focus behaviour), `.superpowers/sdd/progress.md` (ledger entry — coordinator)

- [ ] **Step 1: CLAUDE.md updates** (surgical, matching existing prose style):
- Domain module list: add a `focusLadder.ts` bullet — the rung tables, `finerLevels`,
  `LEVEL_CARRY`, the resolver-keys-implemented-in-Engine split, and that `pickActions`
  derives deselect stepping from it.
- The rules → standing conventions: extend rule 8 ("one home per concern") or the
  `pickActions` bullet with the ladder (click semantics + level order in one place);
  note the new ladder↔rail test beside the other boundary tests.
- `Engine.ts` bullet: `_resolveFocus` replaces the per-view focus walks; resolvers are the
  camera entry points.
- "Nodes, layers & the filter": geo gains the cohort level (three→four zoom levels:
  network → country → cohort → node), the full-ancestry click rule, the provider/cohort
  naming split; ledger's explorer now discloses node rows (`nodeList: true`).
- The four-zone HUD → right rail: the two new fixed slots (country, provider) + the
  ladder-derived manifest test; left rail: LedgerPanel's disclosure structure.
- Carry policy: view-scoped rungs (country/cohort/layer) clear on leaving their view —
  replaces the "layer persists" behaviour; snapshot pinning unchanged.
- Sweep stale claims: `grep -n "cleared on view switch\|ledger-only\|nodeList" CLAUDE.md`
  and reconcile each hit.

- [ ] **Step 2: Verify** — `npm test` + `npx tsc --noEmit` (docs-only, but run anyway); grep sweeps clean.

- [ ] **Step 3: Commit** — `docs: focus ladder — rung tables, carry policy, cohort level, ledger browser, rail slots`

---

## Final verification (after Task 10, before merge)

- Full whole-branch review (the house flow: `superpowers:requesting-code-review`).
- `next build` clean; `/api/metagraphs` stays `○` (Static) `10m`.
- Visual pass (chrome-devtools MCP, desktop + tablet + phone + reduced-motion):
  1. All six 3D↔3D transitions settle clean with selections committed.
  2. Geo ladder walk down + stepwise deselect back up (node → cohort → country → network → all).
  3. Ledger browser: group hover glow, node select (filter + layer + zoom), deselect step-up.
  4. Layer card no longer lingers outside ledger; pinned snapshot still carries (unchanged).
  5. Reversal-gap repro at `?slowmo=4` settles on the committed framing.
  6. Rail ghosts: geo shows 4, order stable; cards populate/clear with edge pulses.
  7. Hover-preview channels unchanged (hoverFilter/hoverNodeId/hoverCountry/hoverCohort/hoverSnapOrd).
