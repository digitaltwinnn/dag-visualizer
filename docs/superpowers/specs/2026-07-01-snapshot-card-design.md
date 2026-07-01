# Snapshot detail card — design

**Date:** 2026-07-01
**Scope:** The global-L0 snapshot Detail card (ledger view), end-to-end, in the settled language. A right-rail Detail child (thread-attached) per `2026-07-01-right-rail-subject-stack-design.md`.

## Structure (top → bottom)

- **Eyebrow:** `Snapshot` (constant) + `· <TICKER>` breadcrumb when filtered (in the metagraph hue). No "live" here — the state line carries that (avoids the old double-"live").
- **Title:** `◆ <ordinal>`. The **◆ is a type-marker** (cyan = a *global* snapshot; a future metagraph snapshot shows that metagraph's mini-logo) — replaces the "Global L0" text. The **ordinal odometer-rolls** each tick when following live.
- **State line:** `● live now` (pulsing cyan) for the live tick, or `◷ 2m ago` (relative recency) for an older pick.
- **Anchored block** (see below).
- **Settlement block** (see below).

Dropped from the old card: the `Global L0` text, `height · sub-height` (rarely meaningful), and the wrapping colour-pill wall.

## Anchored block

- **Header names the units:** `Snapshots anchored / from 12 metagraphs` + the **total** as the neutral headline number — reads as *"138 snapshots anchored from 12 metagraphs"* (metagraph **snapshots** = 138, distinct **metagraphs** = 12, never conflated).
- **Ranked breakdown:** one aligned row per metagraph — `dot · ticker · share-bar · count` — **sorted desc**, **all of them (no cap; facts)**, `unlisted` as a neutral row. **Bars = share of the total** (of 138), so bar length ⇔ the share % everywhere.

### Filtered → pinned focus row
When a metagraph is filtered, it gets a **focus row pinned at the top** (regardless of rank, so a small anchorer is never buried):
- Line 1: `dot · name` (left) · `<fee> DAG` + `fees paid` stacked (right).
- Line 2: a **full-width share bar** (spans the section like the list rows; bright fill with a min nub so a tiny share is still visible) + `N snapshots · X%`.
- Hue-filled background + accent bar mark it as the focus (no logo — it's already on the dossier above; a hue dot is enough).
- The rest list under **"Other metagraphs"**, dimmed. The thread / dot / eyebrow / card border re-tint to the metagraph's hue. **Totals stay unchanged** (the filter is a lens, not a different snapshot).

## Settlement block

- **Fees paid** — the total fee (DAG), with **`312 KB settled`** tucked as a sub-note beneath (paired but **independent** facts — size is measured, never derived from the fee).
- **Rewards out** — the $DAG the snapshot distributes.
- The two **DAG figures align** in one right column (units align); the KB is the "extra" and doesn't break that column.

## Number-colour rule (applies to every card)

- **Data numbers = neutral** — headline bright white + bold + sized-up (the *size* carries emphasis, not colour); secondary = muted grey. Matches the node-composition total + vitals.
- **Cyan = live / accent only** — the `◆` mark, the `live now` dot, links, selection. Never a plain data value.
- **Identity hue** — only per-metagraph dots / bars / thread / ticker. Fees/rewards stay neutral (not green/gold).

## States (folded in)

- **ACQUIRING** — while the exact read loads, the breakdown + fee show the constellation shimmer (`2026-07-01-empty-loading-states-design.md`).
- **Roll** — the ordinal rolls when following live (`2026-07-01-panel-data-updates-design.md`).
- **Tie-in** — hovering the card ↔ its ledger block synced-glows (`2026-07-01-hud-scene-tiein-design.md`).

## API additions (`/api/snapshot/[ordinal]`)

`SnapshotExact` already has: `anchored`, **`channels`** (distinct metagraphs — the "from N metagraphs"), `totalFee`, `totalSizeKB`, `perMeta[id].{count, fee}` (the **fee share** for the focus row), listed/unlisted splits. **To add:** parse **rewards** from the raw snapshot (`value.rewards`) → `rewardsDag`.

## Affected components

- `components/inspector/cards.tsx` (`SnapshotCard`) — restructure to the above; neutral numbers; ◆ marker; state line; settlement (fees + KB sub-note + rewards).
- `components/inspector/AnchoredTags.tsx` — becomes the **ranked share-of-total breakdown** + the **filtered focus row** (name, full-width share bar, `N snapshots · %`, `fees paid`); reads `perMeta`.
- `app/api/snapshot/[ordinal]/route.ts` + `src/data/types.ts` — add `rewardsDag`.

## Open / follow-ups

- Implementation plan (writing-plans); verify the raw `value.rewards` shape + magnitude before showing.
- The metagraph-snapshot type-marker (logo) lands when metagraph snapshots become clickable.
