# Placeholder views — design

**Date:** 2026-07-01
**Scope:** How the three scaffolded views — **Network**, **Transactions**, **Staking** — present in their not-yet-built (SOON) state, and each one's intent. Consumes the right-rail (view-default), command-bar (dimmed glyph), and colour-lane decisions.

## Intent (what each becomes)

- **Network** — live **health**: validator uptime, node states (Ready / waiting / offline), software-version spread across Global L0 + metagraphs. One at-a-glance read of whether the network is healthy and where any trouble is.
- **Transactions** — **money flow**: $DAG and the metagraphs' own currencies moving between addresses, visualised live; plus tx lookup/trace (à la the DAG explorer) and economic stats (value moved, active addresses). *Not* a snapshot feed.
- **Staking** — **delegated staking**: who is staked to which validators, total $DAG delegated, rewards flowing back; how stake (and consensus weight) is distributed and shifts over time.

## The SOON state

A scaffolded view has an empty scene and empty left/bottom zones. It's filled **honestly** (no fake data, per `factual-no-fabricated-data`):

- **Center — schematic blueprint.** A faint, abstract **wireframe of what the view will be**, explicitly labelled **`preview · in development`**, so it never reads as live data (no numbers, no real values). Per view:
  - **Network** → a **health grid** of node cells (a couple dashed = waiting, one hollow = offline — schematic states, not counts).
  - **Transactions** → an **address/flow graph** (address nodes + dashed flow arrows).
  - **Staking** → **validators** (sized) with **delegation lines** converging from smaller staker dots.
  - Rendered in neutral structural chrome (blueprint = chrome, not identity); flow/accent lines in cyan.
- **Right rail — the view-default explainer.** The same **View-default card** built views use (`2026-07-01-right-rail-subject-stack-design.md`), here carrying a **`soon`** tag: the view title + a one-line "what this becomes". **Kept on the right rail for consistency and reuse** — not centered — so the zone behaves identically to a live view.
- **Top bar — dimmed glyph + `soon`.** The view's segmented-switch button is **dimmed and marked `soon`** (per the command-bar spec), so it's reachable and clearly not-yet-live.
- **Left rail — empty.** No tool card until the view has real interaction (the old left `PlaceholderPanel` "about" copy is gone — that orientation is now the right-rail view-default).
- **Bottom — empty.** No LiveStrip (it's snapshot-bearing views only).

## Affected components

- `components/LeftColumn.tsx` — drop the `PLACEHOLDERS` left-rail cards; a placeholder view renders no left tool.
- New: a **view-default card** variant carrying the `soon` tag (right rail), reused across all views.
- New: a per-view **blueprint** rendered in the (otherwise empty) scene area — a small static SVG/canvas overlay, one per placeholder, labelled `preview · in development`.
- `components/TopBar.tsx` — dimmed + `soon` mark on the three placeholder glyphs (already in the command-bar spec).

## Open / follow-ups

- Implementation plan (writing-plans).
- When a view is actually built, its blueprint is replaced by the real view; the view-default explainer drops its `soon` tag and becomes the live orientation card; its left tool (if any) appears.
- Each real view (Network/Transactions/Staking) is its own future design + build cycle — this spec only covers the holding state + intent.
