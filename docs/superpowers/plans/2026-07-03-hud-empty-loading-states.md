# Empty & Loading States Implementation Plan (Phase 7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Represent *absence* and *in-flight* data honestly in the Instrument-Glass language — the three-state taxonomy **ACQUIRING** (resolving from the network), **NO SIGNAL** (feed unreachable), **STANDBY** (nothing picked) — plus the GeoExplore quiet-empty, all built from the app's own atoms (node-dot, pulse, ring, cross-fade), never a generic spinner and never fabricated data.

**Architecture:** A small set of shared **state atoms** (node-stars twinkle, sonar-ring, standby halo) as presentational components + CSS tokens with locked motion values. `NetworkData` gains a `lastGoodAt` timestamp surfaced through the store; the live-data panels (snapshot card, top-bar vitals, LiveStrip) render the NO-SIGNAL treatment off `!live`. ACQUIRING replaces the snapshot card's "reading…" text with the node-stars atom; STANDBY aligns the existing pick-hint to the spec.

**Tech Stack:** Next.js 15 (App Router) + React 19 + TS; Zustand store; the vanilla `js/api.js` `NetworkData` feed; Tailwind v4 + shadcn; vitest.

## Global Constraints

- **Node ≥ 18.18**; branch **dev**; commit as author **`digitaltwinnn`** with trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Never fabricate data — show the honest state instead** (`factual-no-fabricated-data`). NO SIGNAL never shows a number; it shows `Explorer API: unreachable` + `Last good read: Ns ago`.
- **Absence is a reading** — every empty/loading state is built from the app's atoms (node-dot / pulse / ring / cross-fade), each animation *means* something (resolve, retry, invitation), never just "busy". No generic scan-shimmer skeleton, no full-screen spinner.
- **Motion vocabulary (locked):** smooth & low; opacity over transform; shared **1.5 s ease-in-out** breathe; expanding rings/halos peak **≤ 0.5 opacity** (STANDBY halo 0.52, NO-SIGNAL ring ≤ 0.6). Locked values:
  - ACQUIRING star twinkle: **1.5 s, opacity 0.3→0.9, staggered ~0.18 s, NO scale**.
  - ACQUIRING resolve: cross-fade **~350 ms ease** (stars out / value in), **width reserved** (no layout shift).
  - NO SIGNAL panel: **desaturate ~0.45**, accent spine greys, red dot breathe 1.5 s.
  - NO SIGNAL sonar ring: **emitted per retry (~3 s poll = `VIS.pollMs`)** — data-meaningful, not the 1.5 s tempo; expands quickly (first ~1.4 s), single soft ring, opacity ≤ 0.6, dim core node.
  - STANDBY node glow: 1.5 s, opacity 0.58→1.0, scale 1→1.09; halo period 1.6 s, single, opacity peak 0.52, scale →3.6; peers static faint ~0.15.
- **Reduced-motion (`prefers-reduced-motion`):** NO twinkle / scale / ping. Stars hold at steady dim (value still fades in); STANDBY node holds a steady glow, no halo; NO SIGNAL shows a static ring + dot.
- **Two-lane colour:** ACQUIRING/STANDBY are **neutral cyan** (structural); NO SIGNAL greys/desaturates (a red breathe dot is the only accent). Identity hues are not used by these states.
- **Exact source, or nothing (→ ACQUIRING):** the snapshot fee/breakdown render only from the exact read; SETTLING/polled-floor is already removed and must NOT be reintroduced.

---

## Existing hooks (grounding — read before starting)

