# HUD ↔ Scene Tie-in Implementation Plan (Phase 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the flat HUD and the 3D scene behave as one focus system — a node, a snapshot, or a metagraph hub looks and behaves the same whether you point at its 3D object or its card — via a symmetric same-hue glow (no tether line) and a lean identity tooltip, applied **consistently to every card type through one shared mechanism**.

**Architecture:** A pure `hoverSubject` helper maps a `PickDescriptor` → the node hover-pairing key and → a lean tooltip label. The store already carries three "hovered subject" channels — `hoverNodeId` (node), `hoverSnapOrd` (snapshot), `hoverFilter` (metagraph/hub) — each already wired to a 3D effect. The engine's 3D hover writes the right channel per pick kind; **one shared `subjectPairing` helper** then lets every card (node / snapshot / dossier) and the explorer rows highlight in the subject's identity hue when it is the hovered one, and glow the 3D object back on card hover. Bidirectional, no drawn line, identical treatment across card types.

**Tech Stack:** Next.js 15 (App Router) + React 19 + TypeScript + Zustand; a vanilla Three.js engine (`src/engine/Engine.ts` wrapping `js/*`); Tailwind v4 + shadcn; vitest for unit tests.

## Global Constraints

- **Node ≥ 18.18**; branch **dev**; commit as author **`digitaltwinnn`** with trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **One focus language across chrome and canvas:** the same node-halo affordance + **accent = the subject's identity hue** + shared selection tokens (`--sel-bg` / `--sel-border`, in `app/styles/00-base.css`).
- **No connecting line** between a card and its 3D object — the link reads because both glow the same hue at the same time.
- **Bidirectional hover:** hover a 3D object → it halos AND its card/row highlights (same hue); hover a card/row → the 3D object halos.
- **CONSISTENCY (this phase's headline):** the pairing behaviour is IDENTICAL for every card type — a node card, a snapshot card, and a dossier (metagraph) card — plus the explorer rows, all through ONE shared helper + ONE shared highlight treatment. New 3D-clickable objects (snapshot tiles today, future views) inherit it by using the same channel + helper, never a bespoke copy.
- **Lean tooltip:** `‹ticker› · ‹name›` + `click to inspect`; the identity ticker + a hairline border carry the subject's identity hue (core cyan `#2af5ff` for a DAG-core validator / global snapshot); the body stays neutral. NOT a mini-card — no state/layer/location (those live in the card that opens on click). Instrument-Glass styling.
- **Click commits** (already implemented, must stay consistent): the card pins into the right-rail stack, the scene focuses, the filter sets to the node's metagraph.
- **Reduced-motion:** the halo holds at a steady dim (no expand); the glow sync + tooltip still apply; card-glow transitions are disabled.
- **Two-lane colour:** identity hue only on the identity marks (3D glow, tooltip ticker/border, the paired row/card accent `--row-hue`); structural chrome stays cyan. `--sel-*` remain the COMMITTED-selection tokens; the transient hover pairing is the lighter, identity-hue cue — do NOT repaint `--sel-*` to a metagraph hue.
- **Test-safety:** pure helpers under `src/data/` must NOT import the browser-only `js/api.js` or `src/data/network.ts`; import plain constants from `js/config.js` and pure utils from `src/util/format.ts` (both import-free), per `src/data/breadcrumb.ts`.

---

## Existing hooks (grounding — read before starting)

- **Store** (`src/store/store.ts`): three hovered-subject channels, each already driving a 3D effect —
  - `hoverNodeId: string | null` + `setHoverNodeId` → globe node-shell glow.
  - `hoverSnapOrd: number | null` + `setHoverSnapOrd` → the ledger re-colours that snapshot's tiles (set today by the LiveStrip; cleared each tick).
  - `hoverFilter: string | null` + `setHoverFilter` → previews a metagraph's dim in any view (set today by hub/chip hover).
  - `hover: {...} | null` + `setHover` — the tooltip payload (THIS plan changes its shape to `HoverSubject`). `inspect` = the selected node; `snap` = the selected snapshot; `filter` = committed metagraph.
- **Engine** (`src/engine/Engine.ts`): `_handleMove(e)` (~line 547) raycasts (`_pickAt`), computes a node id inline (`metanode → node.ip`, `l0/l1 → node.id`), calls `this.globe.setHoverNode(hoverId)` **directly**, sets `hoverFilter` for hubs (`meta` picks), and `setHover({title,sub,roles,id,color})`. It does NOT currently set `hoverSnapOrd` on a snapshot-tile hover. A `useStore.subscribe` handler (~line 168-173) maps `hoverFilter → globe.setHoverFilter/ledger.setFilter`, `hoverSnapOrd → ledger.setSelected`, and `hoverNodeId → globe.setHoverNode`. `_handleClick` (~line 591) commits (hub→setFilter, snapshot-tile→setSnap, node→setInspect+setFilter). `shortHash`/`hex`/`CORE_HEX` are imported from `network.ts` (browser — fine in the engine).
- **Geo explorer** (`components/GeoExplore.tsx`, ~line 113): each node row computes `hoverKey` (`metanode → node.ip`, `l0/l1 → node.id`), calls `setHoverNodeId(hoverKey)` on enter / `setHoverNodeId(null)` on list leave; `.nb-row.active` marks the SELECTED node (`on`).
- **Cards** (`components/inspector/cards.tsx`): `GeoLiveNode` (selected node), `SnapshotCard` (selected snapshot, prop `data`), `MetaCard` (the dossier, prop `cfg`). None hover-pair to the scene yet. `SnapshotCard` reads `d.ordinal`; `MetaCard` has `cfg.id` + `hex(cfg.color)` as `hue`. The dossier renders inside `ContextCard` (`#metapane`).
- **Tooltip** (`components/Tooltip.tsx` + `app/styles/07-hover-tooltip.css`): current two-column form. Position is written to the DOM from the pointer.
- `COLORS.core = 0x2af5ff` in `js/config.js`; `hex(0x2af5ff) === "#2af5ff"`. `hex` is pure (`src/util/format.ts`). vitest resolves `@` (`vitest.config.ts`).

## File Structure

- **Create** `src/data/hoverSubject.ts` — pure: `hoverKeyOf(pick)` + `tooltipSubject(pick)` + `HoverSubject` type. Test-safe.
- **Create** `src/data/hoverSubject.test.ts` — vitest.
- **Create** `components/useSubjectPairing.ts` — the ONE shared pairing helper every card + row uses (returns `{paired, className, style, onMouseEnter, onMouseLeave}` for a `(channelValue, key, setter, hue)`), so the behaviour is identical everywhere.
- **Create** `components/useSubjectPairing.test.ts` — vitest.
- **Modify** `src/store/store.ts` — `hover` field → `HoverSubject | null`; `setHover` signature.
- **Modify** `src/engine/Engine.ts` — `_handleMove`: write the right channel per pick kind (node→`hoverNodeId`, snapshot→`hoverSnapOrd`, meta→`hoverFilter`) + `setHover(tooltipSubject(p))`.
- **Modify** `components/Tooltip.tsx` + `app/styles/07-hover-tooltip.css` — lean label.
- **Modify** `components/GeoExplore.tsx` — rows use `subjectPairing` on the node channel.
- **Modify** `components/inspector/cards.tsx` — `GeoLiveNode` (node channel), `SnapshotCard` (snapshot channel), `MetaCard` (metagraph channel) all use `subjectPairing`.
- **Modify** `app/styles/05-inspector-metagraph-context-pane.css` — the SHARED `.subject-paired` highlight + `.nb-row.hovered`, reduced-motion gated.

---

### Task 1: Pure `hoverSubject` helper (pairing key + lean tooltip label)

**Files:**
- Create: `src/data/hoverSubject.ts`
- Test: `src/data/hoverSubject.test.ts`

**Interfaces:**
- Consumes: `PickDescriptor` (`src/data/types.ts`); `hex` (`src/util/format.ts`); `COLORS` (`js/config.js`).
- Produces:
  - `export function hoverKeyOf(p: PickDescriptor | null | undefined): string | null`
  - `export interface HoverSubject { ident: string; name: string; color: string; mono?: boolean }`
  - `export function tooltipSubject(p: PickDescriptor | null | undefined): HoverSubject | null`

- [ ] **Step 1: Write the failing tests** — create `src/data/hoverSubject.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hoverKeyOf, tooltipSubject } from "./hoverSubject";

describe("hoverKeyOf", () => {
  it("keys a metagraph node by ip", () => {
    expect(hoverKeyOf({ kind: "metanode", node: { ip: "1.2.3.4", id: "abc" } } as never)).toBe("1.2.3.4");
  });
  it("keys a DAG validator by machine id", () => {
    expect(hoverKeyOf({ kind: "l0", node: { id: "node-9c2", ip: "5.6.7.8" } } as never)).toBe("node-9c2");
  });
  it("is null for a hub, a snapshot, and nullish", () => {
    expect(hoverKeyOf({ kind: "meta", cfg: {} } as never)).toBeNull();
    expect(hoverKeyOf({ kind: "snapshot", data: { ordinal: 1 } } as never)).toBeNull();
    expect(hoverKeyOf(null)).toBeNull();
  });
});

describe("tooltipSubject", () => {
  it("labels a metagraph node: ticker + short-able node name + metagraph hue", () => {
    const s = tooltipSubject({ kind: "metanode", node: { id: "9c2f", ip: "1.2.3.4" }, meta: { symbol: "DED", color: 0x36e29a } } as never);
    expect(s).toEqual({ ident: "DED", name: "9c2f", color: "#36e29a", mono: true });
  });
  it("labels a DAG validator as DAG in core cyan, name mono", () => {
    const s = tooltipSubject({ kind: "l1", node: { id: "abcd" } } as never);
    expect(s?.ident).toBe("DAG");
    expect(s?.color).toBe("#2af5ff");
    expect(s?.mono).toBe(true);
  });
  it("labels a hub with its name (ticker ident, metagraph hue, not mono)", () => {
    const s = tooltipSubject({ kind: "meta", cfg: { ticker: "DOR", name: "Dor Technologies", color: 0xff5a3c } } as never);
    expect(s).toEqual({ ident: "DOR", name: "Dor Technologies", color: "#ff5a3c", mono: false });
  });
  it("labels a snapshot by ordinal in core cyan", () => {
    expect(tooltipSubject({ kind: "snapshot", data: { ordinal: 42 } } as never)).toEqual({ ident: "L0", name: "#42", color: "#2af5ff", mono: false });
  });
  it("labels the core", () => {
    expect(tooltipSubject({ kind: "core" } as never)).toEqual({ ident: "DAG", name: "Global L0", color: "#2af5ff", mono: false });
  });
  it("is null for geoLive and nullish", () => {
    expect(tooltipSubject({ kind: "geoLive" } as never)).toBeNull();
    expect(tooltipSubject(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify fail** — `npx vitest run src/data/hoverSubject.test.ts` → FAIL (`Failed to resolve import "./hoverSubject"`).

- [ ] **Step 3: Implement** — create `src/data/hoverSubject.ts`:

```ts
import type { PickDescriptor } from "./types";
import { hex } from "@/src/util/format";
import { COLORS } from "../../js/config.js";

// Core cyan (the DAG spine) — the identity hue for every NON-metagraph subject (a DAG-core
// validator, the L0 core, a global snapshot). From the plain-constant config, NOT network.ts
// (browser-only), so this module stays Node-test-safe.
const CORE = hex((COLORS as { core: number }).core);

// The stable hover-pairing KEY for a NODE pick: a validator by its MACHINE id (so a hybrid's
// several layer-shells read as one machine), a metagraph node by its IP. Anything else → null.
// Shared by the engine (3D raycast) and the geo explorer rows so both sides pair identically.
export function hoverKeyOf(p: PickDescriptor | null | undefined): string | null {
  if (!p) return null;
  if (p.kind === "metanode") return p.node?.ip ?? null;
  if (p.kind === "l0" || p.kind === "l1") return p.node?.id ?? null;
  return null;
}

// A lean tooltip label for a hovered 3D subject: identity ticker, short subject name, identity
// hue (core cyan for non-metagraph subjects). `mono` marks a machine-hash name to short-render.
// Facts (state/layer/location) are NOT here — they live in the card that opens on click.
export interface HoverSubject {
  ident: string; // identity ticker: a metagraph symbol, or "DAG" / "L0"
  name: string; // the subject: node id/ip, metagraph name, "Global L0", or "#<ordinal>"
  color: string; // identity hue hex (metagraph colour, or core cyan)
  mono?: boolean; // name is a machine hash → render monospace + short
}

export function tooltipSubject(p: PickDescriptor | null | undefined): HoverSubject | null {
  if (!p) return null;
  switch (p.kind) {
    case "metanode":
      return {
        ident: p.meta?.symbol || p.meta?.name || "metagraph",
        name: p.node?.id || p.node?.ip || "node",
        color: p.meta ? hex(p.meta.color) : CORE,
        mono: !!p.node?.id,
      };
    case "l0":
    case "l1":
      return { ident: "DAG", name: p.node?.id || p.node?.ip || "validator", color: CORE, mono: !!p.node?.id };
    case "core":
      return { ident: "DAG", name: "Global L0", color: CORE, mono: false };
    case "meta":
      return { ident: p.cfg.ticker || p.cfg.name, name: p.cfg.name, color: hex(p.cfg.color), mono: false };
    case "snapshot":
      return { ident: "L0", name: "#" + p.data.ordinal, color: CORE, mono: false };
    default:
      return null; // geoLive is a rail-only proxy, never a 3D-hover subject
  }
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/data/hoverSubject.test.ts` → PASS (9 assertions).

- [ ] **Step 5: Typecheck** — `npx tsc --noEmit` → no errors.

- [ ] **Step 6: Commit**

```bash
git add src/data/hoverSubject.ts src/data/hoverSubject.test.ts
git commit -m "feat(scene-tiein): pure hoverSubject helper — pairing key + lean tooltip label

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Tooltip pipeline — store shape, engine channels, lean tooltip

Makes the tooltip lean and the 3D hover write the correct hovered-subject channel per pick kind (node/snapshot/metagraph), so chrome can pair (Tasks 3-4).

**Files:**
- Modify: `src/store/store.ts`; `src/engine/Engine.ts` (`_handleMove`); `components/Tooltip.tsx`; `app/styles/07-hover-tooltip.css`.

**Interfaces:**
- Consumes: `hoverKeyOf`, `tooltipSubject`, `HoverSubject` (Task 1); store setters `setHoverNodeId`/`setHoverSnapOrd`/`setHoverFilter`/`setHover`; `shortHash` (`src/data/network.ts`, Tooltip only).
- Produces: `store.hover: HoverSubject | null`.

- [ ] **Step 1: Store `hover` field → `HoverSubject`.** In `src/store/store.ts` add near the `src/data` imports:

```ts
import type { HoverSubject } from "@/src/data/hoverSubject";
```

Replace the `hover: { title: string; sub: string; roles?: string[]; id?: string; color?: string } | null;` declaration with:

```ts
  // The lean hover-tooltip subject for the currently-hovered 3D object (identity ticker + short
  // name + hue). Set by the engine raycast only when the hovered target changes. null = nothing.
  hover: HoverSubject | null;
```

Replace the `setHover` signature with:

```ts
  setHover: (hover: HoverSubject | null) => void;
```

(`hover: null` initial value and `setHover: (hover) => set({ hover })` impl stay.)

- [ ] **Step 2: Engine `_handleMove` — write the right channel per kind + the lean tooltip.** In `src/engine/Engine.ts` add to the `src/data` imports:

```ts
import { hoverKeyOf, tooltipSubject } from "@/src/data/hoverSubject";
```

Replace the whole body of `_handleMove` (from `const p = this._pickAt(e);` to the method's closing brace) with:

```ts
    const p = this._pickAt(e);
    this.canvas.style.cursor = p ? "pointer" : "grab";
    const st = useStore.getState();

    // Route the hovered subject to ITS channel (each already drives a 3D effect + now the paired
    // card/row). Only the channel for the hovered kind is set; the others clear — so exactly one
    // subject is "hovered" at a time. Write only on change (mousemove is high-frequency).
    const nodeKey = hoverKeyOf(p);                                   // node → globe shell glow
    const snapOrd = p?.kind === "snapshot" ? p.data.ordinal : null;  // snapshot → ledger tile
    const metaId = p?.kind === "meta" ? p.cfg?.id ?? null : null;    // hub → metagraph dim preview
    if (nodeKey !== this._hoverNodeKey) { this._hoverNodeKey = nodeKey; st.setHoverNodeId(nodeKey); }
    if (snapOrd !== this._hoverSnapOrd) { this._hoverSnapOrd = snapOrd; st.setHoverSnapOrd(snapOrd); }
    if (metaId !== this._hoverMetaId) { this._hoverMetaId = metaId; st.setHoverFilter(metaId); }

    // The lean tooltip label — re-write the store only when the subject's identity changes so
    // following the cursor never re-renders React.
    const subj = tooltipSubject(p);
    const key = subj ? `${subj.ident}|${subj.name}|${subj.color}` : null;
    if (key === this._hoverKey) return;
    this._hoverKey = key;
    st.setHover(subj);
```

Add the new private field beside the existing `_hoverKey` declaration:

```ts
  private _hoverNodeKey: string | null = null; // last node-pairing key written to the store
  private _hoverSnapOrd: number | null = null; // last snapshot ordinal written to the store
```

Notes for the implementer: `_hoverMetaId` already exists — reuse it. Remove the old inline `idText`/`color`/`hoverId`/direct `this.globe.setHoverNode(...)`/old `hoverMeta` code that this replaces. Keep the `useStore.subscribe` handler (~line 168-173) — it stays the SINGLE path from each channel to its 3D effect. Run `tsc --noEmit`; if `shortHash`/`hex`/`CORE_HEX` are now unused in `Engine.ts`, drop them from its imports. **Guard:** the LiveStrip also clears `hoverSnapOrd` on each tick and the ledger reads `hoverSnapOrd ?? snap.ordinal`; the engine now also writes it — both writers set null when nothing is hovered, so they don't fight (last write wins; the value converges to null when neither hovers).

- [ ] **Step 3: Lean `components/Tooltip.tsx`** — replace the whole file:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/src/store/store";
import { shortHash } from "@/src/data/network";

// Lean hover tooltip — a LABEL, not a mini-card: `‹ticker› · ‹name›` + "click to inspect". The
// identity ticker + a hairline border carry the subject's hue (core cyan for a DAG validator /
// global snapshot); the body stays neutral. Facts live in the card that opens on click. Content
// comes from the store (engine raycast, set only when the target changes); position is written
// straight to the DOM from the pointer so following the cursor never triggers a React render.
export default function Tooltip() {
  const hover = useStore((s) => s.hover);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mm = (e: PointerEvent) => {
      const el = ref.current;
      if (el) {
        el.style.left = e.clientX + "px";
        el.style.top = e.clientY + "px";
      }
    };
    window.addEventListener("pointermove", mm);
    return () => window.removeEventListener("pointermove", mm);
  }, []);

  if (!hover) return null;
  const name = hover.mono ? shortHash(hover.name) : hover.name;
  return (
    <div id="tooltip" ref={ref} style={{ borderColor: hover.color }}>
      <span className="tt-ident" style={{ color: hover.color }}>{hover.ident}</span>
      <span className="tt-sep">·</span>
      <span className={"tt-name" + (hover.mono ? " insp-hash" : "")}>{name}</span>
      <span className="tt-hint">click to inspect</span>
    </div>
  );
}
```

- [ ] **Step 4: Lean `app/styles/07-hover-tooltip.css`** — replace the whole file:

```css
/* ── Hover tooltip — a lean identity LABEL (scene-tie-in) ─────────────────────
   `‹ticker› · ‹name›  click to inspect`, one row. The ticker + a hairline border carry the
   subject's identity hue (set inline); the name + hint stay neutral. Glass surface. */
#tooltip {
  position: fixed; z-index: 30; pointer-events: none;
  display: flex; align-items: baseline; gap: 7px;
  padding: 6px 10px;
  background: rgba(8, 12, 26, 0.92);
  border: 1px solid var(--panel-border); /* overridden inline to the subject hue */
  border-radius: 8px;
  font-size: 12px; white-space: nowrap;
  transform: translate(-50%, -140%);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
}
#tooltip .tt-ident { font-weight: 700; font-size: 11px; letter-spacing: 0.02em; }
#tooltip .tt-sep { color: var(--muted); }
#tooltip .tt-name { color: var(--text); }
#tooltip .tt-name.insp-hash { font-size: 11px; }
#tooltip .tt-hint { color: var(--muted); font-size: 10.5px; margin-left: 6px; opacity: 0.75; }
```

- [ ] **Step 5: Typecheck + tests** — `npx tsc --noEmit && npx vitest run` → clean.

- [ ] **Step 6: Visual check** (shared `next dev` + chrome-devtools MCP; do NOT run `next build`): hover a hub (hyper), a globe node (geo), a snapshot tile (ledger) — the tooltip reads `‹TICKER›/DAG/L0 · ‹name› click to inspect` with a hue border + ticker, neutral body, following the cursor.

- [ ] **Step 7: Commit**

```bash
git add src/store/store.ts src/engine/Engine.ts components/Tooltip.tsx app/styles/07-hover-tooltip.css
git commit -m "feat(scene-tiein): lean identity tooltip + per-kind hovered-subject channels

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Shared `subjectPairing` + node card + explorer rows

