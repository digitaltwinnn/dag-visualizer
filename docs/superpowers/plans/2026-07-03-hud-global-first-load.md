# Global First-Load (cold start) Implementation Plan (Phase 8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the whole-app cold start read as the network *coming alive* — a neutral-cyan "connecting" boot with a DOM **forming-core**, painted instantly by React (independent of the Three bundle), that **cross-fades** into the real 3D core the moment the engine is up AND first data has landed; degrading to the grey **NO SIGNAL** treatment only if data never arrives in time. Never a full-screen spinner, never fabricated data.

**Architecture:** `SceneCanvas` is dynamic-imported (`ssr:false`), so on cold start the canvas is blank until the Three bundle + WebGL + first data arrive. The boot visual therefore lives in **React DOM/SVG**, not the scene. The engine exposes a `ready` signal (first rendered frame) → the store; "first data" is already in the store (`latestSnapshot` / `metaList`). A pure `bootPhase()` maps `{engineReady, hasData, live, timedOut}` → `booting | live | no-signal`. A `BootOverlay` shows the forming-core while `booting`, cross-fades out as the `.scene-canvas` fades in on `live`, and switches to grey NO-SIGNAL on `no-signal`. It **latches** — once `live`, it's gone for good (a later feed drop is Phase-7's per-panel NO SIGNAL, not the boot overlay).

**Tech Stack:** Next.js 15 (App Router) + React 19 + TS; the vanilla Three engine (`src/engine/Engine.ts`); `NetworkData` feed; Zustand; Tailwind v4; vitest node-env.

## Global Constraints

- **Node ≥ 18.18**; branch **dev**; commit as author **`digitaltwinnn`** with trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **First-load is ACQUIRING at app scale — neutral cyan "connecting", NOT the grey NO-SIGNAL flatline.** It only degrades to NO SIGNAL if data never arrives within a timeout.
- **Never fabricate data.** Zones show their honest acquiring state and fill in progressively as their own data lands. No full-screen spinner.
- **Boot visual is React DOM/SVG, independent of the Three scene** — it must paint at 0 ms while the Three bundle/WebGL aren't ready (a scene-hosted visual would show nothing during that gap).
- **Seamless handoff:** the DOM forming-core is centre-aligned + styled to read as the real core; on handoff it fades out as the real 3D core fades in — continuous *forming*, not a swap. The engine **skips any entry animation** when arriving via boot (the scene fades in at rest).
- **Latch:** once the app reaches `live`, the boot overlay never shows again (a later drop is handled by Phase-7 per-panel NO SIGNAL).
- **Motion (reuse Phase-7 vocabulary):** smooth & low; the forming-core ping/halo peak ≤ ~0.5 opacity; shared ~1.5 s breathe; cross-fade ~350–600 ms. **Reduced-motion:** no ping/pulse — a static lit core + instant cross-fade.
- **ECG through boot** (already built): the ECG traces (cyan) while connecting and flatlines+greys on `!live` — no change needed here beyond the overlay's own grey switch on timeout.
- The timeout before `booting → no-signal` is **8000 ms** (tunable constant `BOOT_TIMEOUT_MS`).

---

## Existing hooks (grounding — read before starting)