- **Signal:** `js/api.js` `NetworkData.live` (bool). `_setLive(v)` emits `status {live}`. `_tick()` (every `VIS.pollMs`) tries `/global-snapshots/latest`; success → `_setLive(true)`; catch → `_setLive(false)`. There is **no** `lastGoodAt` yet — Task 1 adds it. `src/data/network.ts:37` bridges `status → setLive`.
- **Store:** `src/store/store.ts` has `live: boolean` + `setLive`. Task 1 adds `lastGoodAt`.
- **ACQUIRING (thin, exists):** `components/inspector/cards.tsx` `SnapshotCard` computes `awaitingExact = exact == null` and passes `awaiting` to `components/inspector/AnchoredTags.tsx`, which shows a `reading…` (`.anc-reading`, italic). The fee block only renders when `exact != null`. Task 4 upgrades these to node-stars.
- **STANDBY (thin, exists):** `components/Inspector.tsx` `PickHint` renders `<p className="rc-pickhint"><span className="rc-vd-halo"/> {invite}</p>` (a single breathing halo + copy) in the empty Detail slot. Task 5 aligns it to the spec (adds faint static peers + the locked glow).
- **Vitals:** `components/topbar/Vitals.tsx` (the top-bar live-activity readouts). **LiveStrip:** `components/LiveStrip.tsx`. Both are live-data panels → Task 3 gives them the NO-SIGNAL treatment.
- **`relativeAge(ms)`** (`src/util/relativeAge.ts`, pure, tested) already formats `"Ns ago"` / `"Nm ago"` — reuse it for "Last good read".
- **ECG** already flatlines+greys on `!live` (`EcgMark` + `.ecg--off`); the brand dims (`.tb-brand.off`). Keep; the panel treatments are additive.
- Shared **`breathe`** keyframe (opacity 0.55↔1) is in `app/globals.css`. The `.rc-vd-halo` (STANDBY halo) is in `app/styles/13-right-column.css`.

## File Structure

- **Create** `components/state/StateAtoms.tsx` — the shared presentational atoms: `NodeStars` (ACQUIRING), `SonarRing` (NO SIGNAL), `StandbyHalo` (STANDBY). One file (small, sibling atoms that share the motion vocabulary).
- **Create** `components/state/StateAtoms.test.tsx` — vitest (render counts / reduced-motion class presence via jsdom).
- **Create** `app/styles/15-states.css` — the state CSS (twinkle, sonar, desaturate, standby glow) with the locked values + reduced-motion; imported in `app/globals.css`.
- **Modify** `js/api.js` — set + emit `lastGoodAt`.
- **Modify** `src/data/network.ts` + `src/store/store.ts` — surface `lastGoodAt`.
- **Modify** `components/inspector/cards.tsx` + `components/inspector/AnchoredTags.tsx` — ACQUIRING node-stars + the snapshot NO-SIGNAL rows.
- **Modify** `components/topbar/Vitals.tsx`, `components/LiveStrip.tsx` — NO-SIGNAL treatment.
- **Modify** `components/Inspector.tsx` — STANDBY alignment (peers).
- **Modify** `components/GeoExplore.tsx` — the quiet-empty (0 locatable nodes).

---

### Task 1: `lastGoodAt` through the stack (the NO-SIGNAL "last good read")

**Files:** Modify `js/api.js`, `src/data/network.ts`, `src/store/store.ts`. Test: `src/store/store.test.ts` (create if absent).

**Interfaces:**
- Produces: `store.lastGoodAt: number | null` (ms epoch of the last successful poll; null until the first good read). `setLive(live: boolean, lastGoodAt?: number)`.

- [ ] **Step 1: Write the failing test** — `src/store/store.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { useStore } from "./store";

describe("store.live / lastGoodAt", () => {
  it("records lastGoodAt on a live read and keeps it through a drop", () => {
    useStore.getState().setLive(true, 1000);
    expect(useStore.getState().live).toBe(true);
    expect(useStore.getState().lastGoodAt).toBe(1000);
    useStore.getState().setLive(false); // drop — no new timestamp
    expect(useStore.getState().live).toBe(false);
    expect(useStore.getState().lastGoodAt).toBe(1000); // preserved
  });
});
```

- [ ] **Step 2: Run to verify fail** — `npx vitest run src/store/store.test.ts` → FAIL (`setLive` takes 1 arg / `lastGoodAt` undefined).

- [ ] **Step 3: Implement.**
  - `src/store/store.ts`: add field + widen the setter. In the state interface add `lastGoodAt: number | null;` and change `setLive: (live: boolean) => void;` → `setLive: (live: boolean, lastGoodAt?: number) => void;`. In the initial state add `lastGoodAt: null,`. Implement:
    ```ts
    setLive: (live, lastGoodAt) => set((s) => ({ live, lastGoodAt: lastGoodAt ?? s.lastGoodAt })),
    ```
  - `js/api.js`: in the constructor add `this.lastGoodAt = null;`. In `_setLive`, accept the timestamp — change signature to `_setLive(v, at)` and emit it: replace both `this._emit("status", { live: v })` calls with `this._emit("status", { live: v, lastGoodAt: this.lastGoodAt })`, and when `v === true` set `if (at) this.lastGoodAt = at;` **before** emitting. In `_tick`, on success call `this._setLive(true, Date.now())`; on catch `this._setLive(false)`.
  - `src/data/network.ts:37`: change the bridge to forward the timestamp:
    ```ts
    net.on("status", ({ live, lastGoodAt }: { live: boolean; lastGoodAt: number | null }) => setLive(live, lastGoodAt ?? undefined));
    ```

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/store/store.test.ts` → PASS.

- [ ] **Step 5: Typecheck** — `npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit**

