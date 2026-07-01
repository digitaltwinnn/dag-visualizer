# Right rail — the subject stack (Context · Detail · View-default)

**Date:** 2026-07-01
**Scope:** How the HUD organises the read-only cards (metagraph dossier, node, snapshot, and the view explainer). Reworks the current left/right split into a single threaded "subject stack" on the right rail. Part of the Instrument-Glass HUD refresh.

## Problem

The metagraph filter (or "all") is the **pervasive context** — a snapshot is read through its anchors, a node belongs to it, and clicking a node *sets* the filter to its metagraph. So there's a genuine **parent → child** relationship. But today:

- The **metagraph dossier** (`ContextPanel`/`MetaCard`) is pinned on the **left** rail; the **detail** cards (`snapshot`, `geoLive`) live on the **right**. The parent→child link is invisible.
- The dossier is **read-only identity/make-up** — it behaves like *facts*, yet sits in the left "explore/interact" rail. A mismatch.

## Decision

**The right rail becomes a threaded "subject stack"; the left rail becomes purely the view's interactive tool.**

- **Left rail** = one interactive tool (the view's `LearnPanel` / `GeoExplore` / `LedgerPanel`). Verbs only.
- **Right rail** = the facts column: **Context (parent) → Detail (children)**, plus the **View-default** card at rest. Reading only.

## Three card roles (no overlap)

1. **Context — parent.** *Which subject*: the selected metagraph dossier, or an "All · whole network" summary when unfiltered. Top of the stack. Not dismissible (it mirrors the filter — cleared from the top-bar filter control).
2. **Detail — child.** *Specific facts*: the node / snapshot you clicked. Hangs off the context. Dismissible (`×`).
3. **View-default — at rest.** *What this lens is for*: the view explainer. It's the **resting state of the Detail slot** (the upgraded STANDBY), replaced by detail children on selection.

## Showing the parent → child relationship

A vertical **anchor-line thread** runs down the stack (reusing the app's anchor-line motif), tinted to the **active metagraph's identity hue** (identity lane), with a **node-dot** where each card attaches. Each child carries a **breadcrumb eyebrow** naming its parent.

**Rail placement & visual (settled):**
- **Outer edge, not inner.** The thread hugs the **screen's outer edge** (right rail → right side of the cards); cards hang off it *toward* the scene. Principle: *rails dock to the screen edges; the thread runs the outer edge; content faces the scene* (mirrored for the left rail if it ever threads). Keeps the 3D centrepiece clean and makes the rail a signature edge feature.
- **Instrument channel.** The spine sits in a subtle **recessed groove** (inner shadow) with **gradation tick-marks** in *neutral* structural chrome (ticks are measurement, not identity). The ticks use the **gradient-faded** treatment — distinct marks that dissolve toward the top & bottom (densest at the middle), so it never reads as a dense ruler. The **identity-hued spine** runs inside the groove.
- **Node-dots at each card's vertical middle** (not the top corner) — so they never collide with the card's **× (kept top-right, conventional)**.
- **Breadcrumbs read toward the edge** (`node ‹ DOR`).
- **No data-driven pulse or gauge.** A live anchor-pulse-down-the-spine and a level-gauge variant were explored and rejected — a permanently/near-permanently animating rail competes with the scene. The rail stays static chrome; live acknowledgement happens in the panels (the odometer roll), not the rail.

- **Filter = all:** the spine goes **structural cyan** and the Context card is the compact "All · whole network" summary.
- Clicking a node **sets the filter to its metagraph**, so the spine re-tints to that hue and the node becomes its child — parent/child integrity is automatic.

## The count rule

**One card per *kind*, per view.** The stack is Context (always) + at most one card of each detail kind the current view surfaces (e.g. one node + one snapshot).

- A new click of the **same kind replaces** that card (click another node → the node card swaps).
- Each **view gates** which kinds are eligible (a new clickable opts in per view).
- Not one-total (that would kill the metagraph + node + snapshot scenario); not unlimited (clutter as clickables grow).

## The View-default card

- *What this lens is for* — a short title + one line + a pick-invite. **A text explainer.** Every view has one (including **hyper**, which has no right-rail detail today). Richer **interactive learning** (a guided tour, the ledger's clickable settlement-stack legend) is **not** this card — it's a **left-rail** interactive panel (see the left-rail spec). Right = brief text orientation + facts; left = the thing you interact with.
- **= the Detail slot at rest.** At rest it's the expanded card; once a selection exists it **collapses to a slim view-header strip** at the top of the rail (above the Context card), one click to re-expand. Always accessible, never dominant.
- **Neutral chrome — NOT identity yellow.** Gold `#ffd166` is SWAP's identity hue; using it here is a lane violation (it would misread as "the SWAP metagraph"). The explainer uses muted structural chrome; the only colour is the **cyan node-halo pick-invite** (live/interactive). There is no dedicated "info" colour in the structural lane — orientation chrome is neutral by design, which also keeps it non-dominant.

## Amends the empty-states spec

The **STANDBY** state in `2026-07-01-empty-loading-states-design.md` evolves: instead of a bare "awaiting a node" prompt, the empty Detail slot is the **View-default card** (orientation + the same node-halo invite). NO SIGNAL and ACQUIRING are unchanged.

## Affected components

- `Inspector` (right rail) — hosts the stack: Context + Detail children + the collapsed view-header strip; renders the thread + breadcrumbs.
- `ContextPanel` / `MetaCard` — **moves from the left rail to the top of the right stack** as the Context card; gains the "All · whole network" variant.
- Left rail (`#leftcol`) — becomes the single view tool (dossier removed from it).
- New **View-default** cards, one per view (`hyper`/`geo`/`ledger` + placeholders), with the expanded ↔ collapsed-strip behaviour.
- Detail cards (`SnapshotCard`, `GeoLiveCard`) — gain breadcrumb eyebrows + `×` dismiss + the identity-thread attachment.

## Open / follow-ups

- Implementation plan (writing-plans).
- Deferred: reorder / collapse of children when the stack gets tall; the exact eligible detail kinds per view (as more clickables are added).
- Reconcile the thread/breadcrumb + view-default tokens into the Instrument-Glass token pass.