Introduces the ONE shared pairing helper and applies it to the node channel (geo node card + explorer rows). Task 4 reuses the exact same helper for snapshot + dossier — that reuse is what guarantees consistency.

**Files:**
- Create: `components/useSubjectPairing.ts`; Test: `components/useSubjectPairing.test.ts`
- Modify: `components/GeoExplore.tsx`; `components/inspector/cards.tsx` (`GeoLiveNode`); `app/styles/05-inspector-metagraph-context-pane.css`

**Interfaces:**
- Produces: `export function subjectPairing<T extends string | number>(active: T | null, key: T | null, set: (v: T | null) => void, hue: string): { paired: boolean; className: string; style: CSSProperties | undefined; onMouseEnter: () => void; onMouseLeave: () => void }`
- Consumes: `hoverKeyOf` (Task 1); store `hoverNodeId`/`setHoverNodeId`.

- [ ] **Step 1: Write the failing test** — create `components/useSubjectPairing.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { subjectPairing } from "./useSubjectPairing";

describe("subjectPairing", () => {
  it("is paired when the key matches the active channel value, exposing the hue var", () => {
    const p = subjectPairing("1.2.3.4", "1.2.3.4", () => {}, "#36e29a");
    expect(p.paired).toBe(true);
    expect(p.className).toBe("subject-paired");
    expect(p.style).toEqual({ "--row-hue": "#36e29a" });
  });
  it("is NOT paired when values differ or the key is null; no hue var at rest", () => {
    expect(subjectPairing(42, 7, () => {}, "#fff").paired).toBe(false);
    expect(subjectPairing(5, null, () => {}, "#fff").paired).toBe(false);
    expect(subjectPairing(5, 7, () => {}, "#fff").className).toBe("");
    expect(subjectPairing(5, 7, () => {}, "#fff").style).toBeUndefined();
  });
  it("onMouseEnter sets the key, onMouseLeave clears it", () => {
    const set = vi.fn();
    const p = subjectPairing<number>(null, 42, set, "#fff");
    p.onMouseEnter(); expect(set).toHaveBeenCalledWith(42);
    p.onMouseLeave(); expect(set).toHaveBeenCalledWith(null);
  });
});
```

