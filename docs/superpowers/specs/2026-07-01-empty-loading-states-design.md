# Empty & loading states — design

**Date:** 2026-07-01
**Scope:** How the HUD represents *absence* and *in-flight* data — the "empty/loading" states — in the Instrument-Glass language. Part of the larger HUD refresh (Instrument-Glass direction + two-lane colour system), but self-contained.

## Problem

The app's rule is **never fabricate data — show the honest state instead** (`factual-no-fabricated-data`). So loading/empty states aren't decoration; they're how we stay truthful when we don't (yet) have a number. Two things were wrong:

1. **A dead state.** The snapshot card carried a "SETTLING / FLOOR" treatment (a polled lower-bound fee shown as `≥ N` / "at least", flipping to "complete"). It is unreachable in practice — see below — so it had to go.
2. **A generic state.** The remaining loading state was a stock scan-shimmer skeleton — seen on every SaaS site, and meaningless here.

## Guiding principle

**Absence is a reading.** A mission-control instrument never blanks or spins a generic loader — it *reports its own status*. Every empty/loading state is built from the app's own atoms — the **node-dot**, the **pulse**, the **ring**, the **cross-fade** — so it reads as part of the instrument, not a bolt-on. And each animation *means* something (a retry, a resolve, an invitation), never just "busy".

## The state taxonomy (three states)

Down from four — SETTLING is removed.

### 1. ACQUIRING — "Constellation fill"
**When:** a focused tick (live or selected) exists — its total anchored count is already final — but the **exact breakdown** (fee, per-metagraph split, size) from the raw L0 snapshot (`/api/snapshot/[ordinal]`) hasn't landed yet.
**Treatment:** the known total stays solid; each pending field shows a short row of **node-stars** (the app's atom, 4–5 dots) twinkling on in staggered sequence. When the exact read resolves, the stars **cross-fade** out and the value **fades in** — smooth, no flash, no layout shift (the cell reserves its width). A quiet eyebrow micro-label ("resolving") names the state and drops on resolve.
**Meaning:** the value is being *resolved from the network*, not spun.

### 2. NO SIGNAL — "Reconnect ping"
**When:** the block-explorer API is unreachable (`NetworkData` stays factual, recovers on next good poll).
**Treatment:** the panel **desaturates** (~0.45) and its accent spine greys; a red dot slow-breathes in the eyebrow; a dim **core node emits one soft sonar ring per retry**. The ring cadence *is* the poll interval (~3s) — the animation literally visualises the retry. Rows show `Explorer API: unreachable` + `Last good read: Ns ago`. **Never a fabricated number.**
**Meaning:** calling out, getting no answer.

### 3. STANDBY — "Awaiting a node"
**When:** nothing is selected (e.g. the geo "Selected node" card / inspector `#rc-empty`).
**Treatment:** no dashed box. A single live **node glows** with the **same expanding halo a real node gets on hover** — the pick invitation — among a few faint, static unselected peers. The inspector reads as a lens with nothing under it yet.
**Meaning:** an invitation to pick, at rest.

> Out of scope: the **SOON** placeholder for unbuilt views (status/transactions/staking) — that's "not built", not "loading".

## Motion vocabulary (shared)

Locked principle: **smooth & low** — motion should read as ambient breathing, never announce itself; the 3D scene stays the star.

- **Opacity over transform.** Breathe brightness; the only expansions are halos/pings and they stay faint.
- **Tempo:** a shared **~1.5 s** ease-in-out breathe cycle across states.
- **Low ceiling:** expanding rings/halos peak at **~0.5 opacity**.
- **Reduced-motion (`prefers-reduced-motion`):** no twinkle / scale / ping. Stars hold at a steady dim (value still fades in); STANDBY node holds a steady glow with no halo; NO SIGNAL shows a static ring + dot.

### Locked values

| State | Element | Value |
|---|---|---|
| shared | breathe cycle | 1.5 s ease-in-out |
| ACQUIRING | star twinkle | 1.5 s, opacity 0.3→0.9, staggered ~0.18 s, **no scale** |
| ACQUIRING | resolve | cross-fade ~350 ms ease (stars out / value in), width reserved |
| NO SIGNAL | panel | desaturate ~0.45, spine grey, red dot breathe 1.5 s |
| NO SIGNAL | sonar ring | **emitted per retry (~3 s poll)** — data-meaningful, not the aesthetic tempo; ring expands quickly (first ~1.4 s) so it doesn't read sluggish; single soft ring, opacity ≤ 0.6, dim core node |
| STANDBY | node glow | 1.5 s, opacity 0.58→1.0, scale 1→1.09 |
| STANDBY | halo | period 1.6 s, single, opacity peak 0.52, scale →3.6 |
| STANDBY | peers | static, faint (~0.15) |

> Note the one deliberate exception: NO SIGNAL's ping is **emitted** on the poll cadence (it carries meaning — one ring per retry), not the shared 1.5 s aesthetic tempo; only its expansion speed is quickened to stay lively.

## Code — the SETTLING removal (done)

Why it's unreachable: the retained snapshot buffer is `maxSnapshots: 52` (`js/config.js`) ≈ **11 min** of history at ~4.5 snaps/min. Every selectable tick (LiveStrip bars, ledger `SLOT_N=9` trail) reads only that buffer, so no selectable tick is older than ~11 min — comfortably inside the L0 node's **~30 min** exact-read retention (~2.5× margin). So the exact read always resolves; the polled-floor fee/`≥`/FLOOR path never persists. **Rule:** exact source, or nothing (→ ACQUIRING).

Removed (snapshot-card only; verified `tsc` clean):
- `components/inspector/cards.tsx` — the polled-floor fee (`getAnchor(...).fee`), the `full`/`identified` calc, the `isLive`/`latestOrdinal` gating, and the `{complete / at least}` tag. Fee renders **only** from the exact read; `awaiting` now covers any focused tick.
- `components/inspector/AnchoredTags.tsx` — the entire `else if (!awaiting)` polled-floor branch and its `getAnchor`/`activity` wiring. Breakdown pills are exact-only; otherwise `reading…`.

Kept (still load-bearing, verified in use): the `anchorIndex`/`getAnchor` infra (fees-per-hour rates + sparklines, LiveStrip bars, ledger tile counts), `.insp-mini.approx` (node-readiness in `MetaCard`), `.mg-tag--settling` (the `reading…` pill).

## Where it applies

- **ACQUIRING** — the ledger `SnapshotCard` (fee + `AnchoredTags` breakdown). Any future exact-read-backed field follows the same pattern.
- **NO SIGNAL** — any live-data panel when `NetworkData` is in its no-data state (top-bar vitals, snapshot card, live strip lane).
- **STANDBY** — the right-rail Detail zone when its pick is empty (geo `GeoLiveCard` / `#rc-empty`).

## Open / follow-ups

- Implementation plan (component + CSS-token changes) is the next step (writing-plans).
- Fold the shared motion values into the design-system tokens when the broader Instrument-Glass token pass happens.
