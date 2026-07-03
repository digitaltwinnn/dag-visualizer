# HUD Refresh — Phase 4: Node Status System + Dossier & Node Cards

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the two identity/node Detail cards to their spec content — a shared green/amber/red **node status-bucket** system (replacing the old 6-colour scheme), the shared **composition vocabulary** (`Hybrid L0·dL1` / `Data dL1` / `Consensus L0`), the **geo node card** body (id · status · IP · composition · location), and the **dossier**'s logo-avatar header + renamed **Node composition** block (headline total · role+code rows · chip stacks · status breakdown).

**Architecture:** Two pure, TDD'd helpers (`src/data/nodeStatus.ts`, `src/data/composition.ts`) become the single source of truth for status buckets + the role-label vocabulary, consumed by both cards. Then the `geoLive` card and `MetaCard` bodies in `components/inspector/cards.tsx` are restructured to the specs, reusing the Phase-2 shadcn `Avatar` (logo + monogram) and the Phase-1 tokens. Card *chrome/thread* (Phase 3) is untouched.

**Tech Stack:** Next 15 · React 19 · TypeScript · Tailwind v4 + Phase-1 tokens · shadcn `Avatar` (Phase 2) · vitest.

## Global Constraints

- **Node ≥ 18.18.** Branch **`dev`**. Commit as author `digitaltwinnn` (`git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" commit …`), short messages ending with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Node status = colour is the BUCKET, text is the exact state.** Three semantic buckets (+ unknown): **in consensus → green** (`Ready`); **in progress → amber** (Observing / WaitingForObserving / WaitingForReady / ReadyToDownload / WaitingForDownload / DownloadInProgress / StartingSession / SessionStarted); **down → red** (`Leaving` / `Offline`); **unknown → muted** (anything unrecognised). Single status (node card / GeoExplore row): `Ready` = plain green text; any non-ready = a **pill** in its bucket colour, labelled with the exact state. Breakdown (dossier): bucket counts + colour dots — `28 ready · 3 in progress · 2 down`, all-ready collapses to a single green `all ready`. This **replaces** the old 6-colour `nodeStateColor` (which collided with the accent/core/identity lanes).
- **Two colour lanes:** **identity hue** (from `config.METAGRAPHS` via `hex(cfg.color)` / `hex(meta.color)` — NOT the generator) only on the dossier **avatar ring / ticker / site link** and the node card's leading dot; **status uses the structural semantic** green/amber/red; **composition data + chips are neutral chrome**. A metagraph hue never colours a status or a data number. Amber is a reserved structural band (the generator already avoids it).
- **Error never breaks the identity frame:** an offline/down node keeps its metagraph-hue card border + thread (Phase 3). The error is signalled by the **status pill only** — no red card border.
- **Composition vocabulary (plain role bright + layer codes muted, inline):** `Hybrid  L0·dL1` (a hybrid runs several layers — the codes show which; two distinct hybrid make-ups = two Hybrid rows), `Data  dL1`, `Currency  cL1`, `Consensus  L0`. Layer glossary: `L0`=Consensus, `cL1`=Currency, `dL1`=Data. Rows sum to the total; show only groups that exist.
- **Chips** = a stack of uniform neutral node-dots per composition row, **visual scale only**, capped at ~10, **no `+N`** — the right-aligned **count is authoritative**. No hybrid/dedicated styling on the chips (the 3D view doesn't distinguish node types visually).
- **Number-colour rule:** the composition **total** is the neutral headline (bright white/bold/sized-up); per-type counts are smaller + muted. No identity hue on any number.
- **Factual, only real data:** node cards show only `id / ip / state / roles / geo` — no fabricated uptime/version. The token row shows the ticker if the metagraph runs a currency-L1, else **"data metagraph · no token"**.
- **Path alias** `@/*` → repo root.
- **Dev server (shared) + verification:** ONE `next dev` runs at `http://localhost:3000` — do NOT start/kill/restart it and do NOT `rm -rf .next`; HMR recompiles. **Do NOT run `npm run build`** (shared-`.next` corruption); use `npx tsc --noEmit` + `npm test -- <name>`. Verify visuals with the **chrome-devtools MCP** (`mcp__plugin_chrome-devtools-mcp__*`; `ToolSearch` "chrome-devtools navigate screenshot click snapshot evaluate" if not loaded): `navigate_page` to `:3000`, reload after edits, `take_snapshot` + `click` to reach states (filter a metagraph; select a node in geo; open the dossier), `take_screenshot` + Read, and `evaluate_script` + `getComputedStyle` for exact colour/lane checks. Ignore benign console noise (`mojo … rejected`, `PHONE_REGISTRATION_ERROR`, `BackForwardCache`).

**Source specs:** `docs/superpowers/specs/2026-07-01-context-dossier-design.md`, `…-geo-node-card-design.md` (the shared status system). Current code: `components/inspector/cards.tsx` (`MetaCard`, `GeoLiveCard`/`GeoLiveNode`), `components/inspector/parts.tsx` (`nodeStateColor`, `nodeComposition`, `RoleTags`, `Row`, `metaToken`), `app/styles/05-inspector-metagraph-context-pane.css`.

**Out of scope (Phase 4b / later):** the **snapshot card** + `AnchoredTags` ranked breakdown/focus row + the `rewardsDag` API addition (`snapshot-card` spec) — its own plan. Also: the scene tie-in synced-glow (its own spec), the ease-card-height animation on metagraph switch (a polish follow-up), and the right-rail chrome/thread (done in Phase 3). Don't flag their absence.

---

## File Structure

- `src/data/nodeStatus.ts` — **create** — the pure status-bucket helper: `nodeStatus(state)` → `{ bucket, color, label }` + `statusBreakdown(nodes)` → per-bucket counts. Replaces `parts.tsx`'s `nodeStateColor`.
- `src/data/nodeStatus.test.ts` — **create** — its unit test.
- `src/data/composition.ts` — **create** — the pure composition-label helper: `compositionRows(nodes)` → the role+code group rows (`{ label, codes, count }[]`) summing to the total.
- `src/data/composition.test.ts` — **create** — its unit test.
- `components/inspector/parts.tsx` — **modify** — remove `nodeStateColor`; add a shared `StatusMark` (single text/pill) + `CompositionRows` (rows + chips) presentational components on the new helpers; keep `Row`/`Desc`/`RoleTags`/`nodeComposition`/`metaToken`.
- `components/inspector/cards.tsx` — **modify** — `GeoLiveNode` (id · status · IP · composition · location) and `MetaCard` (logo-avatar header · description · Node composition · token · site).
- `app/styles/05-inspector-metagraph-context-pane.css` — **modify** — the status pill/dots, the composition rows + chip stacks, the logo-avatar header, the token/site rows.

---

## Task 1: Node status-bucket helper (TDD)

**Files:**
- Create: `src/data/nodeStatus.ts`, `src/data/nodeStatus.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type StatusBucket = "ready" | "progress" | "down" | "unknown";
  export interface NodeStatus { bucket: StatusBucket; color: string; label: string; }
  export function nodeStatus(state?: string | null): NodeStatus;
  // per-bucket counts over a node list, for the dossier breakdown
  export function statusBreakdown(states: (string | null | undefined)[]): Record<StatusBucket, number>;
  export const BUCKET_COLOR: Record<StatusBucket, string>;
  ```
  `color` values (structural semantic, matching the Phase-1 tokens' green/amber/red/muted): ready `#36e29a`, progress `#ffd166`, down `#ff6b6b`, unknown `#9aa6c2`. `label` = the exact state lower-cased to a short word (`Ready`→`ready`, `Observing`→`observing`, `WaitingForObserving`→`waiting`, `DownloadInProgress`→`syncing`, `StartingSession`/`SessionStarted`→`joining`, `Leaving`→`leaving`, `Offline`→`offline`, unknown → the raw state or `unknown`).

- [ ] **Step 1: Write the failing test**

Create `src/data/nodeStatus.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { nodeStatus, statusBreakdown, BUCKET_COLOR } from "./nodeStatus";

describe("nodeStatus", () => {
  it("buckets Ready as green consensus", () => {
    const s = nodeStatus("Ready");
    expect(s.bucket).toBe("ready");
    expect(s.color).toBe(BUCKET_COLOR.ready);
    expect(s.label).toBe("ready");
  });
  it("buckets the in-progress lifecycle states as amber with a short label", () => {
    expect(nodeStatus("Observing")).toMatchObject({ bucket: "progress", label: "observing" });
    expect(nodeStatus("WaitingForReady")).toMatchObject({ bucket: "progress", label: "waiting" });
    expect(nodeStatus("DownloadInProgress")).toMatchObject({ bucket: "progress", label: "syncing" });
    expect(nodeStatus("SessionStarted")).toMatchObject({ bucket: "progress", label: "joining" });
    expect(nodeStatus("Observing").color).toBe(BUCKET_COLOR.progress);
  });
  it("buckets Offline/Leaving as red down", () => {
    expect(nodeStatus("Offline")).toMatchObject({ bucket: "down", label: "offline" });
    expect(nodeStatus("Leaving")).toMatchObject({ bucket: "down", label: "leaving" });
  });
  it("buckets unknown/absent as muted", () => {
    expect(nodeStatus("SomethingNew").bucket).toBe("unknown");
    expect(nodeStatus(null).bucket).toBe("unknown");
    expect(nodeStatus(undefined).color).toBe(BUCKET_COLOR.unknown);
  });
});

describe("statusBreakdown", () => {
  it("counts per bucket", () => {
    const b = statusBreakdown(["Ready", "Ready", "Observing", "Offline", "Ready", null]);
    expect(b).toEqual({ ready: 3, progress: 1, down: 1, unknown: 1 });
  });
});
```

- [ ] **Step 2: Run it RED** — `npm test -- nodeStatus` → FAIL (`Cannot find module './nodeStatus'`).

- [ ] **Step 3: Implement `src/data/nodeStatus.ts`**

```ts
// The shared node status system: colour = the semantic BUCKET (lane-clean green/amber/red/
// muted), text = the exact lifecycle stage. Replaces the old 6-colour nodeStateColor.
// See docs/superpowers/specs/2026-07-01-geo-node-card-design.md.

export type StatusBucket = "ready" | "progress" | "down" | "unknown";
export interface NodeStatus { bucket: StatusBucket; color: string; label: string; }

export const BUCKET_COLOR: Record<StatusBucket, string> = {
  ready: "#36e29a",
  progress: "#ffd166",
  down: "#ff6b6b",
  unknown: "#9aa6c2",
};

// Map each raw lifecycle state to its bucket + a short label. In-progress states collapse to
// a plain-language stage word (observing / waiting / syncing / joining).
const PROGRESS: Record<string, string> = {
  Observing: "observing",
  WaitingForObserving: "observing",
  WaitingForReady: "waiting",
  ReadyToDownload: "syncing",
  WaitingForDownload: "syncing",
  DownloadInProgress: "syncing",
  StartingSession: "joining",
  SessionStarted: "joining",
};

export function nodeStatus(state?: string | null): NodeStatus {
  if (state === "Ready") return { bucket: "ready", color: BUCKET_COLOR.ready, label: "ready" };
  if (state && state in PROGRESS)
    return { bucket: "progress", color: BUCKET_COLOR.progress, label: PROGRESS[state] };
  if (state === "Offline" || state === "Leaving")
    return { bucket: "down", color: BUCKET_COLOR.down, label: state.toLowerCase() };
  return { bucket: "unknown", color: BUCKET_COLOR.unknown, label: "unknown" };
}

export function statusBreakdown(
  states: (string | null | undefined)[],
): Record<StatusBucket, number> {
  const b: Record<StatusBucket, number> = { ready: 0, progress: 0, down: 0, unknown: 0 };
  for (const s of states) b[nodeStatus(s).bucket]++;
  return b;
}
```

- [ ] **Step 4: Run it GREEN** — `npm test -- nodeStatus` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/nodeStatus.ts src/data/nodeStatus.test.ts && \
git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" \
  commit -m "feat(status): shared node status-bucket helper (green/amber/red/muted) + tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Composition-label helper (TDD)

**Files:**
- Create: `src/data/composition.ts`, `src/data/composition.test.ts`

**Interfaces:**
- Consumes: `NodeInfo` (`@/src/data/types`), `rolesOf` (`@/components/inspector/parts`).
- Produces:
  ```ts
  export interface CompRow { label: string; codes: string[]; count: number; }
  // Group a metagraph's nodes into the composition rows (summing to the total), in the shared
  // vocabulary: Hybrid (with its exact layer codes) then dedicated Data/Currency/Consensus.
  export function compositionRows(nodes: NodeInfo[]): CompRow[];
  ```
  Row `label` ∈ `Hybrid` / `Data` / `Currency` / `Consensus`; `codes` = the layer codes in `L0·cL1·dL1` order using `L0`/`cL1`/`dL1` (e.g. a hybrid running L0+dL1 → `["L0","dL1"]`; a dedicated data node → `["dL1"]`). **Two distinct hybrid make-ups → two `Hybrid` rows** (grouped by their exact code set). Dedicated single-layer nodes → one row per role present (`Data dL1` / `Currency cL1` / `Consensus L0`). Rows sum to `nodes.length`.

- [ ] **Step 1: Write the failing test**

Create `src/data/composition.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { compositionRows } from "./composition";
import type { NodeInfo } from "@/src/data/types";

const n = (roles: string[]): NodeInfo => ({ ip: "x", state: "Ready", layer: roles[0], roles }) as NodeInfo;

describe("compositionRows", () => {
  it("splits hybrid (by exact code set) from dedicated rows, summing to the total", () => {
    const nodes = [
      n(["l0", "dl1"]), n(["l0", "dl1"]), n(["l0", "dl1"]), // 3 hybrid L0·dL1
      n(["dl1"]), n(["dl1"]),                                // 2 dedicated data
      n(["l0"]),                                             // 1 dedicated consensus
    ];
    const rows = compositionRows(nodes);
    expect(rows).toContainEqual({ label: "Hybrid", codes: ["L0", "dL1"], count: 3 });
    expect(rows).toContainEqual({ label: "Data", codes: ["dL1"], count: 2 });
    expect(rows).toContainEqual({ label: "Consensus", codes: ["L0"], count: 1 });
    expect(rows.reduce((s, r) => s + r.count, 0)).toBe(6);
  });
  it("emits two Hybrid rows for two distinct make-ups", () => {
    const rows = compositionRows([n(["l0", "dl1"]), n(["l0", "cl1", "dl1"])]);
    const hybrids = rows.filter((r) => r.label === "Hybrid");
    expect(hybrids).toHaveLength(2);
    expect(hybrids.map((h) => h.codes.join("·")).sort()).toEqual(["L0·cL1·dL1", "L0·dL1"]);
  });
  it("names dedicated currency as Currency cL1", () => {
    expect(compositionRows([n(["cl1"])])).toContainEqual({ label: "Currency", codes: ["cL1"], count: 1 });
  });
});
```

- [ ] **Step 2: Run it RED** — `npm test -- composition` → FAIL.

- [ ] **Step 3: Implement `src/data/composition.ts`**

```ts
import type { NodeInfo } from "@/src/data/types";

// The shared composition vocabulary: group a metagraph's nodes into rows that sum to the total.
// Hybrids (nodes running >1 layer) group by their EXACT code set, so two make-ups render as two
// rows; dedicated single-layer nodes group by role. See the context-dossier spec.
//
// SELF-CONTAINED (no import from components/inspector/parts, which is a "use client" React module)
// so this stays a pure, Node-test-safe helper — same lesson as the Phase-3 breadcrumb helper.
export interface CompRow { label: string; codes: string[]; count: number; }

const ROLE_ORDER = ["l0", "cl1", "dl1"];
const ROLE_SHORT: Record<string, string> = { l0: "L0", cl1: "cL1", dl1: "dL1" };
// A node's roles, falling back to its single primary layer when the role list is absent.
const rolesOf = (n: NodeInfo): string[] => (n.roles && n.roles.length ? n.roles : [n.layer!]);
const DEDICATED_LABEL: Record<string, string> = { l0: "Consensus", cl1: "Currency", dl1: "Data" };
const codesFor = (roles: string[]) =>
  ROLE_ORDER.filter((r) => roles.includes(r)).map((r) => ROLE_SHORT[r]);

export function compositionRows(nodes: NodeInfo[]): CompRow[] {
  const hybridByKey = new Map<string, CompRow>();
  const dedByRole: Record<string, number> = {};
  for (const node of nodes) {
    const roles = rolesOf(node);
    if (roles.length > 1) {
      const codes = codesFor(roles);
      const key = codes.join("·");
      const row = hybridByKey.get(key) ?? { label: "Hybrid", codes, count: 0 };
      row.count++;
      hybridByKey.set(key, row);
    } else {
      dedByRole[roles[0]!] = (dedByRole[roles[0]!] || 0) + 1;
    }
  }
  const hybridRows = [...hybridByKey.values()].sort((a, b) => a.codes.length - b.codes.length);
  const dedRows: CompRow[] = ROLE_ORDER.filter((r) => dedByRole[r]).map((r) => ({
    label: DEDICATED_LABEL[r],
    codes: [ROLE_SHORT[r]],
    count: dedByRole[r],
  }));
  return [...hybridRows, ...dedRows];
}
```

- [ ] **Step 4: Run it GREEN** — `npm test -- composition` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/composition.ts src/data/composition.test.ts && \
git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" \
  commit -m "feat(composition): shared node-composition row helper (role+codes) + tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Shared status + composition presentational parts

**Files:**
- Modify: `components/inspector/parts.tsx`, `app/styles/05-inspector-metagraph-context-pane.css`

**Interfaces:**
- Consumes: `nodeStatus`/`statusBreakdown` (Task 1), `compositionRows` (Task 2).
- Produces (in `parts.tsx`):
  - `<StatusMark state={string|null|undefined} />` — single status: `Ready` → plain green text; else a bucket-coloured pill labelled with the exact state.
  - `<StatusBreakdown states={(string|null|undefined)[]} />` — `all ready` (green) or the non-zero buckets as `N ready · M in progress · K down` with colour dots.
  - `<CompositionRows nodes={NodeInfo[]} />` — one row per `compositionRows` entry: `label` (bright) + `codes` (muted, `·`-joined) + a **chip stack** (≤10 neutral dots) + the right-aligned **count** (authoritative headline-neutral).
  - `nodeStateColor` is **removed** (all callers move to `nodeStatus`).

- [ ] **Step 1: Add the presentational components to `parts.tsx`**

Add imports at the top:
```tsx
import { nodeStatus, statusBreakdown, BUCKET_COLOR, type StatusBucket } from "@/src/data/nodeStatus";
import { compositionRows } from "@/src/data/composition";
```
Remove the entire `nodeStateColor` function (lines ~16-41). Add:
```tsx
// Single node status — Ready reads as plain green text; any other state is a small pill in its
// bucket colour, labelled with the exact stage. Colour = bucket (lane-clean), text = exact state.
export function StatusMark({ state }: { state?: string | null }) {
  const s = nodeStatus(state);
  if (s.bucket === "ready") return <span className="st-ready">{s.label}</span>;
  return (
    <span
      className="st-pill"
      style={{ color: s.color, borderColor: s.color + "55", background: s.color + "1a" }}
    >
      {s.label}
    </span>
  );
}

// Rolled-up status for a node group (dossier): "all ready" (green) or the non-zero buckets as
// counts + colour dots (`28 ready · 3 in progress · 2 down`).
const BUCKET_WORD: Record<StatusBucket, string> = {
  ready: "ready",
  progress: "in progress",
  down: "down",
  unknown: "unknown",
};
export function StatusBreakdown({ states }: { states: (string | null | undefined)[] }) {
  const b = statusBreakdown(states);
  const total = states.length;
  if (total > 0 && b.ready === total) return <span className="st-ready">all ready</span>;
  const order: StatusBucket[] = ["ready", "progress", "down", "unknown"];
  const parts = order.filter((k) => b[k] > 0);
  return (
    <span className="st-breakdown">
      {parts.map((k, i) => (
        <span className="st-bd" key={k}>
          <span className="st-bd-dot" style={{ background: BUCKET_COLOR[k] }} />
          {b[k]} {BUCKET_WORD[k]}
          {i < parts.length - 1 ? <span className="st-bd-sep"> · </span> : null}
        </span>
      ))}
    </span>
  );
}

// One composition row per make-up: role (bright) + codes (muted) + a capped chip stack
// (visual scale only, ≤10, no +N) + the authoritative count.
export function CompositionRows({ nodes }: { nodes: import("@/src/data/types").NodeInfo[] }) {
  const rows = compositionRows(nodes);
  return (
    <div className="comp-rows">
      {rows.map((r, i) => (
        <div className="comp-row" key={i}>
          <span className="comp-role">{r.label}</span>
          <span className="comp-codes">{r.codes.join("·")}</span>
          <span className="comp-chips" aria-hidden>
            {Array.from({ length: Math.min(r.count, 10) }).map((_, j) => (
              <span className="comp-chip" key={j} />
            ))}
          </span>
          <span className="comp-count">{r.count}</span>
        </div>
      ))}
    </div>
  );
}
```
(Keep `Row`, `Desc`, `RoleTags`, `nodeComposition`, `metaToken`, the `ROLE_*` consts, `rolesOf` — later code + `metaToken` still use them.)

- [ ] **Step 2: Add the styles to `05-inspector-metagraph-context-pane.css`**

```css
/* Status — single (pill / ready text) + breakdown */
.st-ready { color: #36e29a; font-weight: 600; font-size: 12.5px; }
.st-pill {
  font-size: 11px; font-weight: 600; padding: 1px 8px; border-radius: 999px;
  border: 1px solid; white-space: nowrap;
}
.st-breakdown { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--muted); }
.st-bd { display: inline-flex; align-items: center; gap: 5px; }
.st-bd-dot { width: 7px; height: 7px; border-radius: 50%; }
.st-bd-sep { color: var(--muted); opacity: 0.6; }

/* Node composition rows + chip stacks (neutral chrome) */
.comp-rows { display: flex; flex-direction: column; gap: 7px; margin-top: 8px; }
.comp-row { display: grid; grid-template-columns: auto auto 1fr auto; align-items: center; gap: 8px; }
.comp-role { font-size: 12.5px; color: var(--text); }
.comp-codes { font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
.comp-chips { display: inline-flex; gap: 3px; justify-content: flex-end; align-items: center; }
.comp-chip { width: 6px; height: 6px; border-radius: 50%; background: rgba(160, 175, 205, 0.5); }
.comp-count { font-size: 12.5px; color: var(--text); font-variant-numeric: tabular-nums; min-width: 1.5em; text-align: right; }
```

- [ ] **Step 3: Typecheck**

Run `npx tsc --noEmit`. Expected: it FAILS in `cards.tsx` (the `nodeStateColor` import is now gone) — that's fine, Task 4 fixes `cards.tsx`. Confirm the only errors are the `nodeStateColor` references in `cards.tsx` (no errors in `parts.tsx` itself). If `parts.tsx` has its own errors, fix them.

- [ ] **Step 4: Commit**

```bash
git add components/inspector/parts.tsx app/styles/05-inspector-metagraph-context-pane.css && \
git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" \
  commit -m "feat(inspector): StatusMark/StatusBreakdown/CompositionRows parts; drop nodeStateColor

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
(This commit intentionally leaves `cards.tsx` not-yet-updated; Task 4 restores a clean tsc. The two commits land together in review — acceptable since the app is verified at Task 4.)

---

## Task 4: Geo node card body

**Files:**
- Modify: `components/inspector/cards.tsx`, `app/styles/05-inspector-metagraph-context-pane.css`

**Interfaces:**
- Consumes: `StatusMark`, `CompositionRows` (Task 3), `hex`, `shortHash`, `CORE_HEX`, `rolesOf`.
- Produces: the restructured `GeoLiveNode` — id · status inline · IP subtitle · Composition row · Location. (The `Node ‹ <ticker>` breadcrumb eyebrow is already supplied by Phase 3's `Inspector`; this task is the card BODY.)

- [ ] **Step 1: Restructure `GeoLiveNode` in `cards.tsx`**

Replace the `nodeStateColor` import with `StatusMark`/`CompositionRows` and rebuild the body. New imports (edit the existing `./parts` import + add types):
```tsx
// Keep the imports the still-old MetaCard needs (Desc/ROLE_ORDER/RoleTags/nodeComposition/rolesOf);
// add StatusMark + CompositionRows for GeoLiveNode. StatusBreakdown is added in Task 5 (MetaCard).
import { Desc, ROLE_ORDER, RoleTags, Row, StatusMark, CompositionRows, nodeComposition, rolesOf } from "./parts";
import type { GlobalSnapshot, MetaCfg, NodeInfo, PickDescriptor } from "@/src/data/types";
```
Replace the whole `GeoLiveNode` function with:
```tsx
function GeoLiveNode({ p, onClear }: { p: PickOf<"l0" | "l1" | "metanode">; onClear: () => void }) {
  const id = p.node?.id;
  const title = id ? shortHash(id) : p.node?.ip || p.geo?.city || p.geo?.country || "Node";
  const color = p.kind === "metanode" ? (p.meta ? hex(p.meta.color) : undefined) : CORE_HEX;
  // The single node's roles → a one-node composition row (shared vocabulary).
  const oneNode: NodeInfo[] = p.node ? [p.node] : [];
  const g = p.geo;
  const place = g ? `${g.city ? g.city + ", " : ""}${g.country ?? ""}`.trim() : "";
  return (
    <>
      <button className="gel-clear" title="Deselect" onClick={onClear}>×</button>
      {/* Title line: node id + the status inline (right). */}
      <div className="gel-node-head">
        {color && <span className="gel-dot" style={{ background: color }} />}
        <span className="gel-node-title insp-hash">{title}</span>
        <span className="gel-status"><StatusMark state={p.node?.state} /></span>
      </div>
      {/* IP grouped with the identity (muted subtitle under the id), not a labelled row. */}
      {p.node?.ip && <div className="gel-ip">{p.node.ip}</div>}
      <div className="insp-div" />
      {/* Composition as a stacked label + block (NOT inside <Row>, whose value is a <span> —
          CompositionRows renders a <div>, so a Row would nest a block in an inline element). */}
      {oneNode.length > 0 && (
        <div className="gel-comp">
          <span className="gel-comp-label">Composition</span>
          <CompositionRows nodes={oneNode} />
        </div>
      )}
      {place && <Row label="Location">{place}</Row>}
    </>
  );
}
```
(The old `Runs` / `RoleTags` row is replaced by the shared `Composition` row. `StatusBreakdown` is imported for Task 5's dossier — it's fine to import it here too, or leave it for Task 5; if unused here, don't import it here to keep tsc clean.)

- [ ] **Step 2: Add the node-card styles**

```css
.gel-status { margin-left: auto; }
.gel-ip { font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; margin: 2px 0 0 16px; }
.gel-comp { margin: 8px 0; }
.gel-comp-label { font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
```

- [ ] **Step 3: Typecheck + verify via chrome-devtools MCP**

Run `npx tsc --noEmit` — clean (the `nodeStateColor` references are gone; `MetaCard` still compiles since Task 3 kept `nodeComposition`). Then via the MCP: switch to Geography, filter a metagraph with locatable nodes (e.g. via the top-bar Filter), `click` a globe node (or a GeoExplore row) to open the node card. Screenshot + Read: the card shows the node id + **status inline** (a `Ready` node = green text; a non-ready = a bucket-coloured pill), the **IP** as a muted subtitle under the id, a **Composition** row in the shared vocabulary (`Hybrid L0·dL1` etc.), and **Location**. Use `getComputedStyle` to confirm a `Ready` status renders green `#36e29a` and the node's leading dot is the metagraph hue (not a status colour).

- [ ] **Step 4: Commit**

```bash
git add components/inspector/cards.tsx app/styles/05-inspector-metagraph-context-pane.css && \
git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" \
  commit -m "feat(inspector): geo node card body (id · status · IP · composition · location)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Dossier — logo-avatar header + Node composition block

**Files:**
- Modify: `components/inspector/cards.tsx` (`MetaCard`), `app/styles/05-inspector-metagraph-context-pane.css`

**Interfaces:**
- Consumes: shadcn `Avatar`/`AvatarImage`/`AvatarFallback` (`@/components/ui/avatar`), `CompositionRows`/`StatusBreakdown` (Task 3), `metaToken`, `hex`; `store.metaList` (`MetaInfo` with `iconUrl`, `color`, `nodes`).
- Produces: the restructured `MetaCard` — logo-avatar header (identity-hue ring + monogram fallback) · description · **Node composition** (headline total + `CompositionRows` + `StatusBreakdown`) · token · site.

- [ ] **Step 1: Restructure `MetaCard`**

Add imports:
```tsx
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { CompositionRows, StatusBreakdown, Desc, metaToken } from "./parts";
```
Replace the `MetaCard` function body (the `nf`/`nf-grid` block) with the logo-avatar header + the Node composition block:
```tsx
export function MetaCard({ cfg }: { cfg: MetaCfg }) {
  const metaList = useStore((s) => s.metaList);
  const mg = metaList.find((x) => x.id === cfg.id) || null;
  const nodes = mg?.nodes || [];
  const hue = hex(cfg.color);
  const monogram = (cfg.ticker || cfg.name).slice(0, 3).toUpperCase();
  const blurb = mg?.description || cfg.blurb;
  const site = mg?.siteUrl;
  const token = metaToken(cfg, mg); // ticker, or "no token"
  return (
    <>
      {/* Header — logo avatar ringed in the identity hue + name + ticker. */}
      <div className="dossier-head">
        <Avatar className="dossier-logo" style={{ ["--ring" as string]: hue }}>
          {mg?.iconUrl && <AvatarImage src={mg.iconUrl} alt="" />}
          <AvatarFallback style={{ color: hue }}>{monogram}</AvatarFallback>
        </Avatar>
        <span className="dossier-id">
          <span className="dossier-name">{cfg.name}</span>
          {cfg.id !== "dag" && <span className="dossier-ticker" style={{ color: hue }}>{cfg.ticker}</span>}
        </span>
      </div>
      <Desc text={blurb} />
      {nodes.length > 0 && (
        <div className="comp-block">
          <div className="comp-head">
            <span className="comp-title">Node composition</span>
            <span className="comp-total"><b>{nodes.length}</b> node{nodes.length === 1 ? "" : "s"}</span>
          </div>
          <CompositionRows nodes={nodes} />
          <div className="comp-status"><StatusBreakdown states={nodes.map((n) => n.state)} /></div>
        </div>
      )}
      <div className="dossier-foot">
        <span className="dossier-token">{cfg.id !== "dag" && !nodeComposition(nodes).hasCurrency ? "data metagraph · no token" : token}</span>
        {site && (
          <a className="insp-site" href={site} target="_blank" rel="noopener noreferrer" style={{ color: hue }}>
            {site.replace(/^https?:\/\//, "").replace(/\/$/, "")}
          </a>
        )}
      </div>
    </>
  );
}
```
(Keep the existing `nodeComposition` import in `cards.tsx` for the token check. Remove the now-unused `ROLE_ORDER`/`RoleTags`/`rolesOf` imports from `cards.tsx` if `GeoLiveNode` no longer uses them — verify with tsc.)

- [ ] **Step 2: Add the dossier styles**

```css
.dossier-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.dossier-logo { width: 38px; height: 38px; border-radius: 9px; box-shadow: 0 0 0 1.5px var(--ring, var(--panel-border)), 0 0 12px -2px var(--ring, transparent); }
.dossier-id { display: flex; flex-direction: column; gap: 1px; }
.dossier-name { font-size: 15px; font-weight: 600; color: var(--text); line-height: 1.1; }
.dossier-ticker { font-size: 11px; font-weight: 600; letter-spacing: 0.02em; }
.comp-block { margin-top: 12px; }
.comp-head { display: flex; align-items: baseline; justify-content: space-between; }
.comp-title { font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
.comp-total { font-size: 15px; color: var(--text); }
.comp-total b { font-weight: 700; }
.comp-status { margin-top: 8px; }
.dossier-foot { display: flex; flex-direction: column; gap: 4px; margin-top: 12px; }
.dossier-token { font-size: 12px; color: var(--muted); }
```

- [ ] **Step 3: Typecheck + verify via chrome-devtools MCP**

Run `npx tsc --noEmit` — clean. Then via the MCP: filter a metagraph (e.g. one with a logo, and DOR/a data metagraph for the "no token" case), and read the Context dossier at the top of the right rail. Screenshot + Read: the header shows the **logo avatar** ringed in the metagraph hue (monogram fallback when no icon), name + hue ticker; the **Node composition** block shows the neutral **headline total**, the role+code rows with chip stacks, and the **status breakdown** line (`all ready` or `N ready · M in progress · …`); the token row shows the ticker or **"data metagraph · no token"**; the site link is in the identity hue. `getComputedStyle` check: the total + composition numbers are neutral (`--text`), the ring/ticker/site are the metagraph hue, the status dots are the bucket colours. Also check the **DAG core** ($DAG) dossier: core-cyan ring, its own composition.

- [ ] **Step 4: Commit**

```bash
git add components/inspector/cards.tsx app/styles/05-inspector-metagraph-context-pane.css && \
git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" \
  commit -m "feat(dossier): logo-avatar header + Node composition block (total · rows · status)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Cleanup + final verification

**Files:**
- Modify: `app/styles/05-inspector-metagraph-context-pane.css` (prune dead `.nf*`/old status rules), `components/inspector/cards.tsx` (drop unused imports)

- [ ] **Step 1: Confirm no dead references to the old parts**

Run:
```bash
cd /home/alexander/Workspace/dag-visualizer
grep -rnE "nodeStateColor|gel-state\b" app components src | grep -v "app/styles/" || echo "no code refs"
grep -rnE "\.nf-grid|\.nf-col|\.nf-total|\.nf-head|\bnf\b" components src | grep -v "app/styles/" || echo "no nf markup"
```
Expected: `no code refs` and `no nf markup` (the old `nf` node-fabric grid + `gel-state` pill were replaced). If any remain, remove/replace them.

- [ ] **Step 2: Prune the dead CSS**

Remove the now-unused `.nf`, `.nf-total`, `.nf-grid`, `.nf-col`, `.nf-col--empty`, `.nf-head`, `.insp-mini`, and the old `.gel-state` rules from wherever they live (grep both `13-right-column.css` AND `05-inspector-metagraph-context-pane.css` — the `.nf*` grid + `.gel-state` are in `13-right-column.css`) (their markup is gone). Keep everything still referenced (`.gel-node-head`, `.gel-dot`, `.gel-node-title`, `.gel-clear`, `.role-tag*` if `RoleTags` is still used elsewhere — grep to confirm). Drop any now-unused imports in `cards.tsx` (tsc/lint will flag).

- [ ] **Step 3: Full typecheck + tests**

Run `npx tsc --noEmit` (clean) and `npm test` (all green — the new `nodeStatus` + `composition` tests plus the existing suites).

- [ ] **Step 4: Final regression pass via chrome-devtools MCP**

Reload `:3000`. Read each: (a) **dossier** for a metagraph with a logo (header avatar + composition + status), (b) **dossier** for a data metagraph ("no token") and the **DAG core** (cyan ring), (c) a **geo node card** with a `Ready` node (green text) and, if reachable, a non-ready node (bucket pill), (d) confirm the **two lanes** hold (identity hue only on avatar-ring/ticker/site/node-dot; status green/amber/red; numbers + chips neutral) and the **card border/thread stays the metagraph hue** even for a down node (no red border). Read the PNGs.

- [ ] **Step 5: Commit**

```bash
git add -A && git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" \
  commit -m "chore(inspector): prune dead node-fabric + old status CSS

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Done-when (Phase 4 acceptance)

- `npx tsc --noEmit` clean; `npm test` passes (incl. the new `nodeStatus` + `composition` suites).
- **Shared status system:** colour = the bucket (green `Ready` / amber in-progress / red down / muted unknown), text = the exact state; single status = green text (`Ready`) or a bucket pill; the dossier shows the rolled-up breakdown (`all ready` or `N ready · M in progress · K down`). The old 6-colour `nodeStateColor` is gone.
- **Geo node card:** id · status inline · IP subtitle · **Composition** row (shared `Hybrid L0·dL1` vocabulary) · Location; the leading dot is the metagraph hue; a down node keeps the metagraph-hue frame (status pill only).
- **Dossier:** logo-avatar header (identity-hue ring + monogram fallback) · description · **Node composition** (neutral headline total + role+code rows + capped chip stacks + status breakdown) · token ("data metagraph · no token" when no currency-L1) · site (identity hue).
- **Two-lane discipline holds** across both cards: identity hue only on avatar-ring/ticker/site/node-dot; status is structural green/amber/red; composition numbers + chips are neutral. Amber never collides with an identity hue.

## Follow-ups (Phase 4b / later)

- **The snapshot card** (its own plan): `AnchoredTags` ranked share-of-total breakdown + filtered focus row; `SnapshotCard` restructure (◆ marker + odometer ordinal + state line + settlement fees/KB/rewards); the `rewardsDag` API addition. (`snapshot-card` spec.)
- Ease the dossier card height on metagraph switch (a polish animation — the spec notes it; deferred).
- The scene tie-in synced-glow (card ↔ globe node) — its own spec.
- Fold the status/composition/dossier tokens into the shared Instrument-Glass token pass.
