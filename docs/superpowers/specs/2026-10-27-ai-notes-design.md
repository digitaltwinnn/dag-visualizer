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
**(user)**, through `https://gateway.constellationgate.ai` (Anthropic Messages shape at
`/v1/messages`, or OpenAI shape at `/v1/chat/completions`), authenticated by a Gate key `sk-gw-…`.
It is an experiment: "let's see if it holds up over time and this is workable" **(user)**.
**Free model or nothing** **(user, 2026-10-27)**: if the free tier cannot sustain the load (rate
limits, or too many notes failing the honesty gate), the experiment stops — no paid fallback. So
the plan puts the spike first and treats the warmer's volume as something to measure: a go/no-go
gate after the spike and again after a few days of real running.

## Goals

1. **One AI card per 3D view, whose subject is the current selection** **(user: placement C, "its own
   card")**. Three states of the same card, not three features:
   - **Nothing selected** → the **daily digest** ("Today on the Hypergraph").
   - **A network selected** → that network's **lately** note (recent pace against its own past,
     its share against the others).
   - **History, a window pill** (24H, 7D, 30D, 1Y, All — the pills in `src/data/trendWindow.ts`'s
     `ZOOMS`) → **what changed** over that window, for the card's subject. The subject is exactly
     the Range card's (`cardNetwork(filter, trendFocus, trendFront)` via `subjectOf`), so the two
     cards can never disagree (the user's 2026-10-25 ruling: cards stay in sync with the selection).
     When that subject is the DAG plane — where History arrives — the note is about the whole
     hypergraph (all networks); a network plane gets that network's note. A deck swipe changes the
     subject and the card follows; every pill × subject note is cached, so that costs nothing
     **(my call, from the codebase)**.
   - **History, a range brushed by hand** → a **"Write notes for this range" control**; the result
     is cached for that span **(user: option C, on request)**.
   - **History, the 1H pill** → treated like a brushed range: the same request control, cached for
     one sampler step (15 min). Keeping a 1H note warm would cost ~13 × 96 calls a day for a window
     that changes every quarter hour **(my call)**.
   - A rung finer than a network (node, country, cohort, snapshot) shows its network's note; a rung
     with no note of its own inherits its parent's, like the camera ladder **(my call)**.
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

- **One server function** turns a *subject* into a note: `{ kind: "digest" | "lately" | "window" |
  "range", net, scope, fromMs, toMs }` → facts → prompt → model → honesty gate → stored note.
- **One cache** in the existing Upstash Redis (a separate key family, e.g. `ai:{net}:{kind}:…`,
  with a TTL fitted to the subject: a 24h window's note goes stale within hours, the 1y note
  barely in a day) **(my call on keys and TTLs; the builder sizes them)**.
- **A cron warmer** (a second entry in `vercel.json`, daily plus a more frequent pass for the short
  windows) pre-writes the digest, every listed network's lately note, and every window pill × scope,
  so a visitor almost never waits. The warmed pills are 24H, 7D, 30D, 1Y and All (`ZOOMS`; the
  store's 90d/180d windows have no pill and get no note) — about 5 × 13 ≈ 65 notes per pass.
- **Read path:** a GET route answers from the cache; a miss on a pre-written kind generates once
  (singleflight via a short Redis lock so ten visitors don't trigger ten calls).
- **Write-on-request path** (brushed ranges only): a POST route, behind a **per-visitor rate limit**
  and a **global daily cap**, both counted in Redis, because Gate's own spend caps are Pro-only.
  Ranges are snapped to whole buckets before keying, so the same brush hits the same cache entry.

### Facts, not buckets

The model never sees raw buckets. Code computes a small, labelled facts object from the trends store
(the same reads `assemble`/`assembleSpan` make): per scope the span's totals, the previous equal span's
totals, the change, the share of the whole, the busiest and quietest networks, node counts where the
store has them, and the notable days with their measured values. Measure names follow the app's
vocabulary (`METRIC_LABELS`, `metricLabel` in `src/data/trendSeries.ts`: "Snapshots anchored",
"Global snapshots" for the DAG, "was part of" for networks; never "L1 snapshots").

### The honesty gate

Before a note is stored, every number in its text must match a number in the facts object it was
written from (allowing for the formatting the facts state, e.g. `12,159` or `12.2K`, and simple
ratios the facts also carry, e.g. "more than doubled" ↔ a stated ratio ≥ 2). A note that fails is
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
is not involved). In Geography a country selected without a network sits above the network on
that view's ladder, so it shows the digest.

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
- Whether to strip or disable the model's reasoning output (it is a reasoning model).
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
- A first spike call to Gate before building anything else, to confirm the response shape, latency
  and whether reasoning text arrives.
