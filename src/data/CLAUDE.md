# src/data — working notes

The live feed: the snapshot stream and the anchoring/fee model.

Split out of the root `CLAUDE.md` (2026-08-31) so it loads when you work here rather
than on every session. The root file holds what this is, the eleven rules, run & test,
the architecture map and the dev workflow; **its rules govern this file too**.

## The snapshot stream

Global L0 produces a snapshot roughly every **28 seconds** — measured live, mean 28.1s over a full
window, range 4.6–114.8, so the cadence is irregular and a "few seconds" intuition will mislead any
timing you build on it (the tick chart's window, a hold, a settle gate). Three counters, which the UI
keeps separate on purpose:

- **`ordinal`** — sequence number, +1 every snapshot even when empty.
- **`height`** — depth of the *block DAG*. It only rises when blocks actually deepen it, and because
  it's a DAG with parallel siblings, a snapshot can carry blocks **without** raising height. Idle
  snapshots keep it flat for long stretches. Real mainnet behaviour, not a bug.
- **`subHeight`** — orders snapshots sharing a height.

**A global snapshot's real work is settlement, not blocks.** Most carry zero (mainnet: ~1 in 50), so
block count is the wrong activity signal. The meaningful field is **`metagraphSnapshotCount`** — how
many metagraph snapshots this global anchored, typically 1–24 and sometimes 100+. So the strip bars
scale by anchors, and the snapshot card leads with the anchors, breaks them down by metagraph and
states the derived fee and the bytes anchored. **The card carries no height, sub-height or block
count at all** — a counter that answers no question the card raises, culled 2026-08-10 with the rest.

**The tick bar-chart** is the vitals band's ledger cell (`VitalsBand`'s `TickBars` — the LiveStrip's
successor, 2026-08-30, declicked per the plan). One bar per tick, height = anchors, last ~32 ticks.
Unfiltered, bars plot each tick's total in cyan. **Filtered, each bar plots that metagraph's own
anchors on its OWN scale in its identity hue** — its own cadence, with empty ticks as honest gaps. A
~1-anchor-per-tick metagraph reads sparse and 0-in-window reads blank; that honesty is the design.
**No interaction at all** — the strip's bar-click (pin) and hover cross-highlight died with the band's
`pointer-events-none`; the pin routes live on in the explorer rows and the global card's pager.

**The raw data layer's table** is the same per-view projection in table form, dispatching on `mode`.
The ledger one is a master–detail split: the anchor log on the left, the channel-state panel as the
always-present right pane. hyper and geo get the node roster with per-view column order; flat views get
the honest `preview · in development` line, never a fabricated table. **The layer opens on a subject**:
with nothing selected the ledger's log commits its own first row on mount, so the pane opens populated
instead of on an empty-state the user has to dismiss by guessing where to click; an existing selection is
never overridden.

That pane is the metagraph-snapshot card's **two-step disclosure** — the CARD states the SHAPE of the
application state, the pane renders the PAYLOAD one level down **on a second deliberate gesture, because
one anchoring channel publishes personal records.** Arriving here IS that gesture, so the pane reads its
own subject's payload on arrival (the surface gate, in `src/engine/scene/CLAUDE.md`). Its shape is
**ONE LANE AXIS** (2026-08-09): the
snapshot's facts stay pinned at the top, and the payload sits behind `STATE · DATA · SIGNERS` tabs whose
labels carry their own counts. **An empty lane gets no tab** — a tab that opens onto "nothing here" is
chrome pretending to be data — and the first available lane opens by default, so the pane is never
parked on a chooser.

⚠️ **An empty state must name a gesture available on ITS OWN surface.** The pane's read invitation said
"pin this snapshot", a gesture whose control lives in the HUD — which the raw layer has marked `inert`,
so the instruction was unfollowable from where it was read. It names the anchor-log row instead, which
is right there and commits the same selection.

Every lane renders the **same body grammar: note → shape table → collapsed `RAW JSON`.** The note is the
lane's one-line summary (bytes and proof for state, record and block counts for data), the table is the
shape (`src/data/payloadKinds.ts` is the data lane's shape read — kinds and counts, never a guess at
meaning), and the raw tree is the last tier, collapsed, its open state living on the PANE so switching
lanes doesn't smuggle a disclosure across. **SIGNERS gets no disclosure**: a signer list is already the
raw thing.

⚠️ **`table-fixed` on that shape table is load-bearing, not tidiness** (found live 2026-08-09): an
auto-layout table sizes to its content, so one long field list widened the table past the pane, pushed the
count column out of view and defeated the cell's own `truncate`.

## Anchoring, fees & the metagraph data layer

**Vocabulary rule:** in user-facing copy the Snapshots stack **anchors state** — "settlement" is
reserved for the DAG a snapshot actually pays. One word for both reads as if Snapshots were where
*money* settles, which is what the separate Transactions view is for. So: "Anchoring layers", "the base
ledger", "N KB anchored". Internal identifiers keep their existing names; the rule is about words the
user reads.