```bash
git add js/api.js src/data/network.ts src/store/store.ts src/store/store.test.ts
git commit -m "feat(states): surface lastGoodAt (the NO SIGNAL 'last good read')

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Shared state atoms + CSS

The reusable atoms every state is built from, with the locked motion values + reduced-motion. Presentational, no store access.

**Files:** Create `components/state/StateAtoms.tsx`, `app/styles/15-states.css`. Modify `app/globals.css` (import the stylesheet).

**Testing note (decided at pre-flight):** these are presentational JSX with no logic — do NOT add a render/jsdom test. The repo's vitest is node-only (pure logic only); verify the atoms VISUALLY (chrome-devtools MCP) where they're consumed in Tasks 3–5. Do not add `@testing-library/react`/jsdom or touch `vitest.config.ts`.

**Interfaces:**
- Produces:
  - `NodeStars({ count = 5 }: { count?: number }): JSX.Element` — a row of `count` twinkling node-dots (`<span className="st-star">`), for ACQUIRING.
  - `SonarRing(): JSX.Element` — a dim core node emitting one sonar ring; the ring is **keyed to remount per retry** by the caller (see Task 3), so this renders a single `.st-sonar` ring + `.st-sonar-core`.
  - `StandbyHalo(): JSX.Element` — the STANDBY node glow + single halo + faint static peers.

- [ ] **Step 1: Implement `components/state/StateAtoms.tsx`:**

```tsx
"use client";

// Shared empty/loading-state ATOMS — built from the app's own marks (node-dot, ring, halo) so a
// loading/absent state reads as part of the instrument, not a bolt-on. Motion values are locked in
// 15-states.css (all reduced-motion gated there). Presentational only — no store access.

// ACQUIRING — a short row of node-stars twinkling on in staggered sequence while a value resolves.
export function NodeStars({ count = 5 }: { count?: number }) {
  return (
    <span className="st-stars" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <span className="st-star" key={i} style={{ animationDelay: `${i * 0.18}s` }} />
      ))}
    </span>
  );
}

// NO SIGNAL — a dim core node emitting ONE soft sonar ring. The caller remounts this (changing key)
// once per retry (the poll cadence), so each retry = one emitted ring — the animation IS the retry.
export function SonarRing() {
  return (
    <span className="st-sonar-wrap" aria-hidden>
      <span className="st-sonar-core" />
      <span className="st-sonar" />
    </span>
  );
}

// STANDBY — a single live node glowing with the same expanding halo a real node gets on hover (the
// pick invitation), among a few faint static peers.
export function StandbyHalo() {
  return (
    <span className="st-standby" aria-hidden>
      <span className="st-peer st-peer--a" />
      <span className="st-peer st-peer--b" />
      <span className="st-peer st-peer--c" />
      <span className="st-standby-halo" />
      <span className="st-standby-node" />
    </span>
  );
}
```

- [ ] **Step 2: Implement `app/styles/15-states.css`** (locked values; all animation reduced-motion gated):

```css
/* ── Empty / loading state atoms (Phase 7) — neutral cyan; motion smooth & low ──────────────── */

/* ACQUIRING — node-stars twinkle (opacity only, staggered; NO scale). */
.st-stars { display: inline-flex; gap: 5px; align-items: center; vertical-align: middle; }
.st-star {
  width: 5px; height: 5px; border-radius: 50%;
  background: var(--core); opacity: 0.3;
  animation: st-twinkle 1.5s ease-in-out infinite;
}
@keyframes st-twinkle { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.9; } }
/* Resolve: the value cross-fades in over the reserved cell (no layout shift). */
.st-resolve-in { animation: st-fade-in 0.35s ease both; }
@keyframes st-fade-in { from { opacity: 0; } to { opacity: 1; } }

