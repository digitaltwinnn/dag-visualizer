# HUD ↔ scene tie-in — design

**Date:** 2026-07-01
**Scope:** How the flat HUD (chrome) and the 3D scene (canvas) behave as one system — hover/pick affordances, the selection language shared across both, and the hover tooltip. Completes the HUD refresh.

## Principle

**One focus language across chrome and canvas.** A thing (a node, a hub, a snapshot) looks and behaves the same whether you point at its 3D object or its panel card. The vocabulary is the one already designed elsewhere — the **node-halo** (from STANDBY / the loading states), the **accent = the subject's identity hue**, and the shared **selection tokens** (`--sel-bg` / `--sel-border`).

## Synced focus — no connecting line

A drawn tether between a card and its moving 3D object was considered and **rejected** (a persistent line chases the node as the camera orbits and multiplies with several cards; even a one-shot "connect flash" adds little). Instead:

- **The node and its card glow the same hue, at the same time.** You read the link because both light up together — no line needed. Cleanest, and robust under camera motion.
- **Bidirectional hover:**
  - Hover a **3D node** → the node halos **and** its card/row (rail or explorer list) highlights in the same hue.
  - Hover a **card / list row** → the 3D node halos (the existing hover-pairing, made symmetric).
- **Halo = the shared affordance.** The soft expanding halo is identical to the STANDBY invite and the node hover — one motion, everywhere.

## The tooltip — a lean label

On hover of a 3D object, a small tooltip gives the quick "what am I pointing at":

- **Lean:** `‹identity› · ‹name›` + `click to inspect` (e.g. `DED · node-9c2 — click to inspect`). Identity ticker in the metagraph hue.
- **Not a mini-card.** The full facts (state, layer, location, …) live in the **card that opens on click**, so the tooltip never duplicates them — it labels, it doesn't detail.
- Instrument-Glass styling (glass, hairline border tinted to the subject hue).

## Click commits

Hover is transient/preview; **click commits** the selection, consistently for scene and chrome:

- The **card pins** into the right-rail subject stack (as a Detail child under its Context; per `2026-07-01-right-rail-subject-stack-design.md`).
- The **scene focuses** (camera tween / the view's focus behaviour).
- The **filter sets** to the node's metagraph (existing behaviour — so the right-rail thread + LiveStrip re-tint to that identity).

## Reduced-motion

The halo holds at a steady dim (no expand); the glow sync + tooltip still apply.

## Affected components

- `src/engine/Engine.ts` — hover-pairing already glows the scene on node hover; **make it symmetric** (hover a card/row → glow the scene node) and ensure the hovered subject's **card/row also highlights** (write hover subject to the store so the rail can react). Keep the per-view pick registry.
- `components/Tooltip.tsx` — lean label form (identity · name + "click to inspect"); subject-hue border.
- `components/Inspector.tsx` / list rows — react to the hovered-subject store field with the synced glow (shared `--sel-*` tokens).
- Selection tokens in `app/styles/00-base.css` — the single `--sel-bg` / `--sel-border` language used by both the cards and (via engine) the 3D highlight accent.

## Open / follow-ups

- Implementation plan (writing-plans).
- Which 3D objects are hoverable per view stays governed by the existing pick registry (`_pickablesFor`).