- **`components/SceneCanvas.tsx`** — dynamic-imports `Engine` in an effect and `new Engine(canvasRef.current)`; renders `<canvas className="scene-canvas" />`. No ready callback today.
- **`src/engine/Engine.ts`** — `constructor(canvas)` runs synchronously (`makeScene`, layers/globe/ledger, listeners) and starts a `requestAnimationFrame` render loop (`this.raf`). No `ready`/entry-animation/first-paint signal. The hyper scene renders at rest (no dramatic intro to "skip" — the fade-in IS the entry).
- **`components/DataBridge.tsx`** — `initNetwork()` once; that wires `NetworkData → store` (sets `latestSnapshot` on the first global snapshot, `metaList`/metagraph count from the route, `live`, `lastGoodAt`).
- **Store** (`src/store/store.ts`): `latestSnapshot: GlobalSnapshot | null` (first snapshot = a first-data signal), `metaList: MetaInfo[]` (route metagraphs = another), `live: boolean`, `lastGoodAt`. No `engineReady` yet (Task 1 adds it).
- **`.scene-canvas`** (`app/styles/00-base.css:45`) — `position: fixed; inset: 0; …` — no `opacity`/`transition` (Task 3 adds the fade).
- **State atoms** (`components/state/StateAtoms.tsx`, Phase 7) + `app/styles/15-states.css` — reusable motion vocabulary (halo/ping, reduced-motion gating). The forming-core can reuse these keyframes/values.
- `COLORS.core = 0x2af5ff` (core cyan). `page.tsx` mounts every panel + `<SceneCanvas/>` + `<DataBridge/>`.

## File Structure

- **Modify** `src/engine/Engine.ts` — `constructor(canvas, onReady?)`; call `onReady` once after the first rendered frame.
- **Modify** `components/SceneCanvas.tsx` — pass `onReady` → `store.setEngineReady(true)`; toggle the `.scene-in` fade class from the boot phase.
- **Modify** `src/store/store.ts` — `engineReady: boolean` + `setEngineReady`.
- **Create** `src/data/bootPhase.ts` + `src/data/bootPhase.test.ts` — the pure phase mapper.
- **Create** `components/useBootPhase.ts` — the hook (reads store + engineReady + a timeout; latches once `live`).
- **Create** `components/BootOverlay.tsx` + rules in **`app/styles/15-states.css`** (or a new `16-boot.css`) — the forming-core overlay.
- **Modify** `app/page.tsx` — mount `<BootOverlay/>`; **Modify** `app/styles/00-base.css` — `.scene-canvas` opacity + `.scene-in`.

---

### Task 1: Engine `ready` signal + store flag

**Files:** Modify `src/engine/Engine.ts`, `components/SceneCanvas.tsx`, `src/store/store.ts`. Test: extend `src/store/store.test.ts`.

**Interfaces:**
- Produces: `store.engineReady: boolean` + `setEngineReady(v: boolean)`. `Engine` constructor gains an optional 2nd arg `onReady?: () => void`, invoked exactly once after the first rendered frame.

- [ ] **Step 1: Write the failing test** — add to `src/store/store.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { useStore } from "./store";

describe("store.engineReady", () => {
  it("defaults false and flips true once", () => {
    expect(useStore.getState().engineReady).toBe(false);
    useStore.getState().setEngineReady(true);
    expect(useStore.getState().engineReady).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify fail** — `npx vitest run src/store/store.test.ts` → FAIL (`engineReady` undefined).

- [ ] **Step 3: Implement.**
  - `src/store/store.ts`: add `engineReady: boolean;` to the state interface + `setEngineReady: (v: boolean) => void;`; initial `engineReady: false,`; impl `setEngineReady: (engineReady) => set({ engineReady }),`.
  - `src/engine/Engine.ts`: change the constructor signature to `constructor(canvas: HTMLCanvasElement, onReady?: () => void)`; store it (`this._onReady = onReady;` with a private field `private _onReady?: () => void;`). In the render loop, after the FIRST successful frame render, fire it once:
    ```ts
    // in the render-loop body, after the frame is rendered:
    if (this._onReady) { const cb = this._onReady; this._onReady = undefined; cb(); }
    ```
    (Place it at the end of the per-frame work so it fires only once the scene has actually painted a frame. Guard so a disposed engine doesn't call it.)
  - `components/SceneCanvas.tsx`: pass the callback — `engine = new Engine(canvasRef.current, () => useStore.getState().setEngineReady(true));` (import `useStore`). Keep the `disposed` guard.

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/store/store.test.ts` → PASS.
- [ ] **Step 5: Typecheck** — `npx tsc --noEmit` → clean. (No visual change yet — the flag is just set.)
- [ ] **Step 6: Commit**

