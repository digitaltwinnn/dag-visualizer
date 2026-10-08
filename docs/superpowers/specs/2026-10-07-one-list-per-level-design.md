# One list per level — design

2026-10-07 · branch `design/ui-ux-tuning-3`

## Goal

Every level of a view's ladder (countries, providers, a global snapshot's networks, …) is defined
ONCE: which subjects it holds and in what order. The explorer lists that list, the next ghost opens
its first item, and the card's ‹ › pager steps through it. Today the rail builds its own copy
(`components/railSiblings.ts`), and four of them have drifted from the explorer.

Follows the same-day rule "the explorer shows the open card's children" (`components/explorer/boxLevel.ts`):
that rule says WHICH level is on screen; this one says what a level CONTAINS.

## Decisions (user, 2026-10-07)

1. **The explorer's list is the one list.** The ghost and the pager follow it, including the figure
   picked in the explorer's heading (countries by Fees → › steps the next country by fees).
2. **Time-ordered levels keep the pager's direction**: the explorer lists newest first, the pager
   steps oldest → newest (› = forward in time, 2026-09-01). That is the same list reversed, stated
   as an explicit projection, never a second ordering.
3. **Whenever the Snapshots path opens a global snapshot, the tick list turns to the page holding
   it** (today only a metagraph-snapshot pin turns the page).

## Divergences this removes

| Level | Explorer | Ghost / pager today | After |
|---|---|---|---|
| Geo countries | by picked figure | node count | picked figure |
| Hyper networks (Metagraph card pager) | by picked figure | filter strip's located order | picked figure |
| A global snapshot's networks | polled + exact rows, count desc, unlisted last | exact rows only, count desc, unlisted by count | the explorer's |
| A network's snapshots in a global snapshot | newest first | ghost: raw read order; pager: oldest → newest | ghost: newest first; pager: same list reversed |

Providers, provider nodes, compositions, composition nodes and validators match today only because
they are copied; after, they are shared.

## Shape

### `src/data/ladderLevels.ts` (new, pure)

One function per level, returning ordered SUBJECTS (plain data, no row specs, no actions):

| Function | Level | Order |
|---|---|---|
| `countriesLevel` | geo: countries under the network | picked geo figure, node count tiebreak |
| `cohortsLevel` | geo: a country's providers | node count, then city |
| `cohortNodesLevel` | geo: a provider's nodes | city (label fallback), then id |
| `networksLevel` | hyper: the networks | picked hyper figure, fleet size tiebreak |
| `compositionsLevel` | hyper: a network's compositions | `compositionGroups` (size desc) |
| `compositionNodesLevel` | hyper: a composition's nodes | the group's own row order |
| `tickNetworksLevel` | ledger: networks in a global snapshot | polled + exact union, count desc, name; unlisted last |
| `tickSnapshotsLevel` | ledger: one network's snapshots in it | newest first |
| validators | ledger: a metagraph snapshot's signers | `snapshotSignerRows` (already shared, unchanged) |

The grouping helpers that live inline today move here with them (`cohortsOf`, the node sort,
`groupByMeta` / `unionRows` from `LedgerPanel`, `machineRows`). Inputs are plain values the callers
already hold: the selection, `selNodes`, the leaderboard countries, `metaList`, the exact read, the
polled anchor rows, and the picked figure. Rule 4 applies: every export is referenced by
`ladderLevels.test.ts`.

### Explorers

`GeoExplore`, `HyperExplore` and `LedgerPanel` call the level functions and keep only the mapping
from subject to `ExplorerRowSpec` (glyph, bar, figure, on, click). No sorting or grouping stays in
a component.

### `railSiblings` + `useSiblingState`

- `SiblingState` gains the two picked figures that ORDER a level (`geoMeasure`, `hyperMeasure`) and,
  for the ledger, the shown tick's networks (`tickNets`, built from that tick's polled rows —
  `tickPolledRows`, the same input the explorer uses — and its exact read); `useSiblingState`
  builds them only for the cards whose steps read them (Global snapshot, Metagraph, Metagraph
  snapshot). `ledgerMeasure` is deliberately NOT in it: the Snapshots explorer shows that figure
  on its rows but never orders a level by it (networks by count, snapshots newest first).
- `CHILD_OF[…].steps` and `siblingSet` build their items from the level functions. The copied
  `cohortsOf`, `nodeSort`, `machineRows`, `tickNetworks` and per-case sorts are deleted.
- **Two explicit projections**, each named and commented where it is applied:
  - *time levels step oldest → newest* — the pager reverses `tickSnapshotsLevel` (and keeps the
    global window's oldest → newest, unchanged);
  - *the node pager steps MACHINES* — a node that runs two layers is two explorer rows (one per
    layer, as today) but one pager stop, deduped by the hover key as today.
- The pager's builders (`countryItem`, `nodeItem`, …) and their `pickActions` calls are unchanged.

### Snapshots paging

`LedgerPanel`'s page turn on a path change generalises from "a metagraph snapshot's tick" to "any
newly opened tick": when the synced path's `tick` changes to a tick on another page, `tickPage`
turns to that page. The freeze-while-pinned head and `useFitRows` paging are untouched.

## Behaviour that changes for the user

1. Countries / networks: ghost and › follow the picked figure.
2. Hyper's Metagraph card pager steps the explorer's network order.
3. Snapshots' Metagraph card pager steps the networks the explorer lists in that global snapshot.
4. The Metagraph snapshot ghost opens the explorer's top (newest) snapshot.
5. Stepping to a global snapshot on another page, then going back up via the ⌂ crumb, shows the
   page holding it.

Nothing else may change: same rows, same labels, same actions.

## Testing

- `src/data/ladderLevels.test.ts`: each level's membership and order, including the figure-driven
  orders and the unlisted-last rule.
- **The one-list test** (in `components/railSiblings.test.ts`): for every `CHILD_OF` entry, given a
  state, `childStep(…)` is the first item of that level's function, and a `siblingSet` holds the
  level's items in the level's order (or its declared projection). A future copy cannot drift
  silently.
- Existing `railSiblings` tests updated where they pinned the old orders (count-desc countries, the
  located network order).
- Live: each view — pick a non-default figure, check the ghost opens the explorer's top row and ›
  steps the explorer's next row; Snapshots — step ‹ across a page boundary and come back up via ⌂.

## Out of scope

The filter strip's own order; the explorer's paging and freeze rules; any row content.
