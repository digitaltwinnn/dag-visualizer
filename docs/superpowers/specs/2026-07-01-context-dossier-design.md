# Context dossier (metagraph card) — design

**Date:** 2026-07-01
**Scope:** The content + layout of the **Context card** — the metagraph/core identity dossier that sits at the top of the right-rail subject stack (`2026-07-01-right-rail-subject-stack-design.md`). Instrument-Glass; two-lane colour.

## Sections (top → bottom)

1. **Header — identity.** A **logo avatar** (rounded-square tile, ~38px) ringed + softly glowing in the metagraph's **identity hue** (the hue derived *from* that logo by the generator), with **name** + **ticker** beside it. The **`×`** clears the filter (this card mirrors the filter; it's the only non-dismissible stack member).
   - **Logo source:** the metagraph's `iconUrl` (already fetched in `/api/metagraphs`). Standard **nominative use** — identifying the project, no endorsement implied. `<img>` display needs no CORS.
   - **Fallback:** no icon → a **monogram** (ticker initial) in a hue-tinted tile of the same shape, so the header is consistent either way.
2. **Description.** One/two-line "what it is", clamped, muted.
3. **Node composition** (see below).
4. **Token.** The token symbol if the metagraph runs a currency-L1, else **"data metagraph · no token"**.
5. **Site.** The project link, in the identity hue.

## Node composition (the detailed part)

Renamed from "node fabric". **Numeric + purposeful; fully factual.**

- **Title** `Node composition` with the **total** machine count as the **headline number** (biggest, brightest). The per-type counts are a *breakdown of it*, so they render **smaller + muted** (hierarchy: total leads, subs support).
- **One row per machine group**, each = **plain role (bright) + layer code(s) (muted, inline)** — no tooltip (touch-friendly, and the codes are the factual detail):
  - `Hybrid  L0·dL1` — a hybrid runs several layers; **the codes show which**, so different hybrid make-ups (`L0·dL1` vs `L0·cL1·dL1`) read differently and factually. (Two distinct hybrid make-ups → two Hybrid rows.)
  - `Data  dL1` · `Currency  cL1` · `Consensus  L0` — dedicated single-layer machines, named by that layer's role.
  - Rows **sum to the total**; show only the groups that exist.
- **Chips** = a stack of uniform node-dots per row, **visual scale only** (echoing the 3D nodes): capped at ~10, **no `+N`** — the **count on the right is authoritative** (so it's factual and never sprawls, at any N). No hybrid/dedicated styling on the chips themselves (the 3D view doesn't distinguish node types visually — it's a data attribute; the *row* carries the type).
- **Status** — one line, **text + one dot per bucket**, using the shared node status buckets (see `2026-07-01-geo-node-card-design.md`): **in consensus = green**, **in progress = amber**, **down = red** (+ muted unknown). All-ready collapses to a single green `all ready`; otherwise it lists only the non-zero buckets (`28 ready · 3 in progress · 2 down`).

### Layer glossary (plain ↔ code)
- **Consensus** = `L0` — the backbone; produces the metagraph's snapshots.
- **Currency** = `cL1` — token transactions (wallet transfers); present only if the metagraph has a token.
- **Data** = `dL1` — data updates posted by external sources.
- **Hybrid** — one machine running several of the above.

## Behaviour & variants

- **Variable height is fine** — a dossier is a content card; it sizes to its metagraph (usually 1–2 composition rows). **Ease the card height** on metagraph switch so it doesn't jump. Do **not** pad to a fixed height with empty rows (re-adds clutter).
- **DAG core ($DAG)** reuses this same card — **core-cyan** ring, its own L0/cL1 composition, `isRoot`.
- **"All" (no filter)** → a compact **whole-network** variant (metagraph count + total nodes) in the Context slot.

## Lane discipline

Identity hue only on the **avatar ring / ticker / site link** (identity = "which network"). The **composition data is neutral chrome**; **status uses structural semantic** colours. Chips are neutral.

## Affected components

- `components/ContextPanel.tsx` / `MetaCard` (`components/inspector/cards.tsx`) — becomes the right-rail Context card: add the logo-avatar header (+ monogram fallback), the renamed **Node composition** block (headline total, role+code rows, chip stacks, status line), token, site.
- `app/api/metagraphs/route.ts` — already provides `iconUrl` + node role data; ensure per-node **state** (Ready/waiting/offline) and each machine's **layer set** are available for the composition + status.
- Reuses the generated **identity hue** (by `id`) for the ring/ticker/site.

## Open / follow-ups

- Implementation plan (writing-plans).
- Confirm the raw data exposes each machine's exact layer-set (for the hybrid codes) and per-node state.
