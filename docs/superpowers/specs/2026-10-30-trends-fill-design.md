# The trends fill: one walk that completes the store

Design, 2026-10-30, agreed with the user in chat. Decisions marked **(user)** are theirs; **(my
call)** are mine and open to correction. The subject is `scripts/rebuild-trends.ts`, the manual
tool that writes the measured history (`/api/trends`) from the explorer's own records.

## Intent

The script grew one mode per field that arrived after the history did: `--extend-to`,
`--recompute-from`, `--backfill-gaps` (with `--gaps-from-chain`), `--backfill-blocks`,
`--backfill-unlisted`, `--resume` and `--resume=force`, `--no-unlisted`, `--wipe-only`, `--days`.
Each was right when added and each carried its own lock rule, its own checkpoint shape and its own
follow-up ("after an `--extend-to`, run `--backfill-unlisted`"). Over 2026-10-27 to 2026-10-30 that
cost two forgotten follow-ups, two runs killed in a write phase the pager would have survived, a
stale lock blocking production's sampler twice, and a day of walks run as three commands. The
user's reading **(user)**: "combine these learnings all together and focus on the intent; to fill
buckets, resilient, and with the ability to make data fixes or partial reloads if needed but not
as the default" — and "I just want one walk from now on".

## Goals

- **One verb, `fill`**: make a span of UTC days complete in the store, every series a day has, from
  the chains' complete records, in one walk. Extending history backward is a fill of the days
  before the store's oldest covered day; nothing else is needed afterwards.
- **Resilient by default, with nothing to remember**: checkpoints, automatic resume, retries on
  every read and write, no sampler lock in the ordinary case, and every refusal names the command
  to run instead.
- **Fixes and partial reloads exist, but are asked for**: `--recompute` rewrites covered days;
  `rebuild` (wipe and rebuild) stays as the disaster path and asks before deleting.

## Non-goals and anti-goals

- No backfill of the fleet family (`f.*`: node counts, layers, make-ups, countries, providers) —
  there is no historical record of it anywhere upstream; those series begin the day their sampler
  shipped. The script says so when asked.
- No change to what a bucket holds or how the live sampler writes it (`bucketing.ts`, `merge.ts`
  are the one semantics; the script keeps writing through them).
- No new store keys, no change to `/api/trends`; "reader first" (`app/api/CLAUDE.md`) is untouched.
- Anti-goal: a run that needs a second run to be complete, or a flag the operator has to remember
  to get a complete result.

## The commands

```
npx tsx scripts/rebuild-trends.ts --net=mainnet fill --from=2023-11-13
npx tsx scripts/rebuild-trends.ts --net=mainnet fill --from=2026-09-01 --to=2026-09-10 --recompute
npx tsx scripts/rebuild-trends.ts --net=mainnet fill --from=2026-09-01 --to=2026-09-10 --recompute --chain=DAG0CyySf3
npx tsx scripts/rebuild-trends.ts --net=mainnet fill --from=2023-11-13 --dry-run
npx tsx scripts/rebuild-trends.ts --net=mainnet rebuild --days=90          # wipe + rebuild, asks
npx tsx scripts/rebuild-trends.ts --net=mainnet wipe                       # asks
```

Days are UTC and inclusive at both ends; `--from` is the OLDEST day, `--to` the NEWEST. Every old
flag listed in the intent is removed; an old flag answers with the `fill` command that replaces it.

### `fill` — the span

- **Without `--recompute`** (the default, an extension): `--to` is derived, never given — it is the
  store's oldest covered day (the first day holding `g.ticks` in the daily tier, scanned across
  year hashes as today), which is partially covered and is recomputed whole, exactly as
  `--extend-to` does now. `--from` must be older than it; a `--from` at or after it refuses with
  "already covered — add --recompute to rewrite those days".