- [ ] **Step 2: Run to verify fail** — `npx vitest run components/useSubjectPairing.test.ts` → FAIL (unresolved import).

- [ ] **Step 3: Implement** — create `components/useSubjectPairing.ts`:

```ts
import type { CSSProperties } from "react";

// The ONE shared "focus pairing" every rail card + explorer row uses, so a node, a snapshot, and a
// metagraph card all behave identically: a subject is "paired" when its key equals its store
// channel's current value (the same value the 3D object glows on); while paired it wears the
// `.subject-paired` class + exposes its identity hue as `--row-hue`; hovering it writes/clears the
// channel (glowing the 3D object back). No React state — a pure mapping over the passed-in value.
export function subjectPairing<T extends string | number>(
  active: T | null,
  key: T | null,
  set: (v: T | null) => void,
  hue: string,
): { paired: boolean; className: string; style: CSSProperties | undefined; onMouseEnter: () => void; onMouseLeave: () => void } {
  const paired = key != null && key === active;
  return {
    paired,
    className: paired ? "subject-paired" : "",
    style: paired ? ({ ["--row-hue"]: hue } as CSSProperties) : undefined,
    onMouseEnter: () => set(key),
    onMouseLeave: () => set(null),
  };
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run components/useSubjectPairing.test.ts` → PASS.