```bash
git add src/engine/Engine.ts components/SceneCanvas.tsx src/store/store.ts src/store/store.test.ts
git commit -m "feat(first-load): engine ready signal → store.engineReady

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `bootPhase` pure mapper

**Files:** Create `src/data/bootPhase.ts`, `src/data/bootPhase.test.ts`.

**Interfaces:**
- Produces: `type BootPhase = "booting" | "live" | "no-signal"` and `bootPhase(o: { engineReady: boolean; hasData: boolean; live: boolean; timedOut: boolean }): BootPhase`.

- [ ] **Step 1: Write the failing test** — `src/data/bootPhase.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { bootPhase } from "./bootPhase";

describe("bootPhase", () => {
  it("is booting until BOTH the engine is ready and data has landed", () => {
    expect(bootPhase({ engineReady: false, hasData: false, live: false, timedOut: false })).toBe("booting");
    expect(bootPhase({ engineReady: true, hasData: false, live: true, timedOut: false })).toBe("booting");
    expect(bootPhase({ engineReady: false, hasData: true, live: true, timedOut: false })).toBe("booting");
  });
  it("is live once engine ready AND data present", () => {
    expect(bootPhase({ engineReady: true, hasData: true, live: true, timedOut: false })).toBe("live");
    // live wins even if a subsequent poll is mid-drop — data already arrived
    expect(bootPhase({ engineReady: true, hasData: true, live: false, timedOut: true })).toBe("live");
  });
  it("is no-signal only on timeout with no data and no live feed", () => {
    expect(bootPhase({ engineReady: true, hasData: false, live: false, timedOut: true })).toBe("no-signal");
    expect(bootPhase({ engineReady: false, hasData: false, live: false, timedOut: true })).toBe("no-signal");
  });
});
```

- [ ] **Step 2: Run to verify fail** — `npx vitest run src/data/bootPhase.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `src/data/bootPhase.ts`:

```ts
// The cold-start phase: BOOTING (connecting, cyan) → LIVE (handoff done) → NO-SIGNAL (never
// connected in time). `hasData` = a first real read landed (first snapshot or the metagraph list).
// LIVE latches at the call-site (useBootPhase) so a later feed drop doesn't re-show the overlay.
export type BootPhase = "booting" | "live" | "no-signal";

export function bootPhase(o: {
  engineReady: boolean;
  hasData: boolean;
  live: boolean;
  timedOut: boolean;
}): BootPhase {
  if (o.engineReady && o.hasData) return "live"; // scene up + first data → hand off
  if (o.timedOut && !o.live && !o.hasData) return "no-signal"; // never reached the network
  return "booting"; // still connecting / acquiring
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/data/bootPhase.test.ts` → PASS.
- [ ] **Step 5: Typecheck** — `npx tsc --noEmit` → clean.
- [ ] **Step 6: Commit**

```bash
git add src/data/bootPhase.ts src/data/bootPhase.test.ts
git commit -m "feat(first-load): pure bootPhase mapper (booting/live/no-signal)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `useBootPhase` hook + `BootOverlay` + scene fade-in

The visible boot: the forming-core overlay, the cross-fade handoff, the scene fade-in, and the timeout. Introduces the `.scene-canvas` opacity + its `.scene-in` toggle TOGETHER so there is no broken intermediate (the canvas is never left invisible with no way to show).

**Files:** Create `components/useBootPhase.ts`, `components/BootOverlay.tsx`; modify `app/page.tsx`, `components/SceneCanvas.tsx`, `app/styles/00-base.css`, `app/styles/15-states.css`.

**Interfaces:**
- Consumes: `store.engineReady`/`latestSnapshot`/`metaList`/`live` (Tasks 1 + existing); `bootPhase` (Task 2).
- Produces: `useBootPhase(): BootPhase` — latches `live` (never returns to `booting`/`no-signal` after `live`); starts an 8 s timeout on mount.

- [ ] **Step 1: `components/useBootPhase.ts`:**

```ts
"use client";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/src/store/store";
import { bootPhase, type BootPhase } from "@/src/data/bootPhase";

