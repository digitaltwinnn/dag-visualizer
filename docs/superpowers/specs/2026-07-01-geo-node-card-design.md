# Geo node detail card — design

**Date:** 2026-07-01
**Scope:** The selected-node (validator) Detail card, mainly in the geo view — a right-rail Detail child in the subject stack. Completes the detail-card set (dossier · snapshot · node).

## Structure

- **Eyebrow:** `Node · <TICKER>` — the node's metagraph, ticker in the metagraph hue. `×` dismisses.
- **Title line:** the **node id** (short id, e.g. `node-7f3a`) + the **status inline** on the right.
- **IP subtitle:** the node's IP directly under the id (muted) — grouped as **identity**, not a stray value among the labelled rows.
- **Divider**, then labelled rows:
  - **Composition** — the layers this node runs, in the **same vocabulary as the dossier's node composition**: plain role bright + codes muted (`Hybrid L0·dL1` / `Data dL1` / `Consensus L0`). (Renamed from "Role".)
  - **Location** — city + country flag.
- **No headline number** — a node's key read is its **state**, which leads on the title line.

Data honesty: only what the node data actually has — **id / ip / state / roles / geo**. No fabricated uptime/version.

## Status system (shared rule)

Single-status displays (this card, and anywhere one status shows):
- **Ready** → **plain green text** (the calm, healthy default — most nodes; no need to emphasise "all's well").
- **Any non-ready state → a pill** ("attention"), severity by colour: **waiting** = **muted pill** (transitional — *no amber*, that's SWAP's identity), **offline** = **red pill** (error).

The dossier's node-composition **breakdown** (many nodes) uses **dots + counts** (`20 ready · 2 waiting · 4 offline`) — a different form for an aggregate, but the same **green / muted / red** colour language.

## Error never breaks the identity frame

An offline/error node keeps its **metagraph-hue** card border + thread (like every card in the subject stack), so the stack stays cohesive. The error is signalled by the **status pill only** — a red card border was rejected as an outlier that breaks the shared identity-hue family.

## Identity & tie-in

The thread + the (implicit) node marker are the **metagraph hue**, matching how the node **glows on the globe**; hovering the card ↔ the globe node synced-glows (`2026-07-01-hud-scene-tiein-design.md`). Clicking a node sets the filter to its metagraph (the thread re-tints), consistent with the rest of the HUD.

## Affected components

- `components/inspector/cards.tsx` — the `geoLive` card (`GeoLiveNode` / `GeoLiveCard`), reading `store.inspect`: eyebrow + id/status/IP identity block, **Composition** row (shared layer vocabulary), Location.
- Reuses the shared status treatment (text / pill) and the composition-label helper.

## Open / follow-ups

- Implementation plan (writing-plans).
- If the cluster endpoints expose more per-node facts (version, session) later, add them — only when genuinely available.