- [ ] **Step 5: Explorer rows use it.** In `components/GeoExplore.tsx` add imports:

```ts
import { hoverKeyOf } from "@/src/data/hoverSubject";
import { subjectPairing } from "@/components/useSubjectPairing";
import { hex } from "@/src/util/format";
import { CORE_HEX } from "@/src/data/network";
```

Read the channel value in the component body (beside `setHoverNodeId`):

```ts
  const hoverNodeId = useStore((s) => s.hoverNodeId);
```

In the node-row `.map`, replace the inline `hoverKey` block with the helper + pairing:

```ts
                        const hoverKey = hoverKeyOf(r.pick);
                        const rowHue = r.pick.kind === "metanode" && r.pick.meta ? hex(r.pick.meta.color) : CORE_HEX;
                        const pair = subjectPairing(hoverNodeId, hoverKey, setHoverNodeId, rowHue);
```

Update the `<button>` to fold in the pairing (keep `active` for the committed selection; add the shared `subject-paired` class + hue + the enter/leave from the helper, replacing the old `onMouseEnter`):

```tsx
                          <button
                            key={r.label + i}
                            className={"nb-row" + (on ? " active" : "") + (pair.paired ? " " + pair.className : "")}
                            style={pair.style}
                            title={`${r.label} · ${r.state ?? "—"}`}
                            onClick={() => selectNode(r.pick)}
                            onMouseEnter={pair.onMouseEnter}
                          >
```

