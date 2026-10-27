# AI notes: written context beside the measured data

Design, 2026-10-27, brainstormed with the user on the local design companion (mockups under
`.superpowers/brainstorm/`, not committed). Decisions marked **(user)** were his; **(my call)** are
mine and open to his correction while reading.

## Intent

The app shows what the network measured. It does not say what *changed*, what *stands out*, or how
one network compares with another. A language model, given the same measured facts, can write that
in two or three sentences. The user wants that text, clearly separated from the facts: "helps also
to separate real facts from AI's interpretation, not to mix things up" **(user)**.

Model: Constellation Gate AI, `constellation/qwen3-8-flash-free` (free, 1M context, 131K output)
**(user)**, through `https://gateway.constellationgate.ai/v1/chat/completions` (OpenAI shape,
`Authorization: Bearer sk-gw-…`). **The Anthropic `/v1/messages` route refuses this model**
("does not support the Anthropic Messages API"), despite Gate's own example — found in the spike.
It is an experiment: "let's see if it holds up over time and this is workable" **(user)**.
**Free model or nothing** **(user, 2026-10-27)**: if the free tier cannot sustain the load (rate
limits, or too many notes failing the honesty gate), the experiment stops — no paid fallback. So
the plan puts the spike first and treats the warmer's volume as something to measure: a go/no-go
gate after the spike and again after a few days of real running.

## Goals