Verified live against mainnet:

- **Each metagraph snapshots independently and faster than Global L0.** The explorer stamps each
  metagraph snapshot with the timestamp of the global it anchored into, so the anchor join is
  `metagraph.timestamp === global.timestamp` — exact, 0 orphans observed.
- **Fees are the core economic model.** Every metagraph snapshot pays a fee in DAG, confirmed because
  data metagraphs with no token of their own still pay. ⚠️ **Treat the fee as an opaque reported value
  — do NOT derive size, or anything else, from it.** It correlates with size, but Constellation
  computes it with a non-trivial calculator and size is measured separately.
- **Count is exact, fee is a floor.** `metagraphSnapshotCount` is authoritative. The derived fee covers
  only the publicly listed metagraphs, so the summed fee is a lower bound, shown with `~` and a `FLOOR`
  tag that flips to `COMPLETE` when the tracked count reaches the total. "Listed" ≠ protocol
  registration — anchoring still requires being a recognised L0 state channel; these are just absent
  from the public catalog.
- **The genuinely-unlisted count is tiny (~0–4 per tick), so a high "unlisted" reading is a bug, not
  reality.** `metagraphSnapshotCount` counts *snapshots*, not metagraphs, and **one fast metagraph can
  batch dozens into a single tick** (verified: DOR 83 in one, DED 41 — both listed). The ground truth
  for *who* anchored is the raw L0 snapshot's `stateChannelSnapshots`, not the explorer, which only
  gives the count.

**An animation bridging an async gap is sized by the MEASURED latency, never a pleasing
constant** (2026-08-16). The tick-handoff grace was first given a 0.8s fade — shorter than the
~1.5-2s exact-read gap it exists to bridge — so it died into the same dead air it was built to
cover; the user's original glitch, wearing a new face. The grace now decays over 2.5s (≈ the
latency) and crossfades on arrival; the forming byte-bar block covers the same window from the
other side. When a beat covers a wait, measure the wait first.

### The tick lifecycle — why a breakdown *settles*

Read this before touching the ledger view. A metagraph snapshot is stamped with its anchoring global
timestamp **only as it anchors**, over the few seconds after the global tick appears. So a tick has a
lifecycle, and the polled breakdown lags it:

1. Global tick `T` appears. Its **total is correct and final immediately** — a field of the finalized
   snapshot.
2. Over the next seconds metagraphs keep getting stamped `T`, and the per-metagraph poll needs a cycle
   to fold them in. During this window a naive `unlisted = total − count` reads **transiently high**.
   That's the settling period, not real unlisted metagraphs.
3. Once no new snapshot has landed in `T` for the settle window, the remaining gap is the real floor.

**The snapshot card sidesteps all this with an exact read**, which is the primary source: the raw L0
snapshot's `stateChannelSnapshots` carry every anchored snapshot with its own fee and content, so the
exact fee, size, breakdown and record count are final the instant the snapshot exists. **The live card
never falls back to the polled floor** — while the exact read is in flight it shows a brief held
"reading…"; a FAILED read records `store.exactMiss` and the card terminates on an honest word (never
a hang — the acquiring give-up rule above).

Two mechanisms back the polled fallback, which is used for old ticks, the strip and activity rates
because exact reads are too heavy across many ticks:

- **Self-healing catch-up**: the poll grows its limit until the batch reaches back to the newest
  ordinal already held — provably no gap regardless of burst size. A fixed tail silently drops
  DOR-sized bursts and mislabels them "unlisted".
- **Polled floor**: what was identified; the gap is a lower bound, shown only on old ticks.

`api.ts` keeps rolling per-metagraph snapshot buffers plus an anchor index keyed by global timestamp,
carrying fee, count, the id set, **per-id counts** and a `touched` stamp for the settling gate. Per-id
counts exist because a single metagraph can anchor several snapshots into one tick — presence alone
isn't enough.

The snapshot card renders the breakdown as colour-coded pills with the authoritative total in parens,
from the exact read when available. It deliberately shows **no block count**, since blocks aren't the
activity signal here. (A snapshot's `content` is the serialized snapshot as a *byte array*, not a list
of records — don't surface its length as an update count.)

**A data metagraph's real payload rides in its blocks' `dataTransactions`, not necessarily in
`onChainState`** — verified live. DED anchors fingerprint batch commitments (a batch id and a Merkle
root) per snapshot while its on-chain state stays empty; the individual fingerprints live in DED's
backend and the chain holds the tamper-proof roots. So the decoder surfaces decoded transaction values
and the card shows "Data updates: N". This is structural, not per-network: probed across all anchoring
channels over 12 live ticks, zero undecodable entries and three distinct payload shapes all rendering
honestly through the same generic extraction.