(The list-level `onMouseLeave={() => setHoverNodeId(null)}` on `.geo-c-nodes` stays — it clears the channel when the cursor leaves the whole list.)

- [ ] **Step 6: Geo node card uses it.** In `components/inspector/cards.tsx` add imports at the top:

```ts
import { hoverKeyOf } from "@/src/data/hoverSubject";
import { subjectPairing } from "@/components/useSubjectPairing";
```

In `GeoLiveNode`, add after `const id = p.node?.id;` (uses the existing `color` local computed just below — move the `color` computation above this if needed so it's in scope):

```ts
  const setHoverNodeId = useStore((s) => s.setHoverNodeId);
  const hoverNodeId = useStore((s) => s.hoverNodeId);
  const pair = subjectPairing(hoverNodeId, hoverKeyOf(p), setHoverNodeId, color ?? "var(--core)");
```

Wrap the card body in a pairing-aware container (the card currently returns a bare fragment). Change the return to:

```tsx
  return (
    <div className={"gel-card " + pair.className} style={pair.style} onMouseEnter={pair.onMouseEnter} onMouseLeave={pair.onMouseLeave}>
      <button className="gel-clear" title="Deselect" onClick={onClear}>×</button>
      <div className="gel-node-head">
        {color && <span className="gel-dot" style={{ background: color }} />}
        <span className="gel-node-title insp-hash">{title}</span>
        <span className="gel-status"><StatusMark state={p.node?.state} /></span>
      </div>
      {p.node?.ip && <div className="gel-ip">{p.node.ip}</div>}
      <div className="insp-div" />
      {oneNode.length > 0 && (
        <div className="gel-comp">
          <span className="gel-comp-label">Composition</span>
          <CompositionRows nodes={oneNode} />
        </div>
      )}
      {place && <Row label="Location">{place}</Row>}
    </div>
  );
```

- [ ] **Step 7: Shared highlight CSS.** Append to `app/styles/05-inspector-metagraph-context-pane.css`:

```css
/* ── Scene-tie-in: the SHARED focus-pairing highlight ─────────────────────────
   A subject hovered in the 3D scene (or in chrome) lights its paired card/row in ITS identity hue
   (`--row-hue`, set inline only while paired) — the same hue the 3D object glows, so the two read
   as one focus with no drawn line. ONE treatment for every card type (node/snapshot/dossier) +
   rows, so they behave identically. Distinct from `.active`/committed selection. */
.subject-paired {
  position: relative;
  box-shadow: 0 0 0 1px color-mix(in oklch, var(--row-hue, var(--core)) 55%, transparent),
              0 0 18px -4px color-mix(in oklch, var(--row-hue, var(--core)) 50%, transparent);
  transition: box-shadow 0.16s ease;
}
/* Explorer rows are dense list items → a wash + border reads better there than an outer glow. */
.nb-row.subject-paired {
  box-shadow: none;
  background: color-mix(in oklch, var(--row-hue, var(--core)) 14%, transparent);
  border-color: color-mix(in oklch, var(--row-hue, var(--core)) 45%, transparent);
  color: var(--text);
}
.gel-card { position: relative; border-radius: inherit; }
@media (prefers-reduced-motion: reduce) { .subject-paired { transition: none; } }
```

- [ ] **Step 8: Typecheck** — `npx tsc --noEmit` → clean.

- [ ] **Step 9: Visual check** (geo, a metagraph filtered, a country open, a node selected): hover the node's **3D dot** → the matching **explorer row** AND the **node card** light up in the metagraph hue, at the same time the dot halos; hover the **node card** → the dot halos; hover another **row** → its dot halos + the row washes. Resting rows untinted; `.active` still distinct.

- [ ] **Step 10: Commit**

```bash
git add components/useSubjectPairing.ts components/useSubjectPairing.test.ts components/GeoExplore.tsx components/inspector/cards.tsx app/styles/05-inspector-metagraph-context-pane.css
git commit -m "feat(scene-tiein): shared subjectPairing + node card/rows synced glow

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Same pairing for the snapshot card + dossier card (consistency)

Applies the identical `subjectPairing` + `.subject-paired` treatment to the SnapshotCard (snapshot channel) and the MetaCard dossier (metagraph channel), so all card types behave the same — a snapshot tile ↔ its card, a hub sphere ↔ its dossier.

**Files:**
- Modify: `components/inspector/cards.tsx` (`SnapshotCard`, `MetaCard`)

**Interfaces:**
- Consumes: `subjectPairing` (Task 3); store `hoverSnapOrd`/`setHoverSnapOrd`, `hoverFilter`/`setHoverFilter`.

- [ ] **Step 1: Snapshot card pairs on the snapshot channel.** In `components/inspector/cards.tsx`, `SnapshotCard({ data: d })`: add near the other `useStore` reads at the top:

```ts
  const hoverSnapOrd = useStore((s) => s.hoverSnapOrd);
  const setHoverSnapOrd = useStore((s) => s.setHoverSnapOrd);
  const snapPair = subjectPairing<number>(hoverSnapOrd, d.ordinal, setHoverSnapOrd, "var(--core)");
```

Wrap the card's root: change `<div className="insp-snap">` to fold in the pairing (a snapshot's identity hue is the core cyan):

```tsx
    <div className={"insp-snap " + snapPair.className} style={snapPair.style} onMouseEnter={snapPair.onMouseEnter} onMouseLeave={snapPair.onMouseLeave}>
```

(Leave the rest of `SnapshotCard` unchanged. The engine already sets `hoverSnapOrd` from a snapshot-tile hover, and the LiveStrip from a bar hover — so hovering the tile OR the bar now also glows the card, and hovering the card glows the tile + bar-highlight, all through `hoverSnapOrd`. Since `insp-snap` isn't a `.panel`, add `.insp-snap { border-radius: inherit }` if the glow's corners look off — verify in Step 3.)

- [ ] **Step 2: Dossier card pairs on the metagraph channel.** In `MetaCard({ cfg })`: add near the top (after `const hue = hex(cfg.color);`):

```ts
  const hoverFilter = useStore((s) => s.hoverFilter);
  const setHoverFilter = useStore((s) => s.setHoverFilter);
  // Only real metagraph cores pair (not the "all" summary or the DAG core's dim-preview quirk):
  const metaPair = subjectPairing<string>(hoverFilter, cfg.id, setHoverFilter, hue);
```

Wrap the dossier's outer fragment in a pairing container. The dossier currently returns a `<>…</>` starting with `<div className="dossier-head">`. Change the return to:

```tsx
  return (
    <div className={"dossier " + metaPair.className} style={metaPair.style} onMouseEnter={metaPair.onMouseEnter} onMouseLeave={metaPair.onMouseLeave}>
      {/* Header — logo avatar ringed in the identity hue + name + ticker. */}
      <div className="dossier-head">
        {/* …unchanged header/desc/composition/foot… */}
      </div>
      {/* …the rest of the existing dossier body, unchanged… */}
    </div>
  );
```

(Wrap ALL of the existing dossier JSX — head, `<Desc>`, the `comp-block`, `dossier-foot` — inside the single new `<div className="dossier …">`. Do not otherwise change them.)

- [ ] **Step 3: Typecheck + visual check.** `npx tsc --noEmit` → clean. Then (chrome-devtools MCP): (a) **ledger** — hover a snapshot **tile** (or a LiveStrip **bar**) → the **snapshot card** glows cyan; hover the **snapshot card** → the tile/bar highlight; (b) **hyper**, a metagraph filtered — hover its **hub sphere** → the **dossier** glows the metagraph hue; hover the **dossier** → the hub preview-dims the others. Confirm the glow treatment is the SAME across node / snapshot / dossier cards.

- [ ] **Step 4: Commit**

```bash
git add components/inspector/cards.tsx
git commit -m "feat(scene-tiein): snapshot + dossier cards share the same pairing glow (consistency)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (against the spec + the consistency requirement)

**1. Spec coverage:** one focus language / same-hue glow (Tasks 2-4 via the shared channels + `subjectPairing`); no line (design honoured); bidirectional hover (engine→store→chrome + card-hover→store→3D); halo = the existing globe/ledger effects, now driven symmetrically; lean tooltip (Task 1 `tooltipSubject` + Task 2); click commits (unchanged `_handleClick`); reduced-motion (transition gated). ✅

**2. Consistency requirement (user):** ONE `subjectPairing` helper + ONE `.subject-paired` treatment, applied to node card + rows (Task 3) and snapshot + dossier cards (Task 4). Each card maps to its store channel (node/snapshot/metagraph). Future 3D-clickable objects reuse the same helper + channel — no bespoke copy. ✅

**3. Placeholder scan:** every code step is complete; no TBD/"handle edge cases"/"similar to". ✅

**4. Type consistency:** `hoverKeyOf`/`tooltipSubject`/`HoverSubject` (Task 1) match their uses in Tasks 2-3; `subjectPairing<T>` signature (Task 3) matches its calls in Tasks 3 (`string`) and 4 (`number` for snapshot, `string` for metagraph); `--row-hue` is the shared var across rows + all cards; `store.hover` is `HoverSubject | null` everywhere. ✅

**5. Ambiguity resolved:** `--sel-*` remain the committed-selection language; the transient pairing is the lighter, identity-hue cue (`--row-hue`) — noted so an implementer doesn't repaint `--sel-*`.