/* NO SIGNAL — panel desaturate + grey spine + red breathe dot; a sonar ring per retry. */
.no-signal { filter: saturate(0.45); }
.no-signal .panel-eyebrow, .no-signal .insp-eyebrow { color: var(--muted); }
.ns-dot {
  width: 7px; height: 7px; border-radius: 50%; flex: none;
  background: #ff5a5a; box-shadow: 0 0 0 3px color-mix(in oklch, #ff5a5a 22%, transparent);
  animation: breathe 1.5s ease-in-out infinite;
}
.ns-rows { font-size: 11.5px; color: var(--muted); display: flex; flex-direction: column; gap: 3px; }
.st-sonar-wrap { position: relative; display: inline-block; width: 14px; height: 14px; vertical-align: middle; }
.st-sonar-core { position: absolute; inset: 4px; border-radius: 50%; background: color-mix(in oklch, var(--muted) 60%, transparent); }
.st-sonar {
  position: absolute; inset: 4px; border-radius: 50%;
  border: 1px solid color-mix(in oklch, var(--core) 55%, transparent);
  animation: st-sonar 1.4s ease-out 1 forwards; /* quick expand; one per remount (retry) */
}
@keyframes st-sonar {
  from { transform: scale(1); opacity: 0.6; }
  to   { transform: scale(3.2); opacity: 0; }
}

/* STANDBY — a live glowing node + single halo among faint static peers. */
.st-standby { position: relative; display: inline-block; width: 44px; height: 26px; vertical-align: middle; }
.st-standby-node {
  position: absolute; left: 8px; top: 50%; width: 9px; height: 9px; margin-top: -4.5px;
  border-radius: 50%; background: var(--core);
  animation: st-standby-node 1.5s ease-in-out infinite;
}
@keyframes st-standby-node { 0%, 100% { opacity: 0.58; transform: scale(1); } 50% { opacity: 1; transform: scale(1.09); } }
.st-standby-halo {
  position: absolute; left: 8px; top: 50%; width: 9px; height: 9px; margin-top: -4.5px;
  border-radius: 50%; border: 1px solid var(--core);
  animation: st-standby-halo 1.6s ease-out infinite;
}
@keyframes st-standby-halo { 0% { transform: scale(1); opacity: 0.52; } 100% { transform: scale(3.6); opacity: 0; } }
.st-peer { position: absolute; width: 5px; height: 5px; border-radius: 50%; background: var(--muted); opacity: 0.15; }
.st-peer--a { left: 26px; top: 4px; } .st-peer--b { left: 34px; top: 15px; } .st-peer--c { left: 24px; top: 18px; }

