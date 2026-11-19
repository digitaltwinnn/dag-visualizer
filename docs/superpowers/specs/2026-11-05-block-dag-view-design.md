# The Blocks register of the Snapshots view

## Why

The app shows four projections of the network: who (Hypergraph), where (Geography), when (Snapshots)
and how it changed (History). None shows the structure the network is named for. Constellation's
snapshots are chains, one parent each; the directed acyclic graph is one tier down, in the DAG L1
blocks that carry transfers, and in each currency metagraph's token blocks. Nothing in the app draws
it, and nothing public does either.

Measured on mainnet, 3–5 November 2026 (298 DAG blocks over two days read from 290 global
snapshots; 35 DOR, 40 USDC.dag and 28 Upsider token blocks read from their own snapshots):

- Every DAG block held exactly one transfer; a token block sometimes holds several. Blocks arrive in
  bursts: nine in four minutes, then nothing for two hours.
- A block names two parent blocks, by height and hash, picked from the open tips. A tip retires once
  two blocks have built on it, or when the network drops it for age.
- About ten tips are open at any moment, and the oldest of them can wait hours for a second child.
- The DAG's height rose five times in twelve hours. Between rises the snapshot chain kept ticking:
  the sub-height, the count of snapshots since the height last moved, reached 2,650 (7.5 hours).
- About 96% of global snapshots hold no block anywhere, their own or inside an anchored metagraph
  snapshot.

So the blocks and the snapshots are two clocks. The snapshot chain ticks every ~10 seconds whatever
happens. The block DAG moves only when someone moves value. The Snapshots view already draws the
first clock; this register adds the second to the same chamber.

## Where a block sits

A DAG block is accepted straight into a global snapshot. A token block is accepted into its
metagraph's own snapshot, which is then anchored into a global. A global never lists token blocks;
it carries the metagraph snapshot as bytes. So the chamber already holds every surface a block
stands on:

```
plane (DOR)   [tile][tile][tile ■ block][tile] …   a token block ON the snapshot that accepted it
                   ╲  ╲  ╲ ribbon  ╲
floor (global) ▬▬▬▬▬▬■▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬■▬▬▬▬▬▬     a DAG block ON the tick that accepted it
```

The DAG has no plane of its own, because its "metagraph snapshot" is the global snapshot: the DAG
is a metagraph-shaped core whose chain is the global chain (one node model). The anchoring between
a tile and the floor is already drawn by the ribbons; a block sits on each end of it.

## What the visitor gets

1. The Snapshots view gains a second **register**, **Blocks**, beside its own: a "Snapshots |
   Blocks" control in the explorer card's control band, where History's measure tiles sit. The
   view switch stays at four.
2. In the Blocks register the chamber is the same chamber (floor, planes, labels, ordinal column,
   live edge, trays, byte bars, ribbons, the camera pose), with two changes:
   - **One tier on top.** A block stands on the snapshot that accepted it: a token block on its
     metagraph snapshot's tile, a DAG block on the global tick. Links run block to block, across
     tiles on a plane and across ticks on the floor, each block tied to its two parents. Across a
     plane's width, each height takes the next lane, so parents and children sit in different lanes
     and the links cross as a braid rather than running along the trail. The open tips are lit and
     breathe; a retired block reads quiet. Older blocks the window reaches back to, but does not
     hold, are drawn as outlines at the trail's far end.
   - **A longer trail.** The trail's ticks are the globals that hold a block anywhere, their own or
     inside an anchored snapshot. A silent run between two such ticks is one quiet stretch stating
     its length ("1,364 snapshots · 3.9 h"), never one slot per tick and never nothing. A tick still
     carries every snapshot it anchored as tiles, so a tick that anchored 13 DOR snapshots shows 13
     tiles with the block on the one that carries it. The live edge is the silent stretch growing at
     the front.
3. A new block arrives live: its tick takes the lead slot, its tiles with it, the block lands on
   its tile or tick, its two parent links draw, and the tips it built on update.
4. A block is a subject. Clicking one opens its card on the facts rail under the snapshot that
   accepted it: what it moved (amount, fee, from, to; several rows when a block holds several
   transfers), its height, the snapshot that accepted it, its two parents and how many blocks built
   on it, its signatures. The snapshot cards above it are the ones Snapshots already has.
5. The top-bar filter is the same lens: a token network leads with its plane and its braid, the
   others dim.
6. The explorer card lists the blocks on screen, newest first, each row its accepting snapshot and
   what it moved; under a filter, that network's blocks. A row commits the block.
7. RAW is the records: the transfer list behind the blocks, grouped by accepting global as the
   anchor log is.
