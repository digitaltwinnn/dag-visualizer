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

The Constellation node lifecycle has ~9 real states (`Ready`, `Observing`, `WaitingForObserving`, `WaitingForReady`, `WaitingForDownload`, `DownloadInProgress`, `StartingSession`, `SessionStarted`, `Leaving`, `Offline`, …). The current code colours them with **6 hues** (cyan/amber/orange/purple + green/red) — which collides with the accent / core / identity lanes. **Consolidate to: colour = the bucket, text = the exact state.**

**Three semantic buckets (+ unknown):**
- **In consensus** → **green** · `Ready`.
- **In progress** → **amber** · the exact state as the label (`observing` / `waiting` / `syncing` / `joining`) — covers Observing / WaitingForObserving / WaitingForReady / WaitingForDownload / DownloadInProgress / StartingSession / SessionStarted.
- **Down** → **red** · `offline` / `leaving`.
- **Unknown** → **muted** · any unrecognised state.

So the **colour** is the bucket (three lane-clean hues) and the **text** is the precise lifecycle stage — nothing lost, fully factual, no status rainbow.

**Single status** (this card, GeoExplore rows): Ready = **plain green text**; any non-ready = a **pill** in its bucket colour (amber / red / muted), labelled with the exact state.
**Breakdown** (dossier composition): the buckets rolled into counts + colour dots — `28 ready · 3 in progress · 2 down`.

Amber joins the **reserved structural bands** in the identity generator (see that spec), so no metagraph resolves to amber.

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