@media (prefers-reduced-motion: reduce) {
  .st-star { animation: none; opacity: 0.7; }
  .st-resolve-in, .ns-dot, .st-sonar, .st-standby-node, .st-standby-halo { animation: none; }
  .st-standby-halo { opacity: 0; } /* no halo at rest under reduced motion */
  .st-standby-node { opacity: 1; }
}
```

Add the import to `app/globals.css` next to the other `app/styles/*.css` imports: `@import "./styles/15-states.css";` (match the existing import syntax/order in that file).

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit` → clean, and `npx vitest run` (the existing suite still passes; no new test here). The atoms are verified visually in Tasks 3–5 where they render.

- [ ] **Step 4: Commit**

```bash
git add components/state/StateAtoms.tsx app/styles/15-states.css app/globals.css
git commit -m "feat(states): shared state atoms (node-stars / sonar-ring / standby-halo) + CSS

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: NO SIGNAL treatment on the live panels

Apply the NO-SIGNAL state to the live-data panels: the snapshot card (rows + sonar), the top-bar vitals, and the LiveStrip.

**Files:** Modify `components/inspector/cards.tsx` (`SnapshotCard`), `components/topbar/Vitals.tsx`, `components/LiveStrip.tsx`.

**Interfaces:**
- Consumes: `store.live`, `store.lastGoodAt` (Task 1); `SonarRing` (Task 2); `relativeAge` (`src/util/relativeAge`).

- [ ] **Step 1: Snapshot card NO-SIGNAL block.** In `SnapshotCard`, read `const live = useStore((s) => s.live); const lastGoodAt = useStore((s) => s.lastGoodAt);`. Track the retry key (one sonar ring per poll while down) with a small effect:

```tsx
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (live) return;
    const id = setInterval(() => setRetry((r) => r + 1), 3000); // matches VIS.pollMs cadence
    return () => clearInterval(id);
  }, [live]);
```

When `!live`, render the NO-SIGNAL block INSTEAD of the anchored/settlement body (keep the `◆ ordinal` title), wrapping the card with the `no-signal` class:

```tsx
  if (!live) {
    return (
      <div className="insp-snap no-signal">
        <div className="snap-titlerow">
          <span className="snap-title"><span className="snap-diamond" aria-hidden>◆</span><Odometer value={d.ordinal} className="snap-ord" /></span>
          <span className="snap-state"><span className="ns-dot" /> no signal</span>
        </div>
        <div className="insp-div" />
        <div className="ns-block">
          <SonarRing key={retry} />
          <div className="ns-rows">
            <span>Explorer API: unreachable</span>
            <span>Last good read: {lastGoodAt ? relativeAge(Date.now() - lastGoodAt) : "—"}</span>
          </div>
        </div>
      </div>
    );
  }
```

Add `.ns-block { display: flex; align-items: center; gap: 12px; margin-top: 6px; }` to `app/styles/15-states.css`. (Import `SonarRing`, `useState`, `useEffect`, `relativeAge` as needed.)

- [ ] **Step 2: Vitals + LiveStrip.** Add the `no-signal` class + a red `ns-dot` eyebrow to `Vitals` (top-bar) and `LiveStrip` when `!live`, so the whole live lane desaturates and reads "no signal" (numbers/bars are NOT shown fabricated — the desaturated last-known frame with the red dot suffices; if a panel would otherwise show a stale number, replace it with `—`). Read `const live = useStore((s) => s.live)` in each and gate: `className={"…" + (live ? "" : " no-signal")}`; in Vitals add a small `{!live && <span className="ns-dot" />}` near its eyebrow. (LiveStrip already has `--ls-accent`; desaturation via `no-signal` is enough — do not clear its bars, they're the last honest frame.)

- [ ] **Step 3: Typecheck + visual check.** `npx tsc --noEmit` → clean. Then, with the shared dev server, simulate the drop by blocking the API in chrome-devtools (or temporarily forcing `setLive(false)`) and confirm: the snapshot card shows `◆ ordinal · no signal` + a sonar ring pinging ~every 3 s + `Explorer API: unreachable` / `Last good read: Ns ago`; the vitals + strip desaturate with the red dot; the ECG flatlines (existing). Recovery restores live in place.

- [ ] **Step 4: Commit**

```bash
git add components/inspector/cards.tsx components/topbar/Vitals.tsx components/LiveStrip.tsx app/styles/15-states.css
git commit -m "feat(states): NO SIGNAL treatment — desaturate + sonar-per-retry + last-good-read

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: ACQUIRING node-stars (replace "reading…")

Swap the snapshot card's italic "reading…" for the node-stars atom; resolve = cross-fade the value in over the reserved cell.

**Files:** Modify `components/inspector/AnchoredTags.tsx`, `components/inspector/cards.tsx`.

**Interfaces:** Consumes `NodeStars` (Task 2).

- [ ] **Step 1: AnchoredTags.** Where it currently renders `{awaiting && <div className="anc-reading">reading…</div>}`, replace with the node-stars + a micro eyebrow:

```tsx
        {awaiting && (
          <div className="anc-acquiring"><NodeStars count={4} /><span className="anc-acq-label">resolving</span></div>
        )}
```

Add to `app/styles/15-states.css`: `.anc-acquiring { display: flex; align-items: center; gap: 8px; margin-top: 4px; } .anc-acq-label { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }`.

- [ ] **Step 2: Snapshot settlement.** The fee block already renders only when `exact != null`. When `exact == null` (and `live`), show the ACQUIRING stars for the fee row instead of hiding it, so the cell reserves width and cross-fades on resolve. In `SnapshotCard`, in the settlement area, when `exact == null && live`, render `<div className="snap-settle-row"><span className="snap-settle-label">Fees paid</span><span className="snap-settle-val"><NodeStars count={4} /></span></div>`; when `exact != null`, the real value gets the `st-resolve-in` class on its `.snap-settle-amt`.

- [ ] **Step 3: Typecheck + visual check.** `npx tsc --noEmit` → clean. On the live tick before its exact read lands, the fee + breakdown show twinkling stars ("resolving"), then cross-fade to the value with no layout shift. (Reduced-motion: stars steady-dim, value still fades in.)

- [ ] **Step 4: Commit**

```bash
git add components/inspector/AnchoredTags.tsx components/inspector/cards.tsx app/styles/15-states.css
git commit -m "feat(states): ACQUIRING node-stars replace 'reading…' (cross-fade resolve)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: STANDBY alignment + GeoExplore quiet-empty

Bring the pick-hint to the spec's STANDBY treatment, and add the GeoExplore quiet-empty for a filtered metagraph with 0 locatable nodes.

**Files:** Modify `components/Inspector.tsx` (`PickHint`), `components/GeoExplore.tsx`. CSS: `app/styles/15-states.css` (+ the existing `.rc-pickhint`).

**Interfaces:** Consumes `StandbyHalo` (Task 2).

- [ ] **Step 1: STANDBY pick-hint.** In `Inspector.tsx` `PickHint`, replace the lone `.rc-vd-halo` with the `StandbyHalo` atom (node glow + halo + faint peers), keeping the invite copy:

```tsx
  return (
    <p className="rc-pickhint"><StandbyHalo /> {line}</p>
  );
```

(Remove the now-unused `.rc-vd-halo` from the pick-hint only if nothing else uses it — grep first; the snapshot live-dot uses its OWN class, so `.rc-vd-halo` is likely pick-hint-only and can be dropped from `13-right-column.css`.)

- [ ] **Step 2: GeoExplore quiet-empty.** In `GeoExplore.tsx`, when the active filter is a real metagraph (`filter !== "all" && filter !== "dag"`) with **0 locatable nodes** (`store.selNodes.length === 0` for the filtered set / the country list is empty because nothing is locatable), replace the country list with the quiet-empty:

```tsx
      <div className="geo-quiet-empty">
        <span className="st-standby-dim" aria-hidden><span className="st-standby-node" /></span>
        <p className="geo-qe-title">No locatable nodes</p>
        <p className="geo-qe-line">{tickerOrName} has no validators we can place on the map right now. It still appears in the Hypergraph.</p>
        <button className="geo-qe-jump" onClick={() => setMode("hyper")}>See it in the Hypergraph →</button>
      </div>
```

CSS in `15-states.css`: `.geo-quiet-empty { padding: 16px 8px; text-align: center; } .st-standby-dim { filter: grayscale(1); opacity: 0.5; } .geo-qe-title { font-size: 12.5px; color: var(--text); margin: 8px 0 2px; } .geo-qe-line { font-size: 11.5px; color: var(--muted); line-height: 1.5; } .geo-qe-jump { margin-top: 8px; background: none; border: none; color: var(--core); font: inherit; font-size: 12px; cursor: pointer; } .geo-qe-jump:hover { text-decoration: underline; }`. Get `setMode` from the store; `tickerOrName` from the active `metagraphById(filter)`. NO fabricated data.

- [ ] **Step 3: Typecheck + visual check.** `npx tsc --noEmit` → clean. STANDBY: the empty Detail slot shows a glowing node + halo among faint peers + the invite. Quiet-empty: filter to a metagraph with 0 locatable nodes (e.g. PACA/LEET/TBC at the current bake) → GeoExplore shows the dimmed node + copy + the Hypergraph jump; clicking it switches to hyper.

- [ ] **Step 4: Commit**

```bash
git add components/Inspector.tsx components/GeoExplore.tsx app/styles/15-states.css app/styles/13-right-column.css
git commit -m "feat(states): STANDBY halo+peers pick-invite; GeoExplore quiet-empty (0 locatable nodes)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (against the specs)

**1. Spec coverage:** ACQUIRING node-stars + resolve cross-fade (Task 4, atoms Task 2); NO SIGNAL desaturate + sonar-per-retry + last-good-read (Tasks 1+3, atom Task 2); STANDBY node-glow + halo + peers (Task 5, atom Task 2); GeoExplore quiet-empty (Task 5); shared locked motion values + reduced-motion (Task 2 CSS). SETTLING stays removed (not reintroduced). ✅

**2. Placeholder scan:** every code step shows the actual code; the one "check current form" note (AnchoredTags `reading…` line, `.rc-vd-halo` grep) is a locate-then-edit instruction, not a TBD. ✅

**3. Type consistency:** `setLive(live, lastGoodAt?)` + `store.lastGoodAt` (Task 1) match their use in Task 3; `NodeStars`/`SonarRing`/`StandbyHalo` signatures (Task 2) match Tasks 3–5; `.no-signal`/`.st-*` class names are shared verbatim across the CSS and the components. ✅

**4. Motion values:** every locked value from the spec table is transcribed into `15-states.css` with the reduced-motion overrides. ✅

**Scope note:** the **global first-load / BootOverlay** (`2026-07-01-global-first-load-design.md`) is a separate subsystem (a DOM forming-core + engine cross-fade handoff) and is deliberately **Phase 8**, not folded here — this phase gives it the ACQUIRING/NO-SIGNAL states it will reuse.