1. **One AI card per 3D view, whose subject is the current selection** **(user: placement C, "its own
   card")**. One card species, one generator — but **each view gets its own prompt and its own
   facts, because each view asks its own question** (CLAUDE.md: hyper = who/what, geo = where,
   ledger = when, trend = how it changed) **(user, 2026-10-27: "each view will have its own card and
   AI prompt")**. A note never answers another view's question: Geography's note talks about
   *where*, never about this week's pace.

   | View | Its question | Nothing selected | A network selected | Finer rung | Facts from | Refreshed |
   |---|---|---|---|---|---|---|
   | **Hypergraph** | who / what | **The hypergraph today** — the digest (#5): how many networks, which are active or quiet, the biggest by nodes and by activity, anything that started or stopped | **Who this network is** — its catalog `blurb` in one clause, its shape (L0 / currency L1 / data L1 node counts), how it ranks among the networks | a node → its network's note | `/api/metagraphs` (structure, node lists), `/api/trends` (activity level) | daily, plus when the network set changes |
   | **Geography** | where | **Where the network runs** — how many countries and providers, how concentrated (the top countries' and top provider's shares), the decentralisation picture in plain words | **That network's footprint** — its countries and providers, and how concentrated it is against the whole | **a country → what that country hosts** (which networks, which providers, its share); a cohort → its network's note | `/api/metagraphs` + `/api/geo` (the geolocated node set) | daily (nodes move rarely) |
   | **Snapshots** | when (live) | **The anchoring rhythm** — the global snapshot cadence lately, how many networks each one typically carries, fee and data volume, quiet or busy against the usual | **That network's rhythm** — how regularly it anchors, its longest gaps, its share of the global snapshots it was part of | a snapshot → its network's note | `/api/trends` 5m / 1h tiers (the last hours) | hourly |
   | **History** | how it changed | **What changed** for the window pill, subject = the Range card's (below) | the same, for that network's plane | — | `/api/trends` | per pill: 24H hourly, the rest daily |

   The **live** views' notes describe recent hours, not this instant: a note is written ahead and
   cached, so "right now" belongs to the measured cards beside it, never to the AI card. Each
   note's "written" stamp says which span it read.

   **History's states in detail:**
   - **A window pill** (24H, 7D, 30D, 1Y, All — the pills in `src/data/trendWindow.ts`'s
     `ZOOMS`) → **what changed** over that window, for the card's subject. The subject is exactly
     the Range card's (`cardNetwork(filter, trendFocus, trendFront)` via `subjectOf`), so the two
     cards can never disagree (the user's 2026-10-25 ruling: cards stay in sync with the selection).
     When that subject is the DAG plane — where History arrives — the note is about the whole
     hypergraph (all networks); a network plane gets that network's note. A deck swipe changes the
     subject and the card follows; every pill × subject note is cached, so that costs nothing
     **(my call, from the codebase)**.
   - **A range brushed by hand** → a **"Write notes for this range" control**; the result
     is cached for that span **(user: option C, on request)**.
   - **The 1H pill** → treated like a brushed range: the same request control, cached for
     one sampler step (15 min). Keeping a 1H note warm would cost ~13 × 96 calls a day for a window
     that changes every quarter hour **(my call)**.
   - Across the views, a rung without a note of its own (a node, a cohort, a snapshot) inherits its
     parent's — its network's — like the camera ladder; Geography's country is the exception,
     because *where* is that view's question and a country is a where **(my call)**.
2. **Notable days on History's timeline** (bonus #4) **(user: A + popover + section)**:
   - Code picks the days from measured buckets; the model only writes each day's one-line caption.
   - Each day is an iridescent **diamond on the bottom timeline band**. Hover shows a **popover**
     with the caption (the callout-like look of mockup B); click/tap **sets the range to that day**.
   - The same days are listed in the AI card's **"Notable days"** section; each row is a door that
     sets the range. Hovering a diamond lights its row and vice versa (the app's scene↔HUD hover
     pairing, convention 9: hovers preview, never commit).
3. **The card reads unmistakably as AI** **(user: emphasis A)**: an iridescent multi-hue hairline
   edge and eyebrow (cyan → violet → pink), the lucide `Sparkles` glyph, eyebrow "AI notes". Being
   several hues at once, it can never be read as one network's identity colour. Both grounds (dark
   and paper) get their own stop values.

## Non-goals

- No chat, no free-text questions from visitors.
- No AI text inside the measured surfaces: not in the charts, the Range/Moment cards, the explorer,
  the raw layer. The popover sits on the timeline band (a navigation control), never on a plane.
- No causes. The model words what the data shows; it never says *why* (no news, no release notes as
  input in this version).
- No notes for unlisted networks (their identity is unknown; the model would invent one), and none for
  testnet/integrationnet unless their trends store exists **(my call)**.
- Not the raw records' field glossary (static meaning — a hand-written glossary, not AI).

## Anti-goals (would make it a failure even if it works)

- **A number in AI text that the data did not contain.** Rule 10 (honesty) applies to this card as
  much as to any other. See *The honesty gate*.
- AI text that can be mistaken for a measured figure, or measured figures restyled as AI.
- Visitors able to run up calls without bound, or a broken card when the model is slow, rate-limited
  or down. A failure is an instrument state ("Notes unavailable — try again later"), never an error dump.
- Hover-only text: every popover caption also lives in the card's section
  (`components/tooltipBoundary.test.ts`'s rule).

## How it works

### One generator, one cache, a warmer

- **One server function** turns a *subject* into a note: `{ view, subject, span }` → that view's
  facts builder → that view's prompt → model → honesty gate → stored note. The per-view parts (facts
  builder + prompt) are a table keyed by view, like `viewPolicy`, so adding a view is one row, not a
  branch in the generator.
- **One cache** in the existing Upstash Redis (a separate key family, e.g. `ai:{net}:{kind}:…`,
  with a TTL fitted to the subject: a 24h window's note goes stale within hours, the 1y note
  barely in a day) **(my call on keys and TTLs; the builder sizes them)**.
- **A cron warmer** (a second entry in `vercel.json`, daily plus a more frequent pass for the short
  windows) pre-writes every view's notes on the refresh the table above gives it, so a visitor
  almost never waits. Per pass, roughly: Hypergraph 1 + 13, Geography 1 + 13 + the countries that
  host nodes, Snapshots 1 + 13, History 5 pills × 13 subjects (`ZOOMS`; the store's 90d/180d
  windows have no pill and get no note). Well under Gate's measured limit of 6,000 requests a minute.
- **Read path:** a GET route answers from the cache; a miss on a pre-written kind generates once
  (singleflight via a short Redis lock so ten visitors don't trigger ten calls).
- **Write-on-request path** (brushed ranges only): a POST route, behind a **per-visitor rate limit**
  and a **global daily cap**, both counted in Redis, because Gate's own spend caps are Pro-only.
  Ranges are snapped to whole buckets before keying, so the same brush hits the same cache entry.

### Facts, not buckets

The model never sees raw buckets or raw node lists. Each view's facts builder computes a small,
labelled facts object from that view's server-side sources (table above): totals, the previous
equal span's totals, **the ratios and percentages pre-computed**, shares of the whole, the
busiest and quietest, node and country counts, the notable days with their measured values. The
spike showed why the ratios go in: given only raw counts the model either lists every figure back,
or derives its own percentages, which the gate then has to verify. Measure names follow the app's
vocabulary (`METRIC_LABELS`, `metricLabel` in `src/data/trendSeries.ts`: "Snapshots anchored",
"Global snapshots" for the DAG, "was part of" for networks; never "L1 snapshots").

### The honesty gate

Before a note is stored, every number in its text must match a number in the facts object it was
written from (allowing for the formatting the facts state, e.g. `12,159` or `12.2K`, and simple
ratios the facts also carry, e.g. "more than doubled" ↔ a stated ratio ≥ 2, and the plain
conversions of a stated ratio: the spike's "rose by 37%" came from a ratio of 1.37, which is honest
but not literally in the facts). A note that fails is
retried once with the failure named; a second failure stores nothing and the card shows its
"unavailable" state. This makes rule 10 executable for this card instead of trusting the prompt.
The gate is pure logic and lands in `domain/` or `src/data/` with its colocated test (rule 4).

### Notable days

Pure detection over measured daily buckets: a day well above or below the scope's own recent level,
a network's first or last snapshot, a pause longer than its usual spacing. The thresholds are the
builder's to tune against real data; the module and its test are the specification. Detection is
deterministic — the same data always yields the same days — and only the captions are written.

**Whose days** **(my call)**: the card's subject's own. On the DAG plane, days notable in the
hypergraph's total, plus each network's first or last snapshot inside the window; on a network
plane, that network's days. Ranked by how far the day stood from its own level and **capped per
window** (a handful, not dozens) so the timeline band never crowds — the builder sets the cap.

A **first snapshot** is the day a network began anchoring; a **last snapshot** the day it went
quiet and stayed quiet (silent for a few days at least, so a quiet hour never qualifies; re-derived
every pass, so a network that resumes loses its diamond). On the DAG plane these captions say
**who the network is, at a high level** — one clause from its catalog `blurb` in
`src/engine/config.ts`, passed in as a labelled fact — and leave the details to that network's own
note, read when it is the subject **(user, 2026-10-27)**.

### Where the card sits

The right rail of each 3D view, after the view's existing cards, collapsible like them; on a phone,
one more card in the dock **(my call — check against the phone dock's height budget)**. Per-view
behaviour is an allow-list row (convention 7): a new `viewPolicy` field opts each view in, rather
than `mode === …` guards. The History states read the existing store channels (`trendWindow`,
`trendRange`, `trendFocus`, `filter`); clicking a diamond or a Notable-days row sets the range
exactly as a brush does (`setTrendRange` — a range is not a selection setter, so rule 2's executor
is not involved). In Geography a country gets its own note (*where* is that view's question).

Each note carries a quiet "written" stamp (when, from what span) as a chip or row, never a mid-dot
sentence (design taste). The text is two or three sentences; Notable days captions are one line.

### Secrets and environments

- `GATE_API_KEY` (and the model id as `GATE_MODEL`, defaulting to the free Qwen) as server-only env
  vars, never shipped to the client. Server-side `fetch` only, so the CSP needs no change.
- Previews share the Upstash store (CLAUDE.md, *Deploying*): the global cap protects it; whether
  previews get the key is the user's call at deploy time (without it the card shows "unavailable").
- Gate keeps request bodies 90 days; the input is public network data, so that is acceptable.

## What the builder decides

- Exact prompt wording and the facts object's shape (keep both versioned; a prompt change should
  not need a cache flush by hand — include a version in the cache key).
- Cache TTLs, the warmer's schedule, rate-limit and cap numbers (start conservative; the user will
  watch how the free model holds up).
- Notable-day thresholds.
- The card's loading state (the app's "acquiring" vocabulary) and the request control's look (the
  app's one control species, `components/CLAUDE.md`).

## Verification

- Unit: the honesty gate (numbers in/out, ratio words), notable-day detection, cache keying and
  range snapping, subject resolution per view — each colocated, rule 4's coverage test green.
- The existing boundary tests stay green (selection, tooltip, publish channels, CSS traps).
- Live, in the running app, both grounds, desktop + tablet + phone: each card state, the hover
  pairing diamond↔row, click-to-range, the request control under the rate limit and with the model
  unreachable.
- The spike is done (2026-10-27): HTTP 200 in ~2.8 s, no reasoning text in the answer (nothing to
  strip), `x-ratelimit-limit: 6000`, and Gate's own cache answered an identical repeat in 0.35 s.
  Every number in both test notes was correct; the first prompt listed every figure back, the
  second ("the reader can see the numbers — say what stands out") gave the note we want, with one
  clumsy phrase ("a ratio of 2.48") left to prompt tuning.