const BOOT_TIMEOUT_MS = 8000;

// The app's cold-start phase. Latches once LIVE — a later feed drop is Phase-7's per-panel NO
// SIGNAL, not the boot overlay coming back.
export function useBootPhase(): BootPhase {
  const engineReady = useStore((s) => s.engineReady);
  const latestSnapshot = useStore((s) => s.latestSnapshot);
  const metaList = useStore((s) => s.metaList);
  const live = useStore((s) => s.live);
  const [timedOut, setTimedOut] = useState(false);
  const latched = useRef(false);

  useEffect(() => {
    const id = setTimeout(() => setTimedOut(true), BOOT_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, []);

  const hasData = latestSnapshot != null || metaList.length > 0;
  const phase = bootPhase({ engineReady, hasData, live, timedOut });
  if (phase === "live") latched.current = true;
  return latched.current ? "live" : phase;
}
```

- [ ] **Step 2: `components/BootOverlay.tsx`** — the forming-core; fades out on `live`, greys on `no-signal`:

```tsx
"use client";
import { useBootPhase } from "@/components/useBootPhase";

// Cold-start overlay, painted by React independent of the Three scene: a centred forming Global L0
// core (soft radial glow + an expanding ping) + a "reaching the network…" label, in neutral cyan.
// On LIVE it cross-fades out as the real 3D core fades in; on timeout it switches to the grey NO
// SIGNAL treatment. Removed from the DOM once fully faded (LIVE) so it never intercepts anything.
export default function BootOverlay() {
  const phase = useBootPhase();
  if (phase === "live") return null; // handoff complete — gone for good
  const noSignal = phase === "no-signal";
  return (
    <div className={"boot-overlay" + (noSignal ? " boot-overlay--nosignal" : "")} aria-hidden>
      <div className="boot-core">
        <span className="boot-core-ping" />
        <span className="boot-core-glow" />
      </div>
      <p className="boot-label">{noSignal ? "No signal — retrying…" : "reaching the network…"}</p>
    </div>
  );
}
```

- [ ] **Step 3: CSS.** Append to `app/styles/15-states.css`:

```css
/* ── Global first-load (cold start) — the forming Global L0 core, DOM/SVG, neutral cyan ─────── */
.boot-overlay {
  position: fixed; inset: 0; z-index: 9; /* above the canvas (scene-canvas has no z), below the HUD */
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px;
  pointer-events: none;
  animation: st-fade-in 0.4s ease both; /* the overlay itself fades IN at 0 ms */
}
.boot-core { position: relative; width: 120px; height: 120px; }
.boot-core-glow {
  position: absolute; inset: 0; border-radius: 50%;
  background: radial-gradient(circle, color-mix(in oklch, var(--core) 85%, transparent) 0%, transparent 62%);
  animation: breathe 1.5s ease-in-out infinite;
}
.boot-core-ping {
  position: absolute; inset: 34px; border-radius: 50%;
  border: 1px solid color-mix(in oklch, var(--core) 55%, transparent);
  animation: st-sonar 1.6s ease-out infinite; /* reuse the sonar expand (peak ≤ 0.6) */
}
.boot-label {
  font-size: 12px; letter-spacing: 0.08em; color: color-mix(in oklch, var(--core) 80%, var(--text));
  text-transform: lowercase; margin: 0;
}
/* NO SIGNAL after timeout — desaturate to grey, red-ish label. */
.boot-overlay--nosignal { filter: saturate(0.35); }
.boot-overlay--nosignal .boot-core-glow,
.boot-overlay--nosignal .boot-core-ping { filter: grayscale(1); }
.boot-overlay--nosignal .boot-label { color: var(--muted); }
@media (prefers-reduced-motion: reduce) {
  .boot-overlay, .boot-core-glow, .boot-core-ping { animation: none; }
  .boot-core-glow { opacity: 0.9; }
  .boot-core-ping { opacity: 0; }
}
```

- [ ] **Step 4: Scene fade-in.** In `app/styles/00-base.css`, extend `.scene-canvas`:

```css
.scene-canvas {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  display: block;
  opacity: 0;                 /* fade in on the boot handoff */
  transition: opacity 0.6s ease;
}
.scene-canvas.scene-in { opacity: 1; }
@media (prefers-reduced-motion: reduce) { .scene-canvas { transition: none; } }
```

Then in `components/SceneCanvas.tsx`, add the class from the boot phase (the canvas becomes visible exactly on the handoff, as the overlay fades out):

```tsx
import { useBootPhase } from "@/components/useBootPhase";
// …inside the component:
const phase = useBootPhase();
return <canvas ref={canvasRef} className={"scene-canvas" + (phase === "live" ? " scene-in" : "")} />;
```

(`useBootPhase` is safe to call in two components — each subscribes to the store; both converge to `live` and latch. The engine-ready + first-data are global, so the two callers agree.)

- [ ] **Step 5: Mount the overlay.** In `app/page.tsx`, add `import BootOverlay from "@/components/BootOverlay";` and render `<BootOverlay />` (after `<SceneCanvas />`, before the HUD panels, so it sits above the canvas but below the bars).

- [ ] **Step 6: Typecheck + visual check.** `npx tsc --noEmit` → clean; `npx vitest run` still green. Then hard-reload the shared dev server (chrome-devtools MCP): the **forming-core** (cyan glow + ping) + "reaching the network…" shows immediately; when the engine is up + first snapshot lands, the overlay **cross-fades out** as the scene **fades in** (no blank flash, no hard swap); it doesn't reappear on later ticks. To exercise NO-SIGNAL, block the API (devtools request-blocking) before load → after 8 s the overlay greys to "No signal — retrying…" and the ECG flatlines; on unblock + a good poll it hands off to live. Reduced-motion: static core + instant fade.

- [ ] **Step 7: Commit**

```bash
git add components/useBootPhase.ts components/BootOverlay.tsx components/SceneCanvas.tsx app/page.tsx app/styles/00-base.css app/styles/15-states.css
git commit -m "feat(first-load): BootOverlay forming-core + cross-fade handoff + timeout NO SIGNAL

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (against the spec)

**1. Spec coverage:** boot = neutral cyan ACQUIRING not NO-SIGNAL (Task 3 CSS + `bootPhase`); DOM/SVG forming-core independent of Three (BootOverlay is React, painted at 0 ms — Task 3); the three phases — instant DOM boot / cross-fade handoff / live scene (overlay fade-out + `.scene-in` fade-in on `engineReady && hasData`); engine `ready` signal + skip-entry (Task 1 — the scene fades in at rest, no separate entry anim exists to fight); zones fill progressively (they already show Phase-7 ACQUIRING; the overlay covers the app-scale gap); ECG traces then flatlines on `!live` (existing) + the overlay greys on timeout (Task 3); timeout → NO SIGNAL (`bootPhase` + `BOOT_TIMEOUT_MS`); latch so it never re-shows (Task 3 hook). ✅

**2. Placeholder scan:** every step has real code; the timeout value + timings are concrete constants. ✅

**3. Type consistency:** `BootPhase`/`bootPhase` (Task 2) match `useBootPhase` + both consumers (Task 3); `engineReady`/`setEngineReady` (Task 1) match the hook; `.scene-in`/`.boot-*` class names shared verbatim between CSS and components. ✅

**Deferred (per spec's open items):** exact size/position matching of the DOM forming-core to the real 3D core is approximated (screen-centred ≈ the hyper core); pixel-perfect alignment is a follow-up. The engine "skip entry animation" is a no-op today (no dramatic intro exists) — the fade-in is the entry; revisit if a scene intro is added later.
