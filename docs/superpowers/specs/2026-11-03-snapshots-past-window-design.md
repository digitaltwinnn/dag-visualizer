# Snapshots: going back in time for an old pin — design

2026-11-03. The user: pinning a snapshot older than the live window (a notable row's longest gap,
the raw log's search) "should stop the animation in the scene and also set up the explorer for that
range the old snapshot is in"; of three options, **"Go back in time"**: the chamber rebuilds for the
pin's own window, frozen, and the explorer shows the same window.

## Why it does not work today

The Snapshots view reads ONE dataset, the live buffer in `NetworkData` (`src/data/api.ts`): the
52 newest global snapshots, each chain's newest metagraph records, and the anchor index folded from
them. A pin inside that window already works: the chamber's rewind brings the pinned row to the
front, the explorer freezes its head on it and counts what is newer. A pin older than the window
has no row in either, so `heldTicks` lets go and `LedgerView` finds no slot, and both stay live.

## The design: one ledger SOURCE, live or past

Every Snapshots surface that reads the live buffer reads a **ledger source** instead: the live
buffer normally, and a frozen **past window** around the pin when the pin is older than the live
window. The past window answers the same questions in the same shapes — global snapshots
oldest→newest, metagraph records per chain, `getAnchor(ts)` — so a pin inside it behaves exactly as
an in-window pin does today, with no new chamber or explorer behaviour to learn.

**The window**: the 41 global snapshots before the pin, the pin, and up to 10 after it (52, the live
buffer's own size), so the rewind lands the pin at the front with context behind it, and the global
card's ‹ › step both ways inside it. Every listed chain's metagraph records anchored in its span.
Unlisted chains are not read: the unlisted lane takes its count from each tick's exact read, as the
chamber already prefers (`LedgerView.setData`'s wrapper).

**When**: in the Snapshots view, while pinned (`!following`) on a snapshot older than the live
buffer's oldest. A pin the current past window holds (the pager stepping inside it) keeps it; a pin
outside it fetches another; following live again, leaving the view or a pin back inside the live
buffer releases it. Pure decision: `pastWanted` in `src/data/pastWindow.ts`.

**State**: the window's data lives in a module singleton beside `NetworkData` (it is the same kind
of thing: fetched buffers, too large for the store); the store carries only
`pastWindow: { from, to, status: "loading" | "ready" | "failed" } | null`, so the Engine (the one
store bridge) and the React surfaces react to it. `components/PastWindowBridge.tsx` is the one
writer, as `RawSnapshotBridge` is for exact reads.

## Surfaces

- **Chamber** (`Engine._refreshLedger`, the tile resolver): read the source. A source switch resets
  the model's history (`LedgerView.resetHistory`, a fresh `LedgerModel`, which has no reset of its
  own and only ever advances) and re-applies the pin, so the rewind lands it. While past, the chamber
  is **frozen**: the live edge stands down (`running = false`), since "now" is not on screen, and
  the live feed's events change nothing (the source is fixed).
- **Explorer** (`components/LedgerPanel.tsx`): the tick list, the networks under a tick and the
  anchor counts read the source; the existing hold freezes the head on the pin; the "newer" row counts
  the window's ticks above the pin plus every live tick since the window's newest (ordinals are
  gapless, so the count is exact) and still resumes live on a click. The foot states the window's
  own time span rather than "last N min".
- **Global card pager** (`railSiblings`, `useSiblingState`): steps the source's ticks.
- **Loading / failure**: while the window loads the surfaces keep what they show and the explorer
  says it is reading; a failed read leaves today's behaviour (live), and says so.

## Server route

`GET /api/ledger/window?ordinal=N&net=` → `{ globals: GlobalSnapshot[], chains: Record<id, RawMetaSnapshot[]> }`.

- Globals: the explorer's list with a crafted cursor at the window's newest ordinal (one read;
  `{created_at, ordinal: hex}`, inclusive), falling back to per-ordinal reads below the list's
  2025-05-20 floor.
- Each catalog chain: its newest record at or before the window's last timestamp
  (`ordinalAtOrAfter` from `app/api/notes/snapshotAt.ts`, exported), then the list from there with
  a crafted `{hash}` cursor until a record is older than the window's first timestamp. A chain with
  nothing in the span is left out.
- An old window never changes: cached a year at the edge once its newest global is an hour old,
  a minute before that.

## Rules kept

Position is time (the rewind stays the trail's one motion); no exact read means no bands; a tile is
pickable only where the source can name it; one selection write path (the pin is still the store's
`snap`, written through the executor — nothing here writes a selection); the timestamp join's
exceptions (`src/data/CLAUDE.md`) are the same as live, since the records are the same records.

## Builder's calls

The window size (41 + 1 + 10), the loading copy, the cache ages and the per-chain page size.
