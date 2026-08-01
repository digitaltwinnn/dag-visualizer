# LiveStrip Sections (tasks 9+11) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The LiveStrip becomes a drag-handle divider between the scene shell (section 1) and a new full-viewport per-view data-table section (section 2), and the snapshot card becomes ledger-view-scoped.

**Architecture:** A `position:fixed; inset:0` wrapper WITH a transform becomes the containing block for every `position:fixed` child (canvas, rails, strip) — their boxes equal the viewport at rest, so the existing shell CSS works untouched, and GSAP translating the wrapper carries the whole shell up to reveal section 2 (absolutely positioned below it). The strip is the Draggable trigger; a store field `section` is the source of truth every other writer (chevron button, wheel Observer) goes through. Row clicks in section 2 reuse the existing tested action builders (`nodeSelectActions`, `snapshotSelectActions`) through the one executor `applyClickActions`.

**Tech Stack:** Next.js 16, React, TypeScript, Zustand, GSAP 3.13+ (Draggable + InertiaPlugin + Observer — all free/bundled), shadcn `Table` + `ScrollArea` (new primitives), vitest.

**Spec:** `docs/superpowers/specs/2026-08-01-livestrip-sections-design.md` (approved).

## Global Constraints

- **Selection boundary (CLAUDE.md rule 2):** components NEVER call selection setters (`setInspect`/`setSnap`/`setFilter`/`setCountry`/`setCohort`/`setLayer`/`setFollowing`) — every row click goes through `applyClickActions` + a `pickActions` builder. Hover channels (`setHoverNodeId`, `setHoverSnapOrd`, `setHoverFilter`) are NOT selection writes and are fine.
- **Honesty over decoration:** absent data renders an instrument state (NO SIGNAL / waiting), never a fabricated row or number.
- **Design tokens first:** HUD type scale (`text-micro`/`text-label`/`text-body`/`text-title`), `tracking-caps`, structural tokens; no raw hex/px literals in components.
- **Two colour lanes:** structural cyan for affordances; identity hues only via inline style on subject marks (`hex(m.color)` / `filterAccent(id)`).
- **No `mode === "x"` deny-lists in the engine**; UI components may branch on mode (they already do — LiveStrip, Blueprint).
- **The engine's canvas buffer stays viewport-sized** — no engine resize is triggered by the section transition (transform only).
- **Dev-server discipline:** ONE `next dev` on `http://localhost:3000`, owned by the coordinator; workers reuse it, never start/kill servers. Visual checks via the chrome-devtools MCP (JPEG quality ~50 screenshots; interact via `evaluate_script` clicks).
- **Commit trailer:** every commit message ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Stage files explicitly by name — never `git add -A`.
- Run `npx tsc --noEmit` and `npm test` before every commit.

## File Structure