8. The vitals band carries the register's own readings: blocks in the last hour, open tips, the
   current height, the sub-height.
9. `/blocks` is a deep link that opens Snapshots in the Blocks register, listed in the sitemap and
   the footer like the other routes. The Briefing gains a stop: the chamber flipping to Blocks, with
   its own Gate AI note.

## Rules

- **The register is a setting of the Snapshots view, not a Mode.** It is a store field written by
  its own setter, like History's measure, surviving a view switch away and back. `/blocks` seeds it
  through the URL bridge; switching the register updates the URL the way a view switch does, so
  analytics see it. Nothing compares `mode === …` or `register === …` outside the policy and the
  chamber's own cargo dispatch; the places that differ by register answer through one keyed map,
  never a fall-through.
- **Tips are read, never inferred.** Each global and metagraph snapshot carries its own `tips`
  (active with usage counts, and deprecated). The frontier shown is that list. A mock that inferred
  retirement from two children over-counted open tips by half, because the network also retires by
  age.
- **A block stands on the snapshot that accepted it, and only there.** A block's parents are
  blocks, not snapshots; the links go block to block. A block is in exactly one snapshot.
- **Words:** a block is **accepted** into a snapshot; a metagraph snapshot is **anchored** into a
  global (Snapshots' word). **Height** and **sub-height** are the protocol's words and stay. An
  **open tip** is a block that can still be built on.
- **Silence is shown as silence**, and a tick is on the trail only because a block is in it. The
  byte bars, tiles and ribbons on those ticks keep their Snapshots meaning.
- **Honesty (rule 10):** no block is drawn from a read that failed; the tick stays, with the
  chamber's failed-read state. The frontier is as old as the snapshot it came from. A network with
  no currency layer has no token blocks and its plane shows tiles alone. A data block (DED's, DOR's)
  has no parents and is not a DAG block; it is not drawn.
- **The camera holds the chamber's one pose** (camera principle 2), with the same nudge on a
  same-pose commit. No per-block framing.
- **The selection goes through the one write path** (rule 2): a block click is a `pickActions`
  entry applied by the executor; the block rung sits under the snapshot rungs in the ledger's ladder
  and exists only in the Blocks register; the block card is a rail slot; hover pairs through a
  channel for the hovered block (convention 9), lighting its block, its explorer row and its RAW row.
- **The render loop allocates nothing per frame** (rule 5). Blocks are one instanced mesh, the
  links one line geometry rewritten at event time, like the chamber's tiles and ribbons.

## Data

Everything needed is public and already reachable from the app's server, and most of it already
flows through the live feed.

- **Which snapshots hold blocks, and the blocks' hashes:** the explorer's snapshot records, which
  the live feed already carries for every global and every anchored metagraph snapshot, list
  `blocks` as an array of block hashes (verified: global 7,241,523 lists one, DOR 29,649,865 lists
  one, an empty one lists `[]`). So a block's arrival is detected from the feed the app already
  polls, with no extra read, and a block's hash needs no join through a transfer list. Today the
  feed keeps only the count (`src/data/api.ts` records `blocks.length`); the register keeps the
  hashes.
- **A block's parents, transactions and signatures, and a chain's tips:** the full snapshot by
  ordinal. For a global, the read the app already makes server-side, cached immutably
  (`app/api/snapshot/fetchGlobal.ts`, with the archival-node fallback: the load balancer serves
  roughly the newest 29 hours, and an archival L0 node served the rest for the mock). For a
  metagraph, its own L0's `/snapshots/<ordinal>` (plain HTTP, no CORS: a server route like the
  existing metagraph routes). Only block-bearing snapshots are read, which the feed names.
- **The trail's older ticks**, beyond what the live buffers hold: the explorer's transfer lists
  (`/transactions`, `/currency/<id>/transactions`, newest first, cursor-paged), each row naming the
  accepting snapshot and, for a token, the global that anchored it (`globalSnapshotOrdinal`). The
  union across the DAG and every listed currency, newest first, is the block window.
- **The join** of a child's parent reference (height + hash) to a drawn block is by hash; it was
  verified by hand for the mock (every parent reference resolved).
- **What the full read is for, and when it happens.** A block is drawn on its tick from the feed
  at once: its hash, its tick, its tile. The full snapshot read is needed only for its two parents
  (the links), its transactions and signatures (the card), so it is made per TICK IN THE TRAIL
  WINDOW, paced as the chamber already paces its exact reads (a bounded backfill over the lead
  ticks, then one per new block tick), newest first, and cached forever since a snapshot is
  immutable. A block whose read has not landed has no links yet, never invented ones; they draw
  when it lands, the way a seed rises into its bands. Rewinding further back reads as you go, and
  nothing is read for ticks outside the window. Measured: a global is ~150 KB, a metagraph snapshot
  8–13 KB, so a 52-tick trail is ~8 MB once and a token chain's reads are an order of magnitude
  smaller.