- **With `--recompute`**: `--from` and `--to` are both REQUIRED (no "yesterday" default, so a
  resume across UTC midnight has nothing to drift); `--to` is at most yesterday (today is never in
  a span, it is the cron's); every day in the span is rewritten whole from the records, covered or
  not. This is the data fix and the partial reload. `--chain=<id prefix>` narrows it to ONE chain's
  own `m.<id>.*` fields — the prefix must match exactly one catalog or unlisted chain, else it
  refuses — and leaves the shared floors, the global spine and `u.cov` untouched; the summary says
  so, since a floor is every chain's sum.
- **The span is pinned at the start** and carried in the checkpoint, with the unlisted chain list
  the fill read at that moment; a resume never re-derives either — the pin always wins over a
  store the previous attempt already advanced (the spine flushes progressively).
- **The span's oldest edge keeps its gap** (builder check): a recompute of a mid-store span reads
  ONE record older than `--from` on every chain and on the spine and threads the gap chain from it
  (`stampRun`'s `pred`), so day `--from` keeps its cross-midnight gap instead of silently losing it
  — today's `--recompute-from` has that loss. An extension's edge is a chain's genesis: no
  predecessor, no invented gap, as now.

### `fill` — what one walk writes, for every day of the span

| Family | Fields | Source | Tiers |
|---|---|---|---|
| each catalog chain (`lineageIds`) | `m.<id>.snaps/fee/kb/blocks/gapSum/gapMax/ticks` | its records | daily; hourly and 5m for days ≥ `TIER_SINCE` (2025-07-01) |
| each unlisted chain (`untrackedIds` of the explorer's list) | the same `m.<addr>.*`, outside the floors | its records | same |
| the global spine | `g.ticks/anchors/blocks/gapSum/gapMax` | the global records | same |
| the floors | `g.feeFloor/g.kbFloor` | every catalog chain, folded | same |
| unlisted coverage | `u.cov = 0` on every bucket of the span — ONLY when every unlisted chain in the pinned list was walked; one skipped chain (no cursor in the store) suppresses the marker for the whole span, said in the summary (today's `markUnlistedCoverage` rule) | generated | same |

Never: `f.*`, today's buckets, any cron cursor (`t:<net>:cursor`), the lock.

### `fill` — how it walks

- The crash-safe machinery stays as it is: each chain is walked newest → oldest from a crafted
  explorer cursor at the span's newest day (`seekBoundary`), bucketed per page, its complete days
  (two whole days behind the frontier) flushed and its cursor checkpointed every 500K records and
  at its end; the floors are diverted per chain and written once after every chain; the global
  spine walks LAST so the coverage frontier (`g.ticks`) only advances over days every chain holds.
- **The unlisted chains join that same loop** **(user: one walk)**, bucketed with `floors: false`.
  They are seeded like any chain (their cron cursors exist since 2026-10-08); a chain with no
  cursor in the store is skipped with a message, as today. No whole-chain walk, no cursor write.
- **Chains walk three at a time** **(my call)**: the full rebuild already does, every chain's
  checkpoint and fields are its own, and the extension's 36-hour legs were sequential. The pool
  is a constant; the spine walks alone, last; the per-chain flush interval (500K records) bounds
  each chain's residual to about two days of records, so three in flight stay small.
- **Checkpoints resume by themselves**: a start that finds a checkpoint for the same net, mode and
  span continues it (finished chains skip, the in-flight chain rides its cursor); a checkpoint for
  a different span refuses and names `--fresh`, which discards it. No `--resume`.
- **Every page read and every store write retries** through a blip (the shared `retrying`, ~15 min
  of backoff). A persistent failure aborts with the error; the checkpoint makes the rerun cheap.
- **No sampler lock, ever** (builder check settled it): nothing a fill writes is a field the cron
  still writes — PROVIDED the cron is past the span. The cron adds only records newer than its
  cursors, so a recompute that includes yesterday collides only while a cursor's timestamp
  (`gTs`, `mTs.<id>`) is still inside yesterday: shortly after UTC midnight, or during a catch-up
  after an outage. A fill therefore checks the cursors BEFORE it starts and refuses while any is
  inside the span ("the sampler has not finished <day> yet — rerun after it passes", naming the
  cursor), rather than holding a lock that pauses production for the whole run. No lock, no
  signal handler, no takeover rule.
- **Fine tiers only where they exist**: hourly and 5m fields are written for days at or after
  `TIER_SINCE` (2025-07-01) and pruned in ONE place (`flushFinal`) for chains and spine alike —
  today's extension writes them below the floor, which the client never reads (`pickRangeTier`).
  Stale fine fields already below the floor are left as they are (unread, harmless).
- **`--dry-run`** derives the span and the boundary, lists the chains and the tiers it would write,
  and the lock decision, and writes nothing.
- **Output**: one line per chain as it completes (records, fields), the floors line, and a last
  line `filled <from> → <to>: <fields> fields, <chains> chains, <unlisted> unlisted`.

### `rebuild` and `wipe` — the disaster path, unchanged in substance

`rebuild --days=N` is today's wipe-and-rebuild: it takes the sampler lock, wipes `t:<net>:*`
(never the lock it holds), rebuilds N days (at most 400, as today) through today, sets the cron
cursors to the newest ordinals and marks unlisted coverage. It is also the BOOTSTRAP of an empty
store: a `fill` needs existing history to find its boundary and refuses on an empty store, naming
`rebuild`. `wipe` is the wipe alone. Both print what they are about to delete and wait for `yes`;
`--yes` answers it, and a non-interactive run without `--yes` refuses **(my call)**. They are not a
fill and are never needed in the ordinary course; the header says when they are.

## Documentation that changes with it

- The script's header: rewritten around `fill`, with the learnings it encodes (crash safety, no
  lock, the yesterday exception, one walk, what cannot be filled) and the three commands.
- `app/api/CLAUDE.md` and the root `CLAUDE.md`: the sentences that name `--recompute-from` or
  `--extend-to` as the repair now name `fill … --recompute` and `fill --from`.
- The memory runbook (`trends-clean-sheet-walk`): the resume commands become `fill` commands.

## Left to the builder

The command parser's shape, the checkpoint directory's layout (one directory per net as today, the
span in `_meta`), the exact wording of refusals and summaries, and whether the pool of three is a
constant or a flag with that default.