- `src/store/store.ts` — add `section: "scene" | "data"` + `setSection` (UI state, like `phoneDock`).
- `src/data/anchorLog.ts` (+ `.test.ts`) — pure anchor-log row builder (Task 2).
- `src/data/roster.ts` (+ `.test.ts`) — pure node-roster rows + sort (Task 3).
- `src/data/api.ts` — export the `MetaSnapRecord` interface (one-word change).
- `components/LiveStrip.tsx` — bars ledger-only; readout otherwise; tooltip portal; chevron toggle.
- `components/NodeCountReadout.tsx` — the hyper/geo/flat strip content.
- `components/SectionSlider.tsx` — the GSAP two-section wrapper.
- `components/DataSection.tsx` — section 2 dispatcher (per-view table or honest placeholder).
- `components/datasection/AnchorLogTable.tsx`, `components/datasection/NodeRosterTable.tsx` — the tables.
- `components/ui/table.tsx`, `components/ui/scroll-area.tsx` — new shadcn primitives.
- `app/page.tsx` — restructure around `SectionSlider`.
- `components/RailDock.tsx` — gate sheets/phone-bar off in the data section (they portal to body, so they don't ride the transform).
- `src/engine/Engine.ts` (`setMode`), `components/railCards.ts` (+ test), `components/FollowController.tsx` — task 9.
- `CLAUDE.md` — doc truth updates (Task 7).

---

### Task 1: Snapshot card becomes ledger-scoped (task 9)

**Files:**
- Modify: `components/railCards.test.ts:65-74`
- Modify: `components/railCards.ts:131-138` (`snapHint`)
- Modify: `src/engine/Engine.ts:539` (the `setMode` view-scoped-selection block)
- Modify: `components/FollowController.tsx:8-11,38-41` (comments only — behaviour unchanged)

**Interfaces:**
- Consumes: existing `RailManifestState`, `Engine.setMode`, store `setSnap`.
- Produces: leaving `ledger` clears `store.snap`; `snapHint` returns non-null only in ledger. (Task 4 and Task 6 rely on the snapshot subject being ledger-only.)

- [ ] **Step 1: Update the manifest tests (failing first).** In `components/railCards.test.ts`, change the hyper/geo ghost expectations (the ledger one at line 65-67 stays as-is):

```ts
  it("hyper ghosts: context + node only (the snapshot slot is ledger-scoped, spec 2026-08-01)", () => {
    expect(ghostIds(detailsCards(details({ mode: "hyper" })))).toEqual(["context", "node"]);
  });
  it("geo ghosts cover the whole ladder: context + country + cohort + node invites", () => {
    expect(ghostIds(detailsCards(details({ mode: "geo" })))).toEqual([
      "context", "country", "cohort", "node",
    ]);
  });
```

(Keep the geo test's original `details({ mode: "geo", ... })` argument shape — only remove `"snap"` from the expected array and fix the test name. The "populated slot keeps rendering anywhere (pinned snap in hyper)" test at line 96 stays untouched: the manifest still renders a populated card anywhere; the engine just never lets that state arise.)

- [ ] **Step 2: Run to verify failure.** Run: `npx vitest run components/railCards.test.ts`
Expected: the two edited tests FAIL (snapHint still returns copy in hyper/geo).

- [ ] **Step 3: Implement.** Replace `snapHint` in `components/railCards.ts`:

```ts
function snapHint(s: RailManifestState): string | null {
  // LEDGER-SCOPED (spec 2026-08-01, a deliberate reversal of the old carry-across-views rule):
  // the strip's bars now run only in ledger and leaving the view clears the pin (Engine.setMode),
  // so the slot invites — and exists — only there.
  return s.mode === "ledger" ? "Click a snapshot block (or a bar in the strip below) to inspect it." : null;
}
```

In `src/engine/Engine.ts` `setMode`, directly after `if (mode !== "ledger" && st0.layer != null) st0.setLayer(null);` (line 539), add:

```ts
    // The snapshot card is LEDGER-SCOPED too (spec 2026-08-01): the pin no longer carries out
    // of the view — leaving ledger clears it. `following` stays with the FollowController,
    // whose mode effect already flips it false outside ledger (no fight: with `following`
    // false its tick is a no-op, so the clear sticks).
    if (mode !== "ledger" && st0.snap != null) st0.setSnap(null);
```

In `components/FollowController.tsx`, update the two comment blocks that claim the selected snapshot "carries across views" (lines 8-11 and 38-41) to say the snapshot is ledger-scoped since spec 2026-08-01: entering ledger with nothing selected follows live; leaving ledger clears the pin (Engine.setMode) and stops following (here). No code changes in this file.

- [ ] **Step 4: Verify.** Run: `npx vitest run components/railCards.test.ts && npx tsc --noEmit && npm test`
Expected: all PASS.

- [ ] **Step 5: Visual check.** With the dev server running: in the browser (chrome-devtools MCP), switch to Snapshots (ledger), click an older LiveStrip bar (pins the snapshot card), then switch to Hypergraph. Expected: the snapshot card is GONE in hyper (no ghost either); back in ledger the card follows live again.

- [ ] **Step 6: Commit.**

```bash
git add components/railCards.ts components/railCards.test.ts src/engine/Engine.ts components/FollowController.tsx
git commit -m "feat(rail): snapshot card is ledger-scoped — leaving the view clears the pin

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: The anchor-log model (pure, tested)

**Files:**
- Modify: `src/data/api.ts:16` (export the interface)
- Create: `src/data/anchorLog.ts`
- Test: `src/data/anchorLog.test.ts`

**Interfaces:**
- Consumes: `NetworkData.metaSnaps: Map<string, MetaSnapRecord[]>` (public field), `NetworkData.globalSnapshots`.
- Produces: `buildAnchorLog(metaSnaps, globalSnapshots, filter): AnchorLogRow[]` — Task 6's `AnchorLogTable` renders these rows and passes `row.global` to `snapshotSelectActions`.

- [ ] **Step 1: Export the record type.** In `src/data/api.ts` line 16, change `interface MetaSnapRecord {` to `export interface MetaSnapRecord {`.

- [ ] **Step 2: Write the failing test** at `src/data/anchorLog.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildAnchorLog } from "@/src/data/anchorLog";
import type { MetaSnapRecord } from "@/src/data/api";
import type { GlobalSnapshot } from "@/src/data/types";

const g = (ordinal: number, timestamp: string): GlobalSnapshot => ({ ordinal, timestamp, hash: `h${ordinal}` });
const r = (ordinal: number, ts: string, fee = 100): MetaSnapRecord => ({ ordinal, hash: `m${ordinal}`, parent: "", ts, fee, sizeInKB: 1 });

const globals = [g(1, "2026-08-01T10:00:00Z"), g(2, "2026-08-01T10:00:15Z")];
const snaps = new Map<string, MetaSnapRecord[]>([
  ["dor", [r(10, "2026-08-01T10:00:00Z"), r(11, "2026-08-01T10:00:15Z"), r(12, "2026-08-01T10:00:15Z")]],
  ["ded", [r(90, "2026-08-01T10:00:00Z"), r(91, "2026-08-01T09:00:00Z")]], // 09:00 is outside the window
]);

describe("buildAnchorLog", () => {
  it("one row per metagraph snapshot, joined to its anchoring global by timestamp", () => {
    const rows = buildAnchorLog(snaps, globals, "all");
    expect(rows).toHaveLength(4); // ded@09:00 dropped — no retained global to click through to
    expect(rows.every((x) => x.global.timestamp === x.ts)).toBe(true);
  });
  it("sorts newest tick first, then metagraph-ordinal desc within a tick", () => {
    const rows = buildAnchorLog(snaps, globals, "all");
    // Within the shared 10:00:00 tick, plain ordinal-desc across metagraphs: ded 90 before dor 10.
    expect(rows.map((x) => x.ordinal)).toEqual([12, 11, 90, 10]);
  });
  it("filter scopes to one metagraph; dag/unknown ids yield an empty log", () => {
    expect(buildAnchorLog(snaps, globals, "ded").map((x) => x.metaId)).toEqual(["ded"]);
    expect(buildAnchorLog(snaps, globals, "dag")).toEqual([]);
  });
});
```

- [ ] **Step 3: Run to verify failure.** Run: `npx vitest run src/data/anchorLog.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement** `src/data/anchorLog.ts`:

```ts
import type { MetaSnapRecord } from "@/src/data/api";
import type { GlobalSnapshot } from "@/src/data/types";

// One row of the ledger data table (spec 2026-08-01): a single METAGRAPH snapshot, joined to
// the global tick it anchored into (the record's ts IS the anchoring global timestamp — the
// exact join api.ts's anchorIndex uses). Pure over the NetworkData buffers so it's testable;
// the hook in AnchorLogTable feeds it live. Rows outside the retained global window are
// dropped — a row must always resolve to a clickable GlobalSnapshot.
export interface AnchorLogRow {
  metaId: string;
  ordinal: number; // the METAGRAPH snapshot's own ordinal
  hash: string;
  fee: number; // datum
  sizeInKB: number;
  ts: string;
  global: GlobalSnapshot; // the anchoring global snapshot (the row's click target)
}

export function buildAnchorLog(
  metaSnaps: ReadonlyMap<string, MetaSnapRecord[]>,
  globalSnapshots: readonly GlobalSnapshot[],
  filter: string, // "all" | "dag" | metagraph id — dag has no metagraph snapshots → empty
): AnchorLogRow[] {
  const byTs = new Map(globalSnapshots.map((g) => [g.timestamp, g]));
  const rows: AnchorLogRow[] = [];
  for (const [metaId, recs] of metaSnaps) {
    if (filter !== "all" && filter !== metaId) continue;
    for (const rec of recs) {
      const global = byTs.get(rec.ts);
      if (!global) continue;
      rows.push({ metaId, ordinal: rec.ordinal, hash: rec.hash, fee: rec.fee, sizeInKB: rec.sizeInKB, ts: rec.ts, global });
    }
  }
  // ISO-8601 timestamps sort lexicographically; newest tick first, then ordinal desc within it.
  rows.sort((a, b) => (a.ts === b.ts ? b.ordinal - a.ordinal : a.ts < b.ts ? 1 : -1));
  return rows;
}
```

- [ ] **Step 5: Verify.** Run: `npx vitest run src/data/anchorLog.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add src/data/api.ts src/data/anchorLog.ts src/data/anchorLog.test.ts
git commit -m "feat(data): pure anchor-log builder — one row per anchored metagraph snapshot

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: The node-roster model (pure, tested)

**Files:**
- Create: `src/data/roster.ts`
- Test: `src/data/roster.test.ts`

**Interfaces:**
- Consumes: `NodeRow` (`src/data/types.ts`), `pickNetId` (`src/engine/domain/pickActions.ts` — a domain VALUE import, legal from the data/UI layer like `railCards.ts`'s `LADDERS`).
- Produces: `buildRoster(selNodes): RosterRow[]`, `sortRoster(rows, key, dir): RosterRow[]`, `type RosterSortKey` — Task 6's `NodeRosterTable` consumes all three.

- [ ] **Step 1: Write the failing test** at `src/data/roster.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildRoster, sortRoster } from "@/src/data/roster";
import type { NodeRow } from "@/src/data/types";

const row = (over: Partial<NodeRow> & { pick: NodeRow["pick"] }): NodeRow => ({
  label: "n", id: "id1", cc: "de", country: "Germany", city: "Berlin", layer: "l0", roles: ["l0"], ...over,
});

const validator = row({ pick: { kind: "l0", geo: { cc: "de", city: "Berlin", isp: "Hetzner", asn: "AS24940" } }, id: "v1" });
const metaNode = row({
  pick: { kind: "metanode", meta: { id: "dor" } as never, geo: { cc: "us", city: "Ashburn", isp: "AWS" } },
  id: null, cc: "us", country: "United States", city: "Ashburn", layer: "dl1", roles: ["dl1"],
});

describe("buildRoster", () => {
  it("derives network id + provider from each row's pick", () => {
    const rows = buildRoster([validator, metaNode]);
    expect(rows.map((r) => r.netId)).toEqual(["dag", "dor"]);
    expect(rows.map((r) => r.isp)).toEqual(["Hetzner", "AWS"]);
    expect(rows[0].asn).toBe("AS24940");
  });
  it("keys are unique even when ids are null", () => {
    const rows = buildRoster([metaNode, metaNode]);
    expect(new Set(rows.map((r) => r.key)).size).toBe(2);
  });
});

describe("sortRoster", () => {
  it("sorts by column with nulls last, and flips with dir", () => {
    const rows = buildRoster([metaNode, validator]);
    expect(sortRoster(rows, "city", 1).map((r) => r.node.city)).toEqual(["Ashburn", "Berlin"]);
    expect(sortRoster(rows, "city", -1).map((r) => r.node.city)).toEqual(["Berlin", "Ashburn"]);
    const noCity = buildRoster([row({ pick: { kind: "l1" }, city: null, id: "x" }), validator]);
    expect(sortRoster(noCity, "city", 1).map((r) => r.node.city)).toEqual(["Berlin", null]);
  });
});
```

- [ ] **Step 2: Run to verify failure.** Run: `npx vitest run src/data/roster.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** `src/data/roster.ts`:

```ts
import type { GeoInfo, NodeRow } from "@/src/data/types";
import { pickNetId } from "@/src/engine/domain/pickActions";

// The section-2 node-roster rows (spec 2026-08-01): a flat, sortable projection of
// `store.selNodes` — the same records the explorers browse, denser. Pure so the sorting/
// derivation is unit-tested; NodeRosterTable feeds it live and owns the column order per view.
export interface RosterRow {
  key: string; // stable render key — the node id when present, else label+index
  node: NodeRow;
  netId: string | null; // "dag" | metagraph id (identity-hue + name lookup)
  isp: string | null;
  asn: string | null;
}

export type RosterSortKey = "net" | "id" | "layer" | "country" | "city" | "isp";

export function buildRoster(selNodes: readonly NodeRow[]): RosterRow[] {
  return selNodes.map((node, i) => {
    const geo: GeoInfo | undefined = "geo" in node.pick ? node.pick.geo : undefined;
    return {
      key: node.id ?? `${node.label}#${i}`,
      node,
      netId: pickNetId(node.pick),
      isp: geo?.isp ?? null,
      asn: geo?.asn ?? null,
    };
  });
}

