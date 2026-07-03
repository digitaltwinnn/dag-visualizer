# Global first-load (cold start) — design

**Date:** 2026-07-01
**Scope:** The whole-app first paint / cold start, before any data has arrived, across all four zones. Distinct from the per-panel **NO SIGNAL** (an error/unreachable state).

## Principle

First-load is **ACQUIRING at app scale** — the app *coming alive*, not an error. So it's **neutral cyan ("connecting")**, calm, using the constellation/ACQUIRING language — **not** the grey NO-SIGNAL flatline. It only **degrades to NO SIGNAL** if data never arrives within a timeout.

Nothing shows fabricated data; every zone shows its honest acquiring state and **fills in progressively** as its own data lands (metagraph list → geo → first snapshot), each on its own timeline. No full-screen spinner.

## Independent of the Three.js scene

`SceneCanvas` is dynamic-imported (`ssr:false`), so on cold start there's a gap where the **Three bundle + WebGL context aren't ready** and the canvas is blank. The boot visual must **not** live inside the scene (that would show nothing during the gap). So:

- **Chrome (top bar, rails, strip) = instant React** — never waits for Three.
- **The forming-core is a lightweight DOM/SVG overlay** — painted immediately by React, independent of the engine.
- The engine loads in the background; when it's **up + first data lands**, the real 3D scene **cross-fades in** beneath the overlay.

### Three phases
1. **Instant DOM boot (0 ms).** React paints the frame + a DOM/SVG **forming-core** (the Global L0 core materialising with a soft expanding ping) + a brief `reaching the network…` label; the vitals / strip / rails show their **ACQUIRING shimmer** (constellation / node-stars). No Three yet, no blank canvas.
2. **Cross-fade handoff.** Engine ready + first data in → the DOM core (**centre-aligned + styled to match** the real core) fades out as the real **3D core fades in** — seamless, reads as continuous forming, not a swap. The engine **skips its own entry animation** (the boot already covered it).
3. **Live scene.** DOM overlay gone; the real core + nodes populate as data flows.

On a fast connection, phases 1→3 blur into one quick smooth reveal; on a slow one, phase 1 holds gracefully.

## Scene boot visual — Forming core

The centre shows the **Global L0 core materialising** (soft radial glow + an expanding ping ring), then nodes populate around it — thematic (the network's centre boots first) and it literally *becomes* the real core at handoff. (Constellation-coalesce and a minimal centre-pulse were the alternatives; the forming core won for being on-theme and enabling the seamless handoff.)

## The ECG logo through boot

The brand **ECG traces** during boot (connecting); its **first real beat** fires on the **first snapshot**. On timeout → it **flatlines + greys** (the NO SIGNAL state), and the boot overlay's cyan "connecting" turns to the grey no-signal treatment.

## Affected components

- `components/SceneCanvas.tsx` / `page.tsx` — add a **`BootOverlay`** (DOM/SVG forming-core + connecting label) shown until the engine is ready **and** first data has landed; then cross-fade it out as the canvas fades in.
- `src/engine/Engine.ts` — expose a **`ready`** signal; **fade the scene in** on first paint and **skip the entry animation** when arriving via the boot handoff; align the real core to the overlay's centre.
- `components/DataBridge.tsx` — surface a **first-data** signal (per feed) so zones + the handoff can trigger.
- Zones (`Vitals`, `LiveStrip`, rail tools) — reuse their **ACQUIRING** states (from `2026-07-01-empty-loading-states-design.md`) until their data lands; resolve in place.
- Timeout → the app-wide **NO SIGNAL** treatment (grey, flatline ECG).

## Open / follow-ups

- Implementation plan (writing-plans).
- The timeout duration before first-load → NO SIGNAL.
- Exact matching (size/position) of the DOM forming-core to the real 3D core for a seamless cross-fade.