- **Cost:** one transfer-list page per currency to extend the trail back, one full read per tick in
  the window as above, one small read per chain for its frontier. Nothing per tick beyond the feed.

## Non-goals

- Not a fifth view. No height stacking. No third tier for transactions (they are on the block's
  card). No data blocks. No address chains (a transfer also names the sender's previous transfer;
  a different structure).
- No paging of the trail further back than it holds in this version; an old pin stays Snapshots'
  past window, in the Snapshots register.
- No new chart. The band's readings are numbers and the existing sparkline.

## Decisions the author made (check these while reading)

- **The trail is a third ledger source, not a new slot model.** The chamber reads one source
  (`ledgerSource()`: the live buffer, or a past window around an old pin). The Blocks register adds
  the **block window**: the block-bearing ticks newest first, each with its anchored snapshots, and
  the silent stretch between neighbours stated as a length. The slot model, the rewind, the front
  and horizon boundaries and every row-riding instrument are unchanged; they see fewer ticks,
  further apart in time. The silent stretch is one new mark between two slots.
- **The block window follows the pin, in its own register.** `pastWanted` is register-aware: in
  Blocks a pin on a trail tick needs no past window (the block window already holds it), and a pin
  outside the window re-centres the block window around it, as the past window does around a
  Snapshots pin. An old pin arriving from elsewhere (a notable row, a door) opens in whichever
  register is set; the register never flips by itself.
- **A live token block arrives through the feed.** The feed's record of an anchored metagraph
  snapshot lists its block hashes; a non-empty list makes that tick a block tick, puts the block on
  its tile at once, and triggers the one full read for its parents. Same for a global's own blocks.
- **The frontier comes from each chain's newest snapshot.** For the DAG that is the live tick's
  exact read, which the chamber already makes every tick. For a token chain it is one small read of
  its newest L0 snapshot at the band's own cadence (the builder sets it; once a minute is enough),
  and the band states the age of the reading. Never the last block-bearing snapshot's tips, which
  can be hours old and list tips the network has since retired.
- **The filter is a lens on the trail, as in Snapshots.** The trail stays the union of every
  chain's block ticks; the other chains dim. The held front under a filter is the network's newest
  **block** tick (a tick that anchored its snapshot but holds none of its blocks is on the trail
  only if another chain put it there). The explorer lists that network's blocks.
- **The register control sits in the control band above the measure tiles**, and the measure set
  is keyed by register: Snapshots keeps fee · anchors · metagraphs · size; Blocks offers amount ·
  fee · height. Exact form is the design session's.
- **Unlisted currencies are a stated floor in this version.** The block window reads the DAG and
  the listed currencies; an unlisted chain's token blocks are not read, its lane shows tiles alone,
  and the explorer's hint says so. Reading them is a later step, the same shape as the sampler's.
- **The block tier is the chamber's, not a sibling view.** `LedgerView` gains the blocks (an
  instanced mesh standing on tile and tick positions it already computes) and the links, behind
  the policy's register dispatch. The braid's lane arithmetic lives in a pure module
  (`domain/blockBraid.ts`: lane by height, link endpoints, tip state from a snapshot's `tips`) with
  a colocated test.
- **The register's few differences are one keyed map each**: what a plane's cargo is, what the
  explorer lists and measures, what the band holds, what RAW shows. A new register is a compile
  error, never a silent fall-through.
- **A snapshot click is the app's one global-snapshot selection** (`snapOrd`, the same card, the
  same follow and rewind), in either register.

## Left to the design session (on the live app) and to the builder

Design session:
- The look of a silent stretch and how its length is written.
- The block mark on a tile and on a tick, the open-tip emphasis, the retired tier, the links'
  weight, and whether a block's anchor to its tile needs a mark of its own when it sits right on it.
- The register control's exact form in the control band.
- The block card's rows in the six-slot grammar; the band's four cells in `BandCard`'s grammar.

Builder:
- The route for "a metagraph snapshot's blocks and tips" and its caching (immutable per ordinal).
- How many ticks the block window holds, and how the frontier's older tips are placed when they fall
  behind the trail's first slot.
- The frontier read's cadence for token chains.
- The `pickActions` entries, the ladder row, the rail slot and ghost hint, the hover channel's name,
  the URL bridge for the register, the Briefing stop and its note's facts.