const FIELD: Record<RosterSortKey, (r: RosterRow) => string | null> = {
  net: (r) => r.netId,
  id: (r) => r.node.id ?? r.node.label,
  layer: (r) => r.node.layer,
  country: (r) => r.node.country,
  city: (r) => r.node.city,
  isp: (r) => r.isp,
};

// Stable copy-sort; null/empty values sort LAST regardless of direction (an unknown city is
// not "before A", it's absent).
export function sortRoster(rows: readonly RosterRow[], key: RosterSortKey, dir: 1 | -1): RosterRow[] {
  const get = FIELD[key];
  return [...rows].sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return va.localeCompare(vb) * dir;
  });
}
```

- [ ] **Step 4: Verify.** Run: `npx vitest run src/data/roster.test.ts && npx tsc --noEmit && npm test`
Expected: PASS (the domain-export-coverage test only covers `src/engine/domain/`, not `src/data/` — but the colocated test covers every export anyway).

- [ ] **Step 5: Commit.**

```bash
git add src/data/roster.ts src/data/roster.test.ts
git commit -m "feat(data): pure node-roster rows + column sort for the section-2 table

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Strip content per view — bars ledger-only, node-count readout elsewhere

**Files:**
- Create: `components/NodeCountReadout.tsx`
- Modify: `components/LiveStrip.tsx`

**Interfaces:**
- Consumes: `store.metaList` (`MetaInfo[]` — `located`, `color`, `id`, `name`), `hex` (`src/util/format`), `IdentityDot` (`components/inspector/parts`).
- Produces: `<NodeCountReadout />` (no props); LiveStrip keeps its `#livestrip` id + outer `<section>` geometry IDENTICAL in every view (Task 5's Draggable trigger + openY measurement depend on it), branching only the inner content.

- [ ] **Step 1: Create `components/NodeCountReadout.tsx`:**

```tsx
"use client";

import { useStore } from "@/src/store/store";
import { hex } from "@/src/util/format";
import { IdentityDot } from "@/components/inspector/parts";
import { cn } from "@/lib/utils";

// The strip's content outside ledger (spec 2026-08-01): the tick-bar chart is a time series and
// belongs to Snapshots only — here the same slim footprint carries a quiet node-count readout
// instead: the located total plus one identity-hued mark + count per network (the filter
// picker's numbers, horizontal). Honest: counts are the live `metaList` located tallies; an
// empty list is the boot/no-signal quiet state, not zeros.
export default function NodeCountReadout() {
  const metaList = useStore((s) => s.metaList);
  const live = useStore((s) => s.live);
  const total = metaList.reduce((a, m) => a + m.located, 0);
  if (metaList.length === 0)
    return <span className="text-muted-foreground text-label">{live ? "Acquiring nodes…" : "NO SIGNAL"}</span>;
  return (
    <div className="flex-1 flex items-center gap-4 overflow-hidden">
      <span className="text-body text-foreground tabular-nums flex-none">
        {total} <span className="text-muted-foreground text-label">located nodes</span>
      </span>
      <div className="flex items-center gap-3 overflow-hidden">
        {metaList.map((m) => (
          <span
            key={m.id}
            className={cn("flex items-center gap-1.5 text-label tabular-nums flex-none", m.located === 0 ? "text-muted-foreground opacity-50" : "text-foreground-dim")}
          >
            <IdentityDot hue={hex(m.color)} />
            {m.located}
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Branch LiveStrip.** In `components/LiveStrip.tsx`:
  1. `import NodeCountReadout from "@/components/NodeCountReadout";` and `import { createPortal } from "react-dom";` and read `const mode = useStore((s) => s.mode);`.
  2. Wrap the ENTIRE existing bar-track `<div …>` + the `{tip && …}` tooltip in a `mode === "ledger"` branch; the `else` branch renders `<NodeCountReadout />` inside the same outer `<section id="livestrip" …>` (the section element, its classes and the `--ls-accent` style stay EXACTLY as they are — it is the drag handle in every view).
  3. Portal the tooltip so it stays viewport-anchored when Task 5's wrapper is translated (a `fixed` element inside a transformed ancestor anchors to the ancestor, not the viewport): replace `{tip && ( <div id="ls-tip" …/> )}` with `{tip && createPortal(<div id="ls-tip" …(unchanged)… />, document.body)}`.
  4. Update the stale prose: the head comment ("Clicking a bar opens that snapshot…" block, lines 20-28) and the `pick` comment (lines 69-72) now say: bars render ONLY in Snapshots (spec 2026-08-01 — elsewhere the strip carries the NodeCountReadout), and a bar click selects the snapshot IN ledger (the card is ledger-scoped; no cross-view carry).

- [ ] **Step 3: Verify.** Run: `npx tsc --noEmit && npm test`
Expected: PASS. Then visually (chrome-devtools MCP, `http://localhost:3000`): hyper shows the readout (total + per-network dot-counts, no bars); switch to Snapshots → bars are back, hover shows the tooltip, clicking still pins. Check reduced motion isn't affected (no new animation added).

- [ ] **Step 4: Commit.**

```bash
git add components/NodeCountReadout.tsx components/LiveStrip.tsx
git commit -m "feat(strip): bars are ledger-only — hyper/geo/flat views carry a node-count readout

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: The section slider — GSAP wrapper, store.section, shell restructure

**Files:**
- Modify: `package.json` (via `npm install gsap`)
- Modify: `src/store/store.ts`
- Create: `components/SectionSlider.tsx`
- Create: `components/DataSection.tsx` (STUB in this task — honest placeholder for every view; Task 6 fills it)
- Modify: `app/page.tsx`
- Modify: `components/LiveStrip.tsx` (the chevron toggle button)
- Modify: `components/RailDock.tsx` (sheet/phone-bar gating)

**Interfaces:**
- Consumes: `#livestrip` + `#topbar` DOM ids (measurement + trigger), `store.section`.
- Produces: `store.section: "scene" | "data"` + `setSection` (RailDock and any future reader branch on it); `<SectionSlider dataSection={…}>{shell}</SectionSlider>`; `<DataSection />` (Task 6 replaces its body, keeping the name/default-export).

- [ ] **Step 1: Install GSAP.** Run: `npm install gsap`
Expected: `gsap` ≥3.13 lands in `package.json` dependencies (3.13+ bundles Draggable/InertiaPlugin/Observer free).

- [ ] **Step 2: Store field.** In `src/store/store.ts`, add to `AppState` (next to the `phoneDock` block, same "UI state, not selection" register):

```ts
  // Which of the two shell SECTIONS is presented (spec 2026-08-01): "scene" = the 3D shell,
  // "data" = the per-view raw-data table below it. Written by SectionSlider (drag/wheel snap)
  // and the strip's chevron; SectionSlider owns the tween that realizes it. UI state, not
  // selection (the selection boundary rule doesn't apply); session-only, like phoneDock.
  section: "scene" | "data";
```

and `setSection: (section: "scene" | "data") => void;` to the setters; initialize `section: "scene",` and implement `setSection: (section) => set({ section }),`.

- [ ] **Step 3: Create `components/DataSection.tsx`** (stub — every view honest-empty until Task 6):

```tsx
"use client";

// Section 2 (spec 2026-08-01): the per-view raw-data table. Task 6 lands the real tables;
// until then every view shows the honest not-built state (no fabricated rows).
export default function DataSection() {
  return (
    <div className="h-full flex">
      <p className="m-auto text-label text-muted-foreground uppercase tracking-caps">
        data table · in development
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Create `components/SectionSlider.tsx`:**

```tsx
"use client";

import { useEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";
import { Draggable } from "gsap/Draggable";
import { InertiaPlugin } from "gsap/InertiaPlugin";
import { Observer } from "gsap/Observer";
import { useStore } from "@/src/store/store";

gsap.registerPlugin(Draggable, InertiaPlugin, Observer);

// The two-section shell (spec 2026-08-01). The wrapper is `position:fixed; inset:0` WITH a
// transform — a transformed box is the containing block for every `position:fixed` descendant
// (canvas, rails, LiveStrip), and since its box equals the viewport, the existing shell CSS
// works untouched while translating the wrapper carries the whole shell as one unit. The
// LiveStrip is the drag handle (Draggable trigger) + wheel surface (Observer); `store.section`
// is the one source of truth — the strip's chevron and the snap-commit both write it, and this
// component owns the tween that realizes it. TopBar stays OUTSIDE (fixed to the real viewport,
// shared by both sections); portalled UI (sheets, tooltips) doesn't ride the transform — RailDock
// gates its sheets on `section`, LiveStrip portals its tip.
export default function SectionSlider({ children, dataSection }: { children: ReactNode; dataSection: ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const sec2Ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const sec2 = sec2Ref.current;
    const strip = document.getElementById("livestrip");
    if (!wrap || !sec2 || !strip) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // The open offset: translate until the strip's top edge lands under the command bar
    // (the strip is section 2's header/way back). Rects are corrected by the live translate
    // so the measure is pose-independent; re-run on resize (event-time work, not per-frame).
    const openY = () => {
      const y = Number(gsap.getProperty(wrap, "y")) || 0;
      const topBottom = document.getElementById("topbar")?.getBoundingClientRect().bottom ?? 0;
      return -Math.max(0, strip.getBoundingClientRect().top - y - topBottom);
    };
    // Section 2 fills exactly the viewport remainder below the docked strip.
    const size = () => { sec2.style.height = `${-openY()}px`; };
    size();
    window.addEventListener("resize", size);

    const goTo = (section: "scene" | "data") =>
      gsap.to(wrap, { y: section === "data" ? openY() : 0, duration: reduced ? 0 : 0.55, ease: "power3.out", overwrite: "auto" });

    // External writers (the strip chevron, wheel below) drive the tween through the store.
    const unsub = useStore.subscribe((s, prev) => {
      if (s.section !== prev.section) goTo(s.section);
    });

    // Commit the section the drag/throw landed nearer to; if it's unchanged, still snap home.
    const commit = (y: number) => {
      const target: "scene" | "data" = Math.abs(y - openY()) < Math.abs(y) ? "data" : "scene";
      const st = useStore.getState();
      if (st.section !== target) st.setSection(target);
      else goTo(target);
    };

    const [drag] = Draggable.create(wrap, {
      type: "y",
      trigger: strip,
      // The WHOLE strip is the handle — bars/buttons inside still click on a sub-threshold press.
      dragClickables: true,
      inertia: !reduced,
      onPress(this: Draggable) { this.applyBounds({ minY: openY(), maxY: 0 }); },
      snap: (v: number) => (Math.abs(v - openY()) < Math.abs(v) ? openY() : 0),
      onDragEnd(this: Draggable) { if (!this.isThrowing()) commit(this.y); }, // no inertia throw → settle now
      onThrowComplete(this: Draggable) { commit(this.y); },
    });

    // Wheel on the strip = the fallback gesture (down descends to the table, up returns).
    const obs = Observer.create({
      target: strip,
      type: "wheel",
      preventDefault: true,
      tolerance: 10,
      onDown: () => useStore.getState().setSection("data"),
      onUp: () => useStore.getState().setSection("scene"),
    });

    return () => {
      window.removeEventListener("resize", size);
      unsub();
      drag.kill();
      obs.kill();
    };
  }, []);

  return (
    // The inline identity transform is REQUIRED from first paint: it flips the fixed children's
    // containing block to this wrapper before anything renders, so geometry never jumps when
    // GSAP later writes the same property.
    <div ref={wrapRef} className="fixed inset-0 will-change-transform" style={{ transform: "translateY(0px)" }}>
      {children}
      <section ref={sec2Ref} id="datasection" aria-label="Raw data" className="absolute top-full inset-x-0 overflow-hidden bg-background">
        {dataSection}
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Restructure `app/page.tsx`:**

```tsx
import SceneCanvas from "@/components/SceneCanvas";
import Blueprint from "@/components/Blueprint";
import BootOverlay from "@/components/BootOverlay";
import DataBridge from "@/components/DataBridge";
import ExperimentalBanner from "@/components/ExperimentalBanner";
import TopBar from "@/components/TopBar";
import BottomStream from "@/components/BottomStream";
import ExploreRail from "@/components/ExploreRail";
import Inspector from "@/components/Inspector";
import PhoneDockSweep from "@/components/PhoneDockSweep";
import RailScroll from "@/components/RailScroll";
import FollowController from "@/components/FollowController";
import RawSnapshotBridge from "@/components/RawSnapshotBridge";
import Tooltip from "@/components/Tooltip";
import SectionSlider from "@/components/SectionSlider";
import DataSection from "@/components/DataSection";

// Single-page shell in TWO sections (spec 2026-08-01): SectionSlider carries the whole fixed
// scene shell (canvas + rails + strip — section 1) and the per-view data table (section 2);
// the LiveStrip at section 1's bottom edge is the divider/drag-handle between them. TopBar +
// the banner stay OUTSIDE the slider (fixed to the real viewport, visible in both sections),
// as do the non-visual bridges and the pointer-anchored Tooltip (a transformed ancestor would
// re-anchor its fixed positioning).
export default function Home() {
  return (
    <main>
      <ExperimentalBanner />
      <TopBar />
      <SectionSlider dataSection={<DataSection />}>
        <SceneCanvas />
        <Blueprint />
        <BootOverlay />
        <ExploreRail />
        <Inspector />
        <PhoneDockSweep />
        <RailScroll />
        <BottomStream />
      </SectionSlider>
      <DataBridge />
      <FollowController />
      <RawSnapshotBridge />
      <Tooltip />
    </main>
  );
}
```

Then check stacking: run `grep -n 'z-' components/TopBar.tsx` — the `#topbar` element must carry a z-index above the wrapper's contents (rails are `z-10`, banner `z-[13]`). If it has none, add `z-[12]` to the `#topbar` element's className (one utility; the wrapper itself gets NO z-index so the later-DOM TopBar/Tooltip paint above it).

- [ ] **Step 6: The chevron toggle on the strip.** In `components/LiveStrip.tsx`, add after the branch content (still inside the `<section>`), a flex-none trailing control — the a11y/discoverability fallback for the drag gesture, and the handle scripts can click:

```tsx
      <SectionToggle />
```

with, in the same file:

```tsx
function SectionToggle() {
  const section = useStore((s) => s.section);
  const setSection = useStore((s) => s.setSection);
  const open = section === "data";
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className="flex-none ml-2 text-muted-foreground"
      aria-label={open ? "Back to the scene" : "Open the data table"}
      onClick={() => setSection(open ? "scene" : "data")}
    >
      {open ? <ChevronsDown /> : <ChevronsUp />}
    </Button>
  );
}
```

(imports: `Button` from `@/components/ui/button`, `ChevronsDown, ChevronsUp` from `lucide-react`; `setSection` is UI state, not a selection setter — the boundary test doesn't flag it. Match the exact `size` variant name the card-close Buttons use — check `components/ui/button.tsx` for `icon-xs` vs `iconXs` and use that.)

- [ ] **Step 7: Gate RailDock.** In `components/RailDock.tsx`: after `const open = openProp ?? openState;` (~line 143), add:

```ts
  // Sheets portal to document.body, so they DON'T ride the SectionSlider transform — in the
  // data section they'd float over the table. Gate them (and the phone bar, which lands in the
  // sliver between strip and table when translated) off while section 2 is presented; the
  // internal open state is kept, so returning to the scene restores what was open.
  const section = useStore((s) => s.section);
  const shellVisible = section === "scene";
```

Then: pass `open={open && shellVisible}` to the `<Sheet>` (find the single `<Sheet` usage in the file), and on the PHONE bottom-bar root element (the phone-breakpoint branch's outermost rendered element) add `!shellVisible && "hidden"` into its `cn(...)`. Add `import { useStore } from "@/src/store/store";` if not present.

- [ ] **Step 8: Verify types + tests.** Run: `npx tsc --noEmit && npm test`
Expected: PASS (`selectionBoundary.test.ts` stays green — no selection setters were added to components).

- [ ] **Step 9: Visual verification** (chrome-devtools MCP against the shared dev server):
  1. Load `http://localhost:3000` — the shell must look EXACTLY as before (wrapper at rest is invisible; rails, strip, canvas all in place).
  2. Click the strip chevron (via `evaluate_script`: `document.querySelector('#livestrip button[aria-label="Open the data table"]').click()`). Expected: the whole shell glides up; the strip docks directly under the top bar; the stub "data table · in development" fills the rest; TopBar still visible and functional.
  3. Click the chevron again (`aria-label="Back to the scene"`) — shell returns, no layout drift (screenshot-compare against step 1).
  4. In section 2, switch views via the TopBar — allowed and stays in section 2.
  5. Resize the window while open — the strip re-docks under the bar (openY re-measured).

- [ ] **Step 10: Commit.**

```bash
git add package.json package-lock.json src/store/store.ts components/SectionSlider.tsx components/DataSection.tsx app/page.tsx components/LiveStrip.tsx components/RailDock.tsx components/TopBar.tsx
git commit -m "feat(shell): GSAP two-section slider — the LiveStrip is the drag-handle divider to a data section

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

(Drop `components/TopBar.tsx` from the add list if step 5 needed no z-index change.)

---

### Task 6: The section-2 tables (shadcn Table + ScrollArea)

**Files:**
- Modify: `package.json` (via `npm install @radix-ui/react-scroll-area`)
- Create: `components/ui/table.tsx`, `components/ui/scroll-area.tsx`
- Create: `components/datasection/AnchorLogTable.tsx`, `components/datasection/NodeRosterTable.tsx`
- Modify: `components/DataSection.tsx` (replace the stub body)

**Interfaces:**
- Consumes: `buildAnchorLog`/`AnchorLogRow` (Task 2), `buildRoster`/`sortRoster`/`RosterSortKey` (Task 3), `snapshotSelectActions`/`nodeSelectActions` + `applyClickActions`, `useSnapshotFeed`, `getNetwork`, `metagraphById`, `filterAccent`, `hex`/`fmtDag`/`fmtKB`/`ccToFlag`, `relativeAge`, `hoverKeyOf`, `IdentityDot`, `latestRelevant` (`src/data/follow`).
- Produces: the final `DataSection` render tree (nothing else consumes these components).

- [ ] **Step 1: Install the ScrollArea dep.** Run: `npm install @radix-ui/react-scroll-area`

- [ ] **Step 2: Add the primitives.** Create `components/ui/table.tsx` (stock shadcn minus its scroll-container div — our ScrollArea owns scrolling; call sites restyle via `cn`):

```tsx
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return <table data-slot="table" className={cn("w-full caption-bottom text-sm", className)} {...props} />;
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn("[&_tr]:border-b", className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn("hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors", className)}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn("text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap", className)}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return <td data-slot="table-cell" className={cn("p-2 align-middle whitespace-nowrap", className)} {...props} />;
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return <caption data-slot="table-caption" className={cn("text-muted-foreground mt-4 text-sm", className)} {...props} />;
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption };
```

and `components/ui/scroll-area.tsx` (stock shadcn):

```tsx
"use client";

import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { cn } from "@/lib/utils";

function ScrollArea({ className, children, ...props }: React.ComponentProps<typeof ScrollAreaPrimitive.Root>) {
  return (
    <ScrollAreaPrimitive.Root data-slot="scroll-area" className={cn("relative", className)} {...props}>
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className="focus-visible:ring-ring/50 size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:outline-1"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({ className, orientation = "vertical", ...props }: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        "flex touch-none p-px transition-colors select-none",
        orientation === "vertical" && "h-full w-2.5 border-l border-l-transparent",
        orientation === "horizontal" && "h-2.5 flex-col border-t border-t-transparent",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb data-slot="scroll-area-thumb" className="bg-border relative flex-1 rounded-full" />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
}

export { ScrollArea, ScrollBar };
```

- [ ] **Step 3: Create `components/datasection/AnchorLogTable.tsx`:**

```tsx
"use client";

import { useStore } from "@/src/store/store";
import { useSnapshotFeed } from "@/components/useSnapshotFeed";
import { getNetwork, metagraphById, filterAccent } from "@/src/data/network";
import { buildAnchorLog } from "@/src/data/anchorLog";
import { latestRelevant } from "@/src/data/follow";
import { snapshotSelectActions } from "@/src/engine/domain/pickActions";
import { applyClickActions } from "@/src/store/applyClickActions";
import { fmtDag, fmtKB } from "@/src/util/format";
import { relativeAge } from "@/src/util/relativeAge";
import { IdentityDot } from "@/components/inspector/parts";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// The ledger data table (spec 2026-08-01): the per-metagraph ANCHOR LOG — one row per anchored
// metagraph snapshot in the retained window, finer-grained than the strip's per-tick bars.
// Chronological by construction (newest tick first) — no sortable headers here; the roster
// table is the sortable one. A row click selects the GLOBAL snapshot the row anchored into
// (the metagraph snapshot itself is not a selectable subject) through the SAME tested builder
// as a bar/tile click; selection happens silently — the user drags back up to see the card.
export default function AnchorLogTable() {
  useSnapshotFeed(52); // re-render driver: global + anchor events (the buffers below refresh)
  const filter = useStore((s) => s.filter);
  const live = useStore((s) => s.live);
  const snap = useStore((s) => s.snap);
  const setHoverSnapOrd = useStore((s) => s.setHoverSnapOrd);
  const net = getNetwork();
  const rows = net ? buildAnchorLog(net.metaSnaps, net.globalSnapshots, filter) : [];

  if (rows.length === 0)
    return (
      <p className="m-auto text-label text-muted-foreground">
        {!live ? "NO SIGNAL — waiting for the feed" : filter === "dag" ? "The DAG core anchors nothing — it IS the anchor. Pick a metagraph or All." : "Waiting for anchored metagraph snapshots…"}
      </p>
    );

  const liveOrd = latestRelevant("all")?.ordinal ?? null;
  return (
    <ScrollArea className="flex-1 min-h-0">
      <Table>
        <TableHeader className="sticky top-0 bg-background z-10">
          <TableRow className="text-micro uppercase tracking-caps text-muted-foreground">
            <TableHead>Network</TableHead>
            <TableHead>Snapshot</TableHead>
            <TableHead className="text-right">Fee (DAG)</TableHead>
            <TableHead className="text-right">Size</TableHead>
            <TableHead className="text-right">Anchored into</TableHead>
            <TableHead className="text-right">Age</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const cfg = metagraphById(r.metaId);
            const selected = snap?.data.ordinal === r.global.ordinal;
            return (
              <TableRow
                key={`${r.metaId}:${r.ordinal}`}
                className={cn("cursor-pointer text-body", selected && "bg-[var(--sel-bg)]")}
                onMouseEnter={() => setHoverSnapOrd(r.global.ordinal)}
                onMouseLeave={() => setHoverSnapOrd(null)}
                onClick={() =>
                  applyClickActions(
                    snapshotSelectActions(
                      { kind: "snapshot", title: `Global snapshot #${r.global.ordinal}`, data: r.global },
                      liveOrd === r.global.ordinal,
                    ),
                  )
                }
              >
                <TableCell className="flex items-center gap-2">
                  <IdentityDot hue={filterAccent(r.metaId)} />
                  {cfg?.name ?? r.metaId}
                </TableCell>
                <TableCell className="font-mono tabular-nums text-foreground-dim">{r.ordinal.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtDag(r.fee)}</TableCell>
                <TableCell className="text-right tabular-nums text-foreground-dim">{fmtKB(r.sizeInKB)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{r.global.ordinal.toLocaleString()}</TableCell>
                <TableCell className="text-right text-muted-foreground">{relativeAge(Date.now() - Date.parse(r.ts))}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}
```

(NB `metagraphById` returns the config entry — check its return's display field (`name`/`ticker`) in `src/data/network.ts:100` and use what's there. Multiple rows can share one anchoring global — they ALL wash `--sel-bg` when it's selected; honest, they anchored into the selected snapshot.)

- [ ] **Step 4: Create `components/datasection/NodeRosterTable.tsx`:**

```tsx
"use client";

import { useState } from "react";
import { useStore } from "@/src/store/store";
import { buildRoster, sortRoster, type RosterSortKey } from "@/src/data/roster";
import { nodeSelectActions } from "@/src/engine/domain/pickActions";
import { applyClickActions } from "@/src/store/applyClickActions";
import { metagraphById, filterAccent } from "@/src/data/network";
import { hoverKeyOf } from "@/src/data/hoverSubject";
import { ccToFlag } from "@/src/util/format";
import { IdentityDot } from "@/components/inspector/parts";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// The hyper/geo data table (spec 2026-08-01): the NODE ROSTER — a flat, sortable, denser
// projection of the same `selNodes` the explorers browse (complementary, not a replacement).
// Column order is the view's lens: geo leads with location, hyper with network/architecture.
// A row click = the explorer row click (nodeSelectActions: filter→ancestry→inspect; re-click
// deselects); it commits silently — the user drags back up to see the card/camera. Row hover
// glows the node's 3D shells (hoverNodeId, outward-only — the cohort-row convention).
const COLS: Record<"hyper" | "geo", { key: RosterSortKey; label: string }[]> = {
  geo: [
    { key: "country", label: "Country" },
    { key: "city", label: "City" },
    { key: "isp", label: "Provider" },
    { key: "net", label: "Network" },
    { key: "id", label: "Node" },
    { key: "layer", label: "Layer" },
  ],
  hyper: [
    { key: "net", label: "Network" },
    { key: "id", label: "Node" },
    { key: "layer", label: "Layer" },
    { key: "isp", label: "Provider" },
    { key: "country", label: "Country" },
    { key: "city", label: "City" },
  ],
};

export default function NodeRosterTable({ mode }: { mode: "hyper" | "geo" }) {
  const selNodes = useStore((s) => s.selNodes);
  const filter = useStore((s) => s.filter);
  const live = useStore((s) => s.live);
  const inspect = useStore((s) => s.inspect);
  const setHoverNodeId = useStore((s) => s.setHoverNodeId);
  const [sort, setSort] = useState<{ key: RosterSortKey; dir: 1 | -1 }>({ key: COLS[mode][0].key, dir: 1 });
  const rows = sortRoster(buildRoster(selNodes), sort.key, sort.dir);

  if (rows.length === 0) {
    const cfg = metagraphById(filter);
    return (
      <p className="m-auto text-label text-muted-foreground">
        {!live ? "NO SIGNAL — waiting for the feed" : cfg ? `${cfg.name} has no locatable nodes.` : "Acquiring nodes…"}
      </p>
    );
  }

  const cell = (r: (typeof rows)[number], key: RosterSortKey) => {
    switch (key) {
      case "net": {
        const cfg = r.netId ? metagraphById(r.netId) : null;
        return (
          <span className="flex items-center gap-2">
            {r.netId && <IdentityDot hue={filterAccent(r.netId)} />}
            {cfg?.name ?? r.netId ?? "—"}
          </span>
        );
      }
      case "id":
        return <span className="font-mono text-foreground-dim">{r.node.id ?? r.node.label}</span>;
      case "layer":
        return r.node.roles.length ? r.node.roles.join(" · ") : r.node.layer;
      case "country":
        return r.node.country ? `${ccToFlag(r.node.cc)} ${r.node.country}` : "—";
      case "city":
        return r.node.city ?? "—";
      case "isp":
        return r.isp ? `${r.isp}${r.asn ? ` · ${r.asn}` : ""}` : "—";
    }
  };

  return (
    <ScrollArea className="flex-1 min-h-0">
      <Table>
        <TableHeader className="sticky top-0 bg-background z-10">
          <TableRow>
            {COLS[mode].map((c) => (
              <TableHead key={c.key}>
                <button
                  className="text-micro uppercase tracking-caps text-muted-foreground hover:text-foreground cursor-pointer"
                  onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? ((s.dir * -1) as 1 | -1) : 1 }))}
                >
                  {c.label}
                  {sort.key === c.key && <span aria-hidden> {sort.dir === 1 ? "↑" : "↓"}</span>}
                </button>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const selected = hoverKeyOf(inspect) != null && hoverKeyOf(inspect) === hoverKeyOf(r.node.pick);
            return (
              <TableRow
                key={r.key}
                className={cn("cursor-pointer text-body", selected && "bg-[var(--sel-bg)]")}
                onMouseEnter={() => r.node.id && setHoverNodeId(r.node.id)}
                onMouseLeave={() => setHoverNodeId(null)}
                onClick={() =>
                  applyClickActions(nodeSelectActions(r.node.pick, { mode, currentFilter: filter, deselect: selected }))
                }
              >
                {COLS[mode].map((c) => (
                  <TableCell key={c.key}>{cell(r, c.key)}</TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}
```

(Sort-direction arrows are text glyphs like the Tooltip's `‹›` — acceptable bespoke punctuation, not emoji.)

- [ ] **Step 5: Wire `DataSection.tsx`:**

```tsx
"use client";

import { useStore } from "@/src/store/store";
import AnchorLogTable from "@/components/datasection/AnchorLogTable";
import NodeRosterTable from "@/components/datasection/NodeRosterTable";

// Section 2 (spec 2026-08-01): the per-view raw-data table — ledger = the anchor log,
// hyper/geo = the node roster (location-first in geo). The flat placeholder views have no
// dataset yet: the same honest preview language as Blueprint, never a fabricated table.
export default function DataSection() {
  const mode = useStore((s) => s.mode);
  return (
    <div className="h-full flex flex-col px-6 py-3">
      {mode === "ledger" ? (
        <AnchorLogTable />
      ) : mode === "hyper" || mode === "geo" ? (
        <NodeRosterTable mode={mode} />
      ) : (
        <p className="m-auto text-label text-muted-foreground uppercase tracking-caps">preview · in development</p>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Verify types + tests.** Run: `npx tsc --noEmit && npm test`
Expected: PASS — in particular `components/selectionBoundary.test.ts` (the new components use only builders + `applyClickActions` + hover setters).

- [ ] **Step 7: Visual + behavioural verification** (chrome-devtools MCP):
  1. Hyper → open section 2 (chevron): the roster renders; click a Network header — sorts; click a node row → drag back up (chevron): the node card is populated and the camera framed the node; the row shows the `--sel-bg` wash when you return down; re-clicking the selected row deselects.
  2. Geo → section 2: location columns lead; a row click also commits country+cohort ancestry (check the country/provider cards populate).
  3. Ledger → section 2: the anchor log lists per-metagraph rows, newest first; hovering a row highlights the matching strip bar/ledger block (`hoverSnapOrd`); clicking a non-live row → back up: the snapshot card is pinned to that global ordinal.
  4. Filter to a 0-locatable metagraph (e.g. TBC) in geo → section 2 shows the honest "no locatable nodes" line.
  5. Flat view (Network status) → section 2 shows "preview · in development".
  6. Tablet (≤1099px) + phone (<700px) viewports: drag/chevron still work; the table scrolls horizontally inside the ScrollArea if columns overflow; phone dock bar is hidden in section 2.

- [ ] **Step 8: Commit.**

```bash
git add package.json package-lock.json components/ui/table.tsx components/ui/scroll-area.tsx components/datasection/AnchorLogTable.tsx components/datasection/NodeRosterTable.tsx components/DataSection.tsx
git commit -m "feat(datasection): per-view tables — ledger anchor log, hyper/geo node roster (shadcn Table)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Documentation truth + full verification pass

**Files:**
- Modify: `CLAUDE.md`
- Modify: `.superpowers/sdd/progress.md` (append the work-ledger entry)

**Interfaces:** none (docs + verification only).

- [ ] **Step 1: Update CLAUDE.md** — every claim the feature changed, each edited in place:
  1. *Layout system* intro + the **Bottom** zone bullet: the HUD is now four zones PLUS section 2 — the LiveStrip is the DIVIDER/drag-handle to the per-view data-table section (GSAP `SectionSlider`, `store.section`); bars are LEDGER-ONLY, other views carry the `NodeCountReadout`; `--bottom-reserve` is unchanged.
  2. *The snapshot card is ledger-scoped* paragraph: replace the "carries across views until deselected" sentences — leaving ledger clears the pin (`Engine.setMode`), `snapHint` gates to ledger.
  3. *The snapshot stream — LiveStrip* section: bars only in ledger; describe the strip's readout role elsewhere; bar-click copy loses "in whatever view you're in".
  4. *Architecture — `components/`* list: add `SectionSlider`, `DataSection` (+ `datasection/`), `NodeCountReadout`; note `ui/table.tsx` + `ui/scroll-area.tsx` in *shadcn primitives in use*.
  5. *`src/data/`*: add `anchorLog.ts` + `roster.ts` one-liners.
  6. Note the two new deps (gsap, @radix-ui/react-scroll-area) wherever deps are discussed (*Run & test* intro).
  7. Add the transformed-wrapper containing-block trick to *CSS traps* (fixed children re-anchor to a transformed ancestor — the mechanism SectionSlider exploits and the reason portalled UI must be gated/portalled).

- [ ] **Step 2: Append to `.superpowers/sdd/progress.md`** — a short dated entry: tasks 9+11 shipped per the 2026-08-01 spec, listing the seven commits and any adjudications/deviations made during implementation.

- [ ] **Step 3: Full verification.**
  1. `npx tsc --noEmit && npm test` — clean.
  2. `npm run build` — clean; `/api/metagraphs` still `○` with `10m` revalidate.
  3. Visual sweep (chrome-devtools MCP): boot → hyper (readout strip) → open/close section 2 → geo drill + roster select → ledger bars + anchor log + pin/unpin → flat view placeholder → tablet + phone widths → `prefers-reduced-motion` emulation (section change is an instant snap, no throw).
  4. Regression: the 3D↔3D view transition still runs cleanly (the canvas rides the wrapper untouched), rails scroll within `--bottom-reserve`, the filter strip (`--topbar-extra`) still pushes rails+canvas down in BOTH sections.

- [ ] **Step 4: Commit.**

```bash
git add CLAUDE.md .superpowers/sdd/progress.md
git commit -m "docs: two-section shell + ledger-scoped snapshot card — CLAUDE.md truth updates

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
