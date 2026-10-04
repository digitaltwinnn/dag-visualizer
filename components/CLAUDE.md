# components — working notes

The React HUD: the four-zone shell, the card grammar and the Instrument-Glass design system.

Split out of the root `CLAUDE.md` (2026-08-31) so it loads when you work here rather
than on every session. The root file holds what this is, the twelve rules, run & test,
the architecture map and the dev workflow; **its rules govern this file too**.

## Layout — the four-zone HUD over a raw data layer

The page is one fixed shell in **two layers at different depths** (`SectionShell` + `store.section`).
**The raw layer's anchor log carries a SEARCH BAR** (`datasection/LogSearchBar.tsx` +
`src/data/chainSeek.ts`): three named criteria in a hairline box, and ONE Search button, revealed by
a `search snapshots` toggle in a toolbar above the table.

⚠️ **SEARCHING IS ASKED FOR, AND THE TRIGGER SITS WITH WHAT IT REVEALS.** Two placements were
rejected and both lessons are load-bearing. The controls first sat PERMANENTLY under the header
cells they answer for — a real pattern with a real virtue, context — but a standing line of
placeholders under the header reads as a first data row whose values happen to be words, and a
table's job is to open as data (user: "it kinda looks like the search row is actually part of the
data, and the hint looks ugly"). The second cut put the toggle in the PAGER strip below the table
while the inputs opened above it: "makes no sense to put search at the bottom and the inputs at the
top". Progressive disclosure works by ADJACENCY — search belongs in a toolbar above the table, and
the fields open directly beneath it.

⚠️ **AND THE FIELDS CAME OFF THE TABLE ENTIRELY** (user: "just three named search fields … this way
it does not fight with the table"). Seated in header cells, the TABLE's geometry was the form's
budget and the table won every argument: two date inputs cannot render `mm/dd/yyyy` inside a ~165px
AGE column, so they stacked; hints had to fit column widths, so they were cramped; and every column
needed a cell even where it could answer nothing. Off the table they are just fields — the date
range fits one line, each is named by a LABEL rather than by whatever column it sat under, and the
AGE column went back to its natural 115px from the 232 the stacked pair forced. The bar sits in its
own hairline box: measured, the toolbar, the fields and the table header sat at 0px from each other
and the criteria read as more table chrome. Outline only, no fill — the fields carry `--panel-plate`
and a plate on a plate flattens them.

⚠️ **ONE BUTTON, AND ALL THREE CRITERIA VISIBLE.** A submit beside every field was rejected ("I want
a search button"), and so was a "search by" chooser that hid two criteria to make one button
unambiguous ("no 'search by'"). A reader wants to see everything they can search by, with one thing
to press; `onSubmit` states the precedence, most specific first. Enter anywhere in the bar runs the
same search — both, never one: implicit submission for everyone who knows it, a visible control for
everyone who does not.

⚠️ **THE METAGRAPH CRITERION IS ONE COMPOSITE FIELD — a chain picker joined to its ordinal — and
under a commit the picker is a READOUT, not a choice.** Ordinals are PER CHAIN: DOR's 27,813,700 and
DED's are unrelated snapshots of unrelated ledgers. Under "all" the log is a window over every
network at once, so there is nothing to infer and the reader picks (user: "in all there are multiple
networks, so it's needed") — and the window search is SCOPED by that pick, which is the whole point;
an unscoped scan matches whichever network reached the number first. Under a committed filter the
table IS that network's chain and pages it server-side, so `histNet` WINS over the local pick and the
picker locks, stating the scope rather than offering a search this surface cannot run. Changing which
chain is searched is the top bar's job — the same boundary the pager and the explorer already keep.

⚠️ **THREE CRITERIA IS ITSELF THE STATEMENT** — the old row said it with empty cells. Only three axes
are searchable across a chain of >1M pages. SNAPSHOT is arithmetic (ordinals are gapless), one
request. ANCHORED INTO asks the GLOBAL SNAPSHOT ITSELF — it carries the list of what anchored into it
(`/api/snapshot/[ordinal]` decodes one row per channel with that channel's own ordinal), so the
answer is ONE exact read, measured: one request, zero walk probes. It is also the only mechanism that
can say *this network did not anchor there* — a time-based search answers that case by landing on
whatever came next, which reads as a hit. AGE is a date, and there is no date lookup upstream
(verified: `startTime`/`endTime`, `timestamp`, `from`, `startDate`, `before` are all silently ignored
and return the live tip), so it is the only criterion that walks. FEE and SIZE have no index at any
layer — a field there could only filter the 25 rows on screen, and a reader who typed a fee and got
"no match" would reasonably conclude no such snapshot exists when we looked at 25 of 1.1 million.

**The toolbar carries the two states the first cuts had nowhere to put**, both named in every guide
on table filtering: what is APPLIED (in words, so a folded bar can never leave the table on a search
with nothing explaining it) and a way to CLEAR it.

⚠️ **AND TWO COLUMNS STAND DOWN ON PHONE.** Six columns cannot fit a 500px viewport — measured, the
table ran 494px inside a 403px pane and took the log into horizontal scroll, which on a log you SCAN
is worse than showing less of each row. FEE and SIZE go: the other four IDENTIFY a row (whose chain,
which snapshot, where it anchored, when) while those two are measures ABOUT it, stated in full on the
snapshot card one tap away — and they are the only two the search bar cannot answer for anyway. One
class on the header cell and its body cells, so a column can never half-hide.

⚠️ **AND ANCHORED INTO HAS NO FALLBACK, DELIBERATELY.** The payload host serves only the recent band
of global ordinals and 404s older ones. A first cut answered that by resolving the ordinal to a
timestamp and walking for an equal stamp — a whole second mechanism, carrying its own near-miss
caveat, for a case the reader already has two working routes to (the Snapshot field pages the entire
chain; the date range reaches any point in it). An unserved ordinal is simply SAID, and the message
names the route that does work (user: "keep it simple, no obsolete code to work around things").

⚠️ **VOCABULARY: never "tick" in anything a reader sees.** The column key is `tick` and the code
says tick throughout, but the app's word is GLOBAL SNAPSHOT — the first cut of this control shipped
"go to tick #" as a placeholder and the user caught it ("whatever tick means to you, it's not the
vocabulary we use in our app").

The walk is **interpolating, not bisecting** — cadence is regular enough that false position lands in
a handful of probes where binary search needs ~21. ⚠️ But false position **stagnates one-sided on a
curved chain** (a network that changed cadence), so it carries the textbook guard: after the same end
is kept twice running, that probe bisects. Measured, without the guard a synthetic chain that sped up
midway failed to converge in 24 probes. It returns **null rather than a plausible page** when it runs
out — a walk that did not prove a bracket has not searched the chain, and paging somewhere close
would let the reader believe it had.

Two traps already paid for: the controls must render in the table's LOADING branch too (a seek swaps
the table into that state, and unmounting mid-seek loses what was typed), and a "clear" must fire
from the change EVENT rather than an effect on the empty value — an effect also fires on mount, so
every remount silently wiped the landing mark. That mark is an OUTLINE and deliberately not a wash:
the washes are the selection language, and looking something up is not committing it (rule 2 keeps
one write path).

The scene layer is the four-zone HUD over the 3D canvas; the raw layer is *the same subject one level
down*, not a second page. ⚠️ The store value for that layer is **`"data"`,
not `"raw"`** — every word the user reads says RAW, so the two registers don't match and grepping for
`"raw"` finds nothing. The RAW switch runs one GSAP timeline: the HUD
fades, the scene recedes (still live behind), the raw layer surfaces out of that depth. Back is the
mirror, with three ways to ask for it — the switch, Escape, the layer's own × — all calling
`setSection("scene")`. Reduced motion makes it an instant swap.

⚠️ **WHAT THAT LAYER HOLDS IS A POLICY ROW, NOT A FIXED SURFACE** (2026-09-18). `section` is a
PRESENTATION axis — one subject, two presentations — so `VIEW_POLICIES[mode].rawSurface` is where
each view says which register it shows: `"records"` for the structural views (the anchor log, the
node roster) and `"document"` for History, whose RAW is the measured-history DOCUMENT
(`components/docs/TrendsDoc.tsx`, the view's other register under convention 12). The two live in
`components/datasection/` as `RecordsSurface` / `DocumentSurface`, and `components/DataSection.tsx`
is nothing but the keyed dispatch between them — a map, so a third register is a compile error
rather than a silent fall-through, and gated on the row rather than a mode (convention 7). The mode
compares that pick WHICH TABLE the records surface draws are records-internal, which is why they sit
inside that surface and never in the dispatch; `components/rawSurfaceBoundary.test.ts` pins the
split. The document's chunk is `dynamic()`-loaded — the raw layer mounts in every view — and it is
set in the shared reading measure (`components/docs/measure.ts`) with no sheet of its own: the
layer's `.ig-panel` glass IS its sheet, and a plate on a plate flattens both. Everything else about
RAW is identical there: the toggle shows pressed, Escape and the × return to the scene, and the
command bar keeps its whole ordinary face, filter included.

⚠️ **AND THE DOCUMENT OPENS ON WHAT THE SCENE WAS SHOWING** (2026-09-19). The step ACROSS the
rung carries its context exactly as the step DOWN does: `TrendsDoc` seeds its `zoom` from
`store.trendWindow` and its `range` from `store.trendRange` — a brushed range arrives with
`metaId: null`, since the timeline brushes the whole stack rather than one plane. These are its
THIRD and first mount-once reads beside `initialTab`, and `DocumentSurface` remounts the component
per open, so "at mount" is "when the reader asked to read it". **Seeded, not followed, and never
written back**: after mount the pickers are the page's own, a subscription would fight the reader's
own pill on the next cursor write, and a write the other way would make reading the page silently
re-cut the scene behind it. `components/rawSurfaceBoundary.test.ts` pins all three halves — the
`getState()` seed, the absent subscription, and the absent setter call.

**The page never scrolls.** The scene wrapper is `position:fixed; inset:0` with an identity transform
from first paint, which makes it the containing block for every fixed descendant — see CSS trap 2,
where both halves of that arrangement are load-bearing. The raw layer and the vitals band are siblings
of that wrapper, not children. Whichever layer is away carries `inert`.

The HUD is **four fixed zones, one scope each, stable across views. Gate new chrome by which
zone/scope it belongs to, not by what a particular view puts there** — a card is defined by its scope,
and its contents are view-specific examples that keep changing.

**Top — the command bar.** One full-width glass bar, edges aligned with the rail columns: the ECG +
wordmark + filter on the left, the view switch centered, and on the right the view-scoped pair
(SCENE⇄HUD + RAW + ABOUT) followed by ONE settings gear (2026-09-08 — the theme/pages/network trio
folded into `topbar/SettingsMenu.tsx`, labeled sections of one popover; their files are rows-only
modules now. **The pages section left on 2026-09-28** — user: "doc pages are not settings"; the
footer's About · Design row is their one door. One state survives on the trigger by rule: the
network CODE in the live accent off mainnet — "which chain am I looking at" never goes missing.
One mount at every width; the filter strip's second row, the trio's old phone home, retired with it). The bar has **one grow-downward slot with four tenants** (a which-strip enum makes
them mutually exclusive by construction): the FILTER button opens the network-chip strip (hovering
previews the dim, picking closes it), **on phone the view switch is ONE face — the current view's
icon and name — that opens the view list as a strip tenant** (`topbar/ViewPicker.tsx`, 2026-09-28: a
row of 44px icons cannot scale with the view count — History made it five and the filter ran under
the first tab — and hiding entries per tier is a patch the next view undoes; the segmented switch
stays from 700px up, both presentations live in the DOM and CSS picks, and the hanging caption
stands down on phone because the face already prints the name), **the view-scoped island's info
button opens the ABOUT row** (`topbar/AboutStrip.tsx`, 2026-09-28 — the per-view orientation prose
that used to lead the left rail as a card; user: "the static about card is a bit out-of-place on the
left column … about belongs where?" — the four zones are instruments and prose is documentation,
whose one home is /about, so the in-view door sits beside the ECG's "how live is this app" strip,
closed by default, view-scoped like Scene and Raw), and the ECG opens the **pulse strip** — one read-only cell
per data FEED from the poll-health registry (`src/data/api.ts` `reportPoll`/`pollHealthRows`; the
five real fetch sites report their own outcomes), each with a derived status dot (ok / stale past
~2.5× its own cadence / error — never fabricated, rule 10), the last success ticking, the cadence
and target in words. Either strip is a **layout participant, not a popup** — TopBar publishes its
height and both the rails and the canvas add it to their `top`, a pure position shift that keeps
the buffer viewport-sized so nothing distorts and the engine never resizes.

The command bar is spineless — the ECG mark is its identity cue (a BUTTON now, the pulse strip's
toggle). The wordmark is plain unlinked chrome (`select-none`, default cursor — the footer owns
/about) shown at every width except phone, where it doesn't fit; the old 1439 hide band was
measured with the vitals cluster aboard and died with it. The presentation control is TWO controls
on the store's own axes (2026-08-30): a SCENE⇄HUD toggle over `railsHidden` (one button that
flips, desktop-only) beside a RAW pressed-toggle over `section` — popping out of RAW restores
whichever presentation you had. **The bar's remaining narrow-width thresholds are MEASURED, not
guessed**: the view-switch labels drop at `max-[1299px]`, the dividers plus the "soon" views at
`max-[820px]` — re-measure any threshold when content moves in or out of the bar (the vitals'
departure is what freed the wordmark). When the labels go, the ACTIVE view's name reappears as a
caption strip under the bar (`aria-hidden`, non-interactive).

**Left rail — the explore/interact scope.** The view's one tool card, if it has one (the About
orientation card that led every rail from 2026-08-08 retired on 2026-09-28 into the command bar's
ABOUT row, above). What each explorer contains is view-specific, but three
decisions inside them are design, not detail:

- geo's cohort rows carry **no status and no identity dot** — health belongs to the node card, and
  network isn't in the cohort key, so no single hue can speak for the row.
- hyper's **composition group is committable** — a real focus rung with its own card, so one click
  commits and expands it and the disclosure state IS `store.composition`, single-open by construction
  with no local state. The grouping math lives once in `src/data/composition.ts`, shared by the row,
  the card and the Engine's group glow, so a count can't drift.
- ledger's explorer is **ONE AXIS: TIME** (user, 2026-08-09) — a single path, tick → network →
  that network's snapshots in the tick → that snapshot's signers, coarse→fine like every other ladder
  in the app, built as an `Explorer` description since 2026-09-26 (`components/LedgerPanel.tsx`).
  The transposed second group (network → its ordinals across the window) was **retired**: two trees
  over the same rows made the user choose an axis before browsing, and time is the view's own axis.
  Three rules the description keeps: **a network row under a tick OPENS and PREVIEWS but commits
  nothing** (user, 2026-08-10 — a click that moved the top-bar filter reached past what the row is
  about), and **a snapshot row commits tick + snapshot, never the filter** (design decision 13,
  2026-09-26 — `metaSnapSelectActions` lost its filter-first arm); **a committed filter is a LENS**:
  every tick still lists (they all happened — rule 10 doesn't let a lens edit the facts), a tick the
  network anchored into carries its count in the network's hue as the row's tag, one it sat out is
  `faint`, and inside a tick only the committed network's row is drillable (`outOfLens`); **the
  path follows a commit made elsewhere** (a tile, the rail's ‹ › plank, the raw log) but never
  auto-opens from the root, because the newest tick changes every few seconds. The LIVE/PINNED
  control rides the CARD HEAD's eyebrow row with the shown snapshot's ticking age (2026-09-28 —
  it rode the heading row as the level's setting, design decision 15, until then), and the pager
  states the TIME the rows span ("last 11 min") rather than "52 recent". Each level shows
  the ONE vocabulary minus what it cannot state (ticks fees · anchors · metagraphs · size, a network
  in a tick fees · anchors · size, a snapshot fees · size), and ONE pick serves every level: a level
  shows it where it applies and its own first measure where it doesn't, without overwriting it
  (user, 2026-09-29 — `src/data/explorerMeasure.ts`, which Geography's cohort level shares; every
  explorer follows the rule). Figures are BARE because the heading names the unit, in a 48px figure
  column (`figureW` — a 4-decimal fee does not fit the default 40).

- **History's tool card is its roster, with the MEASURE on its heading**
  (`components/TrendExplore.tsx`, an `Explorer` description since 2026-09-26). ONE level: the
  ranked networks, busiest first, each with its SPAN reading — the average per day (a gauge's
  plain average) over the window on screen, `spanAverage` — and a bar of its share. **The list
  follows the range** (user, 2026-09-29, design A): the hint names the span ("Average per day ·
  last 7 days"), a new range re-ranks the list and the stack together, and the planes' headline
  states the SAME number — the roster's one `head` (user, same day: "keep it consistent"). Under a
  day's window (1H, a short brush) there is no measured day to average, so the list and the
  headline both say the latest full day instead. The Moment card is the one INSTANT — crosshair, time headline, "At
  that moment" over its list — so the two lists never read as copies. The METRIC is the heading control (the figure column's own
  heading, a radio list of `METRIC_ORDER` with units at the current cadence); `Same scale` left
  the heading on 2026-09-28 for the band's pill group — it draws the planes and never changed a
  row here (user), so it sits with the stack's other stack-wide settings, the window and the
  range, and stands down under a committed filter where the stack is one plane. Neither the
  metric nor the scale is a selection, so both write their setters directly
  (`selectionBoundary`'s own scope note says why, and why the plane FOCUS is in the table instead).
  A row click applies the SAME `trendPlaneActions` the plane's header strip runs. No scope mark in
  the head at all (2026-09-26): the top bar's filter names the committed network and is the one
  place to clear it. **The whole roster lists and nothing pages** (user, 2026-09-28: "other
  views just expand the card; only Snapshots pages, because that number is huge" — a dozen
  networks is a list, not a chain). The stack still shows `VISIBLE_PLANES` at a time, and the
  rows drive it: a click brings that plane to the front and the store's `scrollToKeep` pages the
  window after it, so no control in the card names `trendScroll`. Two pagers came and went the
  same day — one under all the rows that moved only the stack's window ("3–7 of 11" under eleven
  rows), then a list cut to the five on stage — and neither is to come back. **The scene says
  the roster continues**: while networks remain behind the window, a SIXTH, UNNAMED plane sits
  one slot behind the deck (`trendStack.morePose`, rendered by `TrendStack` and projected like
  any other anchor) printing only "N more" — no network, no chart, no pointer events; a roster
  that fits shows no ghost.
  **The DAG is a PINNED row above the list** (user, 2026-10-03: "isn't it basically the
  hypergraph metrics?" — "ok as pinned row, show that it's the totals of the rows below"): the
  hypergraph's own reading (`roster.total`, the same pass and head rule its plane uses), above
  a hairline, with no bar. **ONE tag, and only where it is true**: "total" for the three measures
  where the figure IS the rows below added up (`GLOBAL_READING`: snapshots, fees, data), and no
  tag where it is the DAG's own figure — its nodes (`f.nodes.dag`, never the fleet total), its
  blocks, its cadence — because an untagged row is a network's own, like
  every row beneath it. Four rounds of wording got here ("total"/"base ledger", "sum of rows
  below"/"DAG's own", "sum"/"all"/"only" — user: "make it consistent where possible, it's too
  random"): three tags for three shades of meaning was the randomness. Never ranked among the
  networks: it would always be first with a full bar. **A click brings the DAG's chart forward and never sets the page filter** (user, same
  day, two rounds: "don't set the page filter", then "why is the dag pinned row not clickable?
  we have the chart data, no?"). The DAG's plane — the one the DAG filter always drew — joins the
  deck at the FRONT while it is the focus (`TrendStack`'s `deck`) and leaves when released, so
  the resting stack is unchanged and the row runs the same plane focus every other row does.
  (Parked at the back of the deck it paged the stack to its tail on focus.) It stays out of the
  RANK and off the shared ceiling: it is what the layers add up to.
  ⚠️ **The roster is computed ONCE, in `components/useTrendRoster.ts`** — the planes, this list and
  the cursor card all read it, counter EDGE TRIM included. A surface reading the payload directly
  is one bucket out of step with the axis, which is exactly how the cursor card briefly quoted
  yesterday's number; `components/trendRailBoundary.test.ts` pins all three "one home" rules.

**Naming and copy rules:** the ABOUT row states the view's point of view ("How the network is built"); the tool
card says what you BROWSE — by the AXIS the rows break the network down along, never by the
figure they show, as a PLURAL NOUN ("Networks", "Countries", "Snapshots", and History's "Networks" —
2026-09-28, user: "every explorer card has 'breakdown', perhaps it's redundant?" — the EXPLORE eyebrow
already says what the card is; they were "X breakdown" from 2026-09-26, and History's rows are networks, "layer" was the stack's word for a plane; 2026-09-26
— user, 2026-09-26: once every explorer carries the measure HEADING CONTROL, a title like "Nodes by
country" names one measure of three). Eyebrows are bare role words, and each explorer's usage
hint leads its card rather than trailing it. An explorer ROW is a browse target — mark, name, count,
nothing more; **the prose that EXPLAINS a subject belongs to that subject's right-rail card, once**,
and since a row commits its card in the same click, nothing is lost by keeping the sentence in one
place.

**Right rail — the facts scope, read-only.** A set of fixed card slots in one stable order — network
dossier, country, provider, composition, then the snapshot chain (global snapshot ABOVE the metagraph
snapshot it anchors), then node. `components/railCards.ts` is the manifest and
`components/railCards.test.ts` pins the order, the availability and every hint.

**History's lane is the network dossier, then the MOMENT** (2026-09-19; named "Instant" until 2026-09-26) — the cursor card, a slot
with NO focus rung, exactly as the two snapshot slots are. Its subject is `trendCursorMs`, which the
band's timeline writes at most once per BUCKET (`sameBucket`, both gestures since 2026-09-19), so the
title roll, the edge pulse and the tray highlight fire once per bucket rather than once per
pointermove. Three rules are worth knowing before touching it:

- **Presence is VIEW-SCOPED, unlike a pinned snapshot's.** A pinned snapshot keeps meaning wherever
  you carry it, which is why its card renders in any 3D view; an instant is a reading OF THIS STACK,
  so outside History it names no chart and ranks no roster. The cursor itself survives the switch;
  only the card stands down.
- **The cursor takes a place in `selStack`.** Without it the mode-entry collapse snapshot pinned the
  slot shut and nothing in this view was a selection change that would drop it, so a click on the
  timeline populated a card that stayed collapsed under its own eyebrow. It is still not a rung: no
  pose, no deselect step, and the × clears the channel alone (`setTrendCursor`, deliberately outside
  the pickActions table).
- **THE ONE EXIT IS THE CARD'S FOOT CONTROL, and it is shared.** `Snapshot records` — a full-bleed
  control on the wash ladder at the card's foot (2026-09-26, `moment-door.html` A; the bare text
  links read as prose) — and the Trends document's per-chart link call ONE helper
  (`components/trendDoors.ts`): commit the network through the table (guarded — that builder
  TOGGLES), hand the span to the log, switch the mode, open the raw layer. Two copies of four
  ordered steps is how two surfaces start landing a reader in different places. The card's
  `All charts` link went the same day: this view's RAW surface is the document, so the command
  bar's RAW toggle already is that door. **And the door remembers where it was** (2026-09-26):
  `openRecords` records the view it left in `store.rawReturnMode`, and `setSection("scene")` —
  the toggle, Escape and the layer's × all end there — returns to it and clears it; a view switch
  made inside the layer clears it too. Closing the log used to strand the reader in Snapshots.

**The motion hint says what the scene is doing while it moves** (user, 2026-09-26 — `MotionHint`,
one quiet sentence on a low plate, centred just under the command bar). Two store channels, and nothing else feeds it.
`sceneMoving` is ENGINE → REACT: the Engine's `_publishMotion` derives it each frame from the four
structures that already drive motion — `ViewTransition.active()`, `CameraDirector.flying`, the
controls' `sceneDragging`, and `TrendStackSync.settled()` where the view has a stack — and writes it
on edges only; there is no second clock. `motionCause` is WHY, stamped once per gesture by whoever
owns the gesture: the click executor for every selection (its `motionCauseOf`, the FINEST action of
the click), the store's own setters for the settings that move the scene (view, window, range,
measure, page), the Engine for a drag. `domain/motionHint.ts` turns a cause into words (tested);
names are resolved by the component through `HintNames`, so the view vocabulary stays in `views.ts`.
The line fades in after 150ms (a same-pose NUDGE never flashes it) and holds its last sentence
through the fade-out. A window pill says "Showing the last …", the range and the measure their own
sentences; a deselect names the rung it LANDS on in the select's own words (the executor restamps
a release as `finestRung`), never "stepping back".

**The History view has three axes and each has one home** (user, 2026-09-19): left/right on the
timeline is WHEN, the depth of the stack is WHO, and UP/DOWN is WHAT — the measure. Its control is
the Networks card's HEADING CONTROL (the explorer's figure heading opening `METRIC_ORDER` as a radio
list with each measure's unit at the current cadence — design 2026-09-26; `Same scale` rode the
same heading row until 2026-09-28, when it moved to the band's pill group). It replaced a `∧ SNAPSHOTS ∨` stepper, which walked a
list the reader could not see, which itself replaced the six-pill picker no other surface used:
the document lays its measures out as sections), plus `↑`/`↓` from inside a card; both write
`trendMetric` from `METRIC_ORDER` (`src/data/trendSeries.ts`), so the two controls are one list. It is a view-level control because
every card steps together (a stack whose planes showed different measures would stop being a
comparison) — it first rode the front card's header as two bare chevrons, which said the measure
belonged to that network and stepped through a list the reader could not see; then it was the view's
title under the command bar, where it collided with the rear card's header. The ends go INACTIVE
rather than wrapping (the plank's rule). A setting, not a selection: it writes its setter directly.

⚠️ **A MEASURE CHANGE IS TWO MOTIONS THAT TAKE TURNS** (`components/useStagedMeasure.ts`, user: "the
animation is not smooth … load the new chart (smoothly) and then re-order"). The cards show a
measure that LAGS the picked one: the old plots leave on a CSS transition (compositor-only — nothing
re-renders), the shown measure swaps WHILE THE PLOTS ARE INVISIBLE (the one expensive render, where
a hitch cannot be seen), the new plots ease in with the cards still in place, and only then is the
HELD order released (`holdOrder`) so the projector eases each card to its new rank. The first cut
remounted five recharts plots inside an enter animation while the stack re-ranked — three things at
once, and the stutter was exactly that. The roll is ONE attribute on the stack root (`data-roll`,
`group/stack`), read by every plot's wrapper; the title answers the press at once and the cards
follow. **A card the reader focused stays in front through the re-rank** (user, 2026-09-19): the
re-deal holds it at slot 0 whatever its new rank, and where the new order would drop it out of the
visible window the store pages the window after it in the SAME write that publishes the order
(`trendStack.scrollToKeep`, inside `setTrendIds`) — one write, so the camera's lean never releases.
A step taken mid-sequence RETARGETS, never queues; reduced motion skips the sequence (an
exit with transitions off is a 140ms blank).

⚠️ **A DRAG ACROSS THE FRONT CHART BRUSHES THE RANGE** (2026-09-26; user: "create a window also
in the main chart"). It is the document's own `onRange` gesture on `TrendChart`, and it commits
`trendRange` for the whole stack exactly as the band's timeline does. It replaced the orbit
handoff (`orbitHandoff.ts`, 2026-09-19, retired): History lost its orbit the same day
(`viewPolicy.rotate` is false — the cards hold their implied places, a click brings one forward,
the wheel still zooms), so a drag on a card was free. A click on the plot picks the INSTANT
(`onPick`); `dragged` in `TrendStack` keeps the click the browser synthesises after a brush from
also landing as a pick. Rear cards keep their bodies inert. This is also why the cards carry NO
swipe gesture: a vertical touch swipe stepped the measure for a few hours, until one gesture had
to mean two things.

**Hovering pairs over `hoverFilter`, the app's own network channel** (convention 9). A Networks row, a
plane's header strip and a cursor-card row are three ends of one pairing, with no channel of their
own: hovering any of them turns that card's hairline to its network's hue and washes the rows. The
hairline is the ONLY thing that changes — a preview that re-staggered the stack would read as a
commit, the cards are opaque so there is no opacity to lift, and `.subject-paired`'s glow is a
box-shadow, which a transformed plane may not carry.

The chain runs coarse→fine like every other rung: a lane whose committed cards abut as one body reads
adjacency as containment. (The chamber's storeys are the other way round — ribbons fall INTO the global
floor; geometry shows the fall, the rail states the containment.) The snapshot cards are slots that
ride the lane **without being focus rungs** — `railLadderBoundary.test.ts` asserts rung → slot, not the
reverse, so a slot without a rung is fine and a rung without a slot is not.

**The card grammar: ONE materialized box, unboxed entries, tucked into a SLAB.** Only the expanded rung
renders as a glass panel; every other committed rung sheds its frame into an unboxed `.rail-entry` —
solid glass, no border, chrome-less, the whole entry one stretched toggle, distance-dimmed toward the box
and released on hover as a materialize preview. Expanding an entry materializes it and dissolves the open
box — single-open accordion, so the box can be ANY committed rung, not just the focus one. Full
expand-on-hover is deliberately not done: layout shift under the pointer.

The committed rungs **abut into ONE contiguous pile** (the `.rail-ladder` lane at `gap: 0`, seams as 1px
`--border` hairlines on each member's wrapper `::before` — inset at rest, full width under hover —
interior corners squared) and the box is
**the ONE ROUNDED PLANK in that pile**, wherever the expanded rung sits: zero gap to its neighbours, but
it keeps its full radius on all four corners and its own hairline all the way round, so the pile visibly
opens around it. Its border is NOT handed to a seam the way an entry↔entry joint is — a rounded border
curves in at each corner, so it never draws the full-width division the inset-seam rule exists to
prevent; it reads as the box cut into the pile. **The stack carries DEPTH, the thread carries STATE**;
adjacency is what reads as containment, which is why the snapshot chain runs coarse→fine above. Ghosts
stay outside the slab. The block's GEOMETRY never animates (seams, corners, washes) — but since
2026-09-04 every rung's HEIGHT eases (`HeightEase` on the Inspector rung wrappers; the no-pop bullet
below carries the rules). Reduced motion snaps, so the no-op guarantee holds there.

⚠️ **The lift shadow is not the box's distinguisher and can't be** — squaring the box mid-pile was tried
(2026-08-09) and left it with no geometry at all: square corners, both borders handed to seams, and a
y-positive-only lift its own following neighbour painted over at `z-index: auto`. The box wrapper is
raised unconditionally (`position: relative; z-index: 2` — a box FIRST in the lane isn't matched by the
member+member rule and would stay `static`, making z-index inert) and the shadow casts both ways, but the
radius is what actually reads.

⚠️ **The slab keys on ONE marker, `data-tier` (`ghost` | `entry` | `box`), written by `Inspector.tsx`
from the same `effCollapsed` that decides the render** — so marker and render cannot disagree, and the
box is whichever rung is EXPANDED, never the finest COMMITTED one. `[data-focus]` here was the bug the
user reported as "a gap at the bottom to the node card, happens in many places": expand a coarser entry
and both joints around it matched no member arm and fell back to the plain gap. **The tier is what the
geometry depends on, so the tier is what the wrapper states** — `components/railTierBoundary.test.ts`
holds the two markers apart, `data-focus` to the thread's dot state and everything geometric to the
tier. The lane's DOM shape is load-bearing too: members are selected by
`:has()` on the per-rung WRAPPER divs, so **the selectors must be descendant, not child** — `RailPager`
nests the box one level deeper inside its gesture wrapper.

⚠️ **THE ACCORDION SLIDE HAS THREE TRAPS, both found by a user report (2026-09-01) and both invisible
in code review.** *(1) Sanitizing the outgoing clone strips its GROUND.* The clone drops `.ig-panel` /
`.rail-entry` so the `RailThread`'s measurement and the slab's `:has()` selectors cannot see it — but
`.ig-panel` is what PAINTS a card (glass gradient, blur, border, radius, padding), so the card sliding
out was bare text drifting over the scene: *"just text on transparent background moving quite quick,
which hurts my eyes"*. `carryLook` copies the computed look across as inline style BEFORE the classes
are dropped — the clone keeps its face and loses its identity, which is all sanitizing was ever for.
*(2) The clone REPLAYS every animation the card carries.* `cloneNode(true)` copies class names, so
inserting it restarts each one from frame 0 — the card materialize, the odometer's roll, the edge
pulse (*"it tries to rotate the metagraph header (the odometer) with the same value as it moves out,
it makes the whole card flash as well"*). And the flash was the lesser half: `cardMaterialize`
animates TRANSFORM, and a running animation OVERRIDES inline style, so for its first 0.26s the
animation — not the slide — owned the clone's transform. ⚠️ The kill must be a STYLESHEET rule
(`[data-pager-ghost]` in globals.css), never an inline pass: inline style cannot reach a PSEUDO
element, and `.edge-pulse::before` runs one, measured still pulsing on the ghost after the inline
version shipped. The attribute also survives `clone.style.cssText = …`, which replaces the whole
inline style and silently discarded the inline version's work on the root. *(3) The lane's height
jumps the instant the slide starts.* The clone is absolutely positioned so holds
no height, and the store commits synchronously, so the slot becomes the NEW card's height while an
820ms HORIZONTAL slide is only beginning — everything below jumped (*"things jump vertically"*).
`commitStep` pins the old height before the swap and eases to the new one on the slide's own clock, one
frame later (the new height is unknowable until React has painted it). Both restore in `fin()` beside
the position/overflow it already saved.

⚠️ **A FOURTH, 2026-10-03 ("the swipe left/right on the card has some flashes"): THE SLIDE'S
HOVER-INERT WINDOW HAS TO BE STATED IN CSS.** `commitStep` set `pointer-events: none` inline on its
wrapper, and the panel inside carries its own `pointer-events-auto` (it must — `#rightcol` is
inert), so the card was never inert at all: as the lane's height eased under a resting pointer it
took the hover, wore the pairing ring for ~45ms (its explorer row and scene tile with it) and
dropped it. The wrapper is marked `data-sliding` for the window and globals.css carries it past
the class; the same rule holds the incoming card's hover edge dark (a LATCHED `:hover` lit it on
mount), and the ghost is pointer-inert and edge-less by its own rule. The same report turned up
two neighbours: `HeightEase` opens an expanding rung's `data-arriving` window WITH THE COMMIT (a
frame later, the fresh box took the pointer and blinked its ring on, off, on), and `RailShade`
is `flex-none`, never `min-h-0` — shrinkable, it made `.rail-clip` flip every frame whenever the
cards overran the lane by less than `--rail-fade`.

**The pull SHOWS THE NEIGHBOUR** (`showPeek`, 2026-09-01 — user: "the new card only appears after
I've moved the old card … I expect to already see it appearing before that"). A card-shaped peek
carrying the incoming sibling's NAME rides the same damped travel, one width out on the side it will
arrive from, so the pair moves as one strip and the pull reveals instead of merely resisting.
⚠️ **It is a placeholder, and that is the honest ceiling.** The lane renders exactly ONE live card,
whose body is built from the COMMITTED subject — a sibling's body does not exist until its commit
runs, which is precisely why the accordion clones the OUTGOING card rather than pre-rendering the
incoming one. Showing real content would mean rendering a card for an uncommitted subject; that is a
different piece of work, not a tweak to this one. The peek is built imperatively for the same reason
the drag transform is: a pull touches the DOM and never React state, so a 60-120Hz gesture cannot
re-render a subscribed card. It carries `data-pager-ghost` too, so it neither animates nor is heard.

Two details the first cut got wrong, both reported: it offset by the card's WIDTH alone, butting the
two flush — a rhythm the app uses nowhere, since stacked panels breathe by `--rail-gap` and a card
never sits tight against anything. The gap is READ from that token (and the commit slide takes it
too, so the release continues the gesture's spacing rather than changing it). And it appeared at full
strength the moment the drag engaged, which read as the next card having already won while the card
under the finger — still the live one — read as discarded. Its opacity now rides the SAME progress
the commit does, on a smoothstep, reaching full exactly at `STEP_PX`: faint through the early travel
a cancel lives in, present only once the step is certain.

**The box can carry a SIBLING PAGER** (`RailPager`): where the expanded rung has 1-N siblings under the
same committed parent, a slim `‹ n / N ›` plank rides the card's OWN bottom edge, inside the glass, plus
a horizontal swipe on the body. The set comes from the pure resolver `railSiblings.ts` and every step
applies `pickActions` through the one executor, so a pager step and the equivalent explorer click can't
drift. The plank stays chrome-less by the same grammar rule — no fill, no border, no frame of its own —
and the card reserves its strip with a padding utility (see CSS trap 1). It does carry **one inset
hairline** dividing it from the body (2026-08-10): once the foot became a small muted mono column, a
CONTROL sat directly under DATA at the same weight and read as one more foot row. That rule is the same
device `Foot` uses at the same inset, which is the point — **every resting division in a card shares one
left/right edge, and the inset is ARITHMETIC**: the pager's wrapper is the positioning containing block,
so an absolute inset measures from the card's BORDER box and the correct value is 1px border + 18px pad
= **19**, matching the head rule and the `Fact` separators. Both the hairline and the plank row use it;
at 18 the hairline overhung the separators by a pixel and the chevrons' hover wash overhung the content
edge. **The gate is BOXED and nothing else**
(an absolutely-positioned plank over a ~28px collapsed entry is a defect; single-open already makes the
box unique) — it is the tier's own `boxed` condition, and `railTierBoundary.test.ts` pins that the two
can't drift. Keying it to the FOCUS rung was the same mistake `data-tier` fixed above, and it also shut
out the two snapshot slots, which ride the lane with no focus rung at all.

**The plank also carries the LADDER PAIR** (`∧ ∨`, 2026-09-11 — the user liked the sibling swipe
and asked for the vertical axis; a vertical SWIPE was rejected together because it fights the
rails' touch scrolling and the sheets' drag gestures, so it is buttons): ∧ re-boxes the next
coarser COMMITTED rung and ∨ the next finer one — the accordion's own `toggleCollapse`, committing
nothing, with the camera and callout following the box as always — and where nothing finer is
committed, ∨ falls through to `childStep` (railSiblings.ts, tested) and COMMITS the rung's FIRST
child in the explorer's own order ("just pick the 1st one"). A rung with no child vocabulary
(a node, the ledger's network — its finer subjects belong to the tick axis) disables the control.
A metagraph snapshot's ∨ opens its first VALIDATOR (2026-09-29), and the node card under it pages
only the nodes that signed it — `snapshotSignerRows` (`src/data/network.ts`), the same list and
order as the explorer's signer level, so the two can't disagree about who signed. The sibling trio is CENTERED as one cluster with the ladder pair at the
right, told apart by WEIGHT rather than a divider (2026-10-03, option B of
`docs/superpowers/design/2026-10-03-card-pager` — user: "a lot of <> and ^^, and also / and |"):
the pair is drawn smaller and quieter, and **the position is DRAWN, not written** — one small
square per sibling with the current one lit (the cards' own unit marks), never digits or a slash
— a set past fifteen slides a fifteen-wide window that follows the current square, its ends drawn
small where more lie beyond (`positionMarks` in railSiblings.ts; user, 2026-10-04, retiring the
"n of N" words as the one card that read differently). The two axes still never read as one four-way control — and **an
exhausted direction is INACTIVE while an axis with nothing to ever navigate is ABSENT** (user,
2026-09-11, two rounds; supersedes 2026-09-03's invisible rule, which predates the pair): a
direction that ran out mid-set dims — a vanishing chevron re-composes the row at every edge,
and the dimmed state reads as "the control exists, the direction is exhausted" — while a card
that is the only record at its rung shows no trio at all, and one with no ladder step shows no
pair. Permanently dead chrome is not a control.

**Ladder steps are QUIET, and the quiet is PROVENANCE, not a timer** (user, 2026-09-11, four
rounds ending in "solve it structurally"): `store.navQuiet` records HOW the current state was
reached — set true by `toggleCollapse` (any manual expand — the never-roll-on-a-manual-expand
rule the retired About card first set) and by the one executor when a caller passes `quiet` (the
plank's first-child ∨); reset false by every ordinary commit, by `setMode`, and by the
`advanceSnap`/`advanceMetaSnap` heartbeat writes (a new tick IS an arrival — without that
reset a stale quiet suppressed every later live-advance roll). `CardHead.useRolledTitle`
freezes the answer per (mount, titleKey) via `getState` — no subscription, no re-trigger by
class change — so a card mounting seconds late off a quiet gesture still skips its roll while
explorer clicks and the ‹ › sibling steps keep theirs. The `data-stepping` attribute is the
separate MOTION window (lane-owned timer on the `--tempo-roll` token; the sibling slide arms
it on its own clock): it gates only the hover TREATMENTS — entry lift, seam reach, whisper,
copy reveals — because a latched `:hover` survives `pointer-events` changes; it deliberately
does NOT make the lane pointer-inert (clicks would fall through `#rightcol` to the canvas).

**A pager's parent scope is whatever the step must NOT change, which for the metagraph snapshot makes it
a PAIR — this metagraph × this tick** (user, 2026-08-09). The set is the subject's own `metaId` rows of the
pinned tick's exact read, ordinal-desc, never every contributor: a cross-network step would change WHICH
NETWORK the card is about, a coarser fact than the swipe names. The explorer still LISTS every network
under a tick, but it doesn't commit one either — its network rows open and preview only, so both
surfaces keep the same boundary (and since 2026-09-26 neither surface moves the filter at all —
`metaSnapSelectActions` lost its filter-first arm, design decision 13). And the pair is the honest total
— a fast metagraph batches dozens of snapshots
into one tick (DOR routinely 9-plus), so a tick-wide `N` would contradict the breakdown pills.

**The global snapshot's set is OPEN** (user, 2026-08-09): time is ongoing, so the same plank steps one
tick at a time but shows **no `n / N`** — a window into an unbounded chain has no total to state, and
`SiblingSet.open` is what says so. The plank is a nudge to the adjacent tick: it steps the retained
global window (the same buffer the vitals band's tick chart plots) oldest→newest through the same
descriptor the old strip's bar click built (the chart is non-interactive now, 2026-08-30 — the plank
and the explorer rows ARE the tick-stepping routes), so stepping back from the front pins and stepping
onto the live tip resumes following; a pin aged out of the retained window gets no pager rather than a
guessed neighbour.

**Expanding a rung's card FLIES THE CAMERA to it** (user, 2026-08-09 — "we do the same when we click a
row in the explorer"): the box is the subject, so it gets the subject's pose. `ladderLevelOfSlot()` in
`railCards.ts` is the inverse of the lane's slot table, so a card can only ask for a pose a real rung —
and therefore a real resolver — already defines, and the two snapshot slots (no rung) ask for nothing.
The request rides one store channel, `focusRung: { level } | null` (an OBJECT, so re-expanding the same
rung is a fresh reference the Engine's `!==` bridge sees), and `Engine._resolveFocus(from?)` starts its
existing ladder walk at that named rung instead of the finest. No second camera path.

**Expanded state survives a view switch** (user, 2026-09-04 — reversing 2026-08-08's scene-first
collapse: with rung heights easing, the collapse-and-reopen cycle WAS the "card size jumps between
views"): a switch is arrival machinery, not a selection moment, so the +/− overrides hold through
the mode change and its grace window, and only a post-window selection change resets them to the
only-the-focus-rung-open default. Both live-advancing ordinals stay guarded in the selection key so
heartbeats never materialize a card. Conversely **the heartbeat is felt on closed
cards**: both snapshot asides carry the beating dot and are the same tap-to-follow toggle, but **only
one of them owns the clock.** The global aside ticks a `live · Xs` counter (the shown snapshot's age,
never overstating); the metagraph aside says **`anchored to N`** whenever the card above already shows
the very tick it anchored into — the anchor join is exact, so a counter there would be the same number
twice. It falls back to its own counter when that carries real information: a global ghost, or
following a lane through anchor-less global ticks, where this card holds an older tick. **The
anchoring ordinal rides all three states** (`anchored to N` / `live · Xs ago → N` / `◷ Xs ago → N`),
because the two counter states are precisely the ones where the card above shows a *different* tick, so
the number is then the only thing saying which global this snapshot landed in. It moved into the head
from a body row on 2026-08-10 — a join is not a fact ABOUT the snapshot, it is the relation the aside
already names — and the metagraph TICKER that shared that row went with it under the pile rule, since
the METAGRAPH card sits directly above and this card's own mark already carries the hue.

**An ordinal is written BARE — no `#`** (user, 2026-08-10). Every surface that renders one as a value
already did (the snapshot card titles, the explorer rows, the anchor-log cells, the old strip's tooltip
head); the sigil only survived where a number got glued into a sentence — this aside, the raw layer's
channel pane head, the pager's step labels, the ledger explorer's tooltips and the scene tooltip. It is
noise in all of them: the label beside it already says what the number is. Internal `PickDescriptor.title`
strings still read `Global snapshot #N`, but nothing renders that field for a snapshot.

Every card the current view CAN produce is always visible — populated when its subject is selected,
else a **ghost card** — so the rail shows the view's whole possibility space and a deselect returns
its slot to the ghost in place. A ghost is a card like every other (user, 2026-10-04 — option A of
`docs/superpowers/design/2026-10-04-ghost-cards`, "the structure is always present, but the visual
and content differ"): FOLDED it is the rung's name alone, one quiet line; OPEN it is a dashed,
glassless box whose body is the hint. It opens on its own, outside the single-open accordion — it
holds no subject, so reading a hint never dissolves the committed box, its callout or its camera —
through the same per-selection `railCollapse` override, so a new selection folds it back.

**A hint is the gesture and nothing else.** The slot label already names the subject and the dashed
frame already says "nothing here yet", so a hint must not end "… to inspect it" — four ghosts stacked
in a rail would read as one sentence repeated with the verb swapped. Each names its own route, and
where a subject is reached from a parent row the hint says which ("under a country"), stating in words
the containment the slab shows.

Two honesty rules: when the filtered network has nothing pickable in geo the node ghost turns into the
honest variant naming that fact; but "all" with 0 nodes is boot, so that ghost stays silent rather than
flashing a false invite. A populated card renders in any 3D view; the ghost only appears where the view
can actually produce the card.

**The placeholder views host NO facts cards at all** — `detailsCards` returns `[]` outside the 3D
views (user, 2026-08-10). A live node card, status pill and real ids beside a `preview · in development`
wireframe is exactly the mixed signal rule 10 exists to prevent, and it arrived half-formed anyway: with
no ladder for those views every present card fell through to Inspector's trailing non-ladder pass, which
excludes the context card, so the node card rendered with **no network plank above it** — and correctly
re-grew Country and Hosting, since the pile-dedup rule found no ancestors. It is a view gate, not a
selection change: the store is untouched, so returning to a 3D view restores the whole pile. This
matches the left rail, which shows no tool card there either.

**Bottom — the VITALS BAND** (`components/VitalsBand.tsx`, 2026-08-30 — the vitals left the crowded
command bar; docs/superpowers/plans/2026-08-30-vitals-bottom-band.md is the plan). A slim full-width
row of **read-only info cards**, one set per STRUCTURAL 3D view (History's band holds the timeline
instead — see the `bandContent` rule below): hyper leads with a composition DONUT (the four
counts are shares of one fleet — the one honest home for a donut) plus its legend; geo shows its
footprint numbers plus a nodes-by-country micro-bar row; the ledger shows its two rate cards (number +
sparkline off the live buffers) beside the declicked tick bar-chart. This deliberately widens the old
snapshots-only rule (2026-08-12): each band is the view's OWN vitals — the numbers the bar's vitals
region used to show — so nothing generic returned. **The band's plate takes no pointer events**
(`pointer-events-none` — user: "no clicking etc required"): every route the old strip's clicks served
survives in the explorer rows and the global card's pager. **No exceptions in the structural
views**: the band carries no link to the History view (user, 2026-09-19 — the command bar's view
switch opens it at every width, so a tab on the band was a second door to the same room); the
band's one interactive tenant is the History view's own timeline (`bandContent === "timeline"`).
Colour is rule 3's: structural cyan, the
identity hue only under a committed filter — resolved once per band (`useVitalsScope`) and handed to
every chart as its `accent` prop; the band wears NO filter-scope hairline (user, 2026-08-30 — the
charts themselves state the scope). Identity is never colour-alone — every donut segment, country bar
and rate is named by its own label. Both presentations (the desktop band and the phone strip row)
render ONE `ViewCells` dispatch, so a cell added or gated reaches both in the same edit; the ledger
row reads the snapshot feed ONCE and passes it down.

The cells are per-view and ordered by the user (2026-08-30): hyper coarse→fine (METAGRAPHS with a
by-type breakdown — `networkKind` is the type's one home, icons from `METATYPE_ICONS` on the
filtered face — then NODES, the NODE COMPOSITION donut, NETWORK LAYERS as RoleChips micro-bars);
geo pairs each total with its breakdown (NODES · TOP COUNTRIES · TOP PROVIDERS — the first two
renamed/reshaped 2026-09-01: NODES gained a located/unplaced split, because a card with no breakdown
is the boring case by construction and that split is the one breakdown belonging to THIS view rather
than its neighbours — a node the lookup could not place sits in no country ring and no provider ring,
so it is also the basis both cards beside it silently assume; and "nodes by country" became "top
countries", since the card shows three plus a remainder and the old name promised the whole
distribution); the ledger leads with WHO (METAGRAPHS ANCHORING, exact from the anchor index, with
identity dots) then the rates (number + stretch sparkline, units spelled `/hour`) and the
declicked tick bar-chart, which is **STACKED per metagraph when unfiltered** (user pick,
2026-09-01 — every metagraph, always, not a top-N). The bar's HEIGHT is unchanged, so it reads as it
always did at a glance and gains WHO underneath. Three rules keep it honest: the segments must SUM
to the bar, so whatever `metaCounts` could not attribute is drawn as its own neutral segment rather
than dropped (the donuts' `other` rule); a tick with no attribution is not a tick with no anchors,
so it paints whole in the accent — "this many anchored, by whom is not known here"; and order is the
CATALOG's, never the per-tick counts, since sorting by size repaints every bar as the window shifts
and a segment that moves cannot be followed. Identity is not colour-alone: the METAGRAPHS ANCHORING
card immediately to its left is the legend, reading the same `getAnchor(...).metaCounts` and the same
`identityHudCss` hues, named sr-only.

**A TOTAL LIVES INSIDE ITS OWN BREAKDOWN, AND LEADS IT** (user, 2026-08-31): a bare number card
beside the list that breaks that number down says the same thing twice, so `COUNTRIES` folded into
nodes-by-country and `PROVIDERS` into top-providers, and hyper's `NODES` went entirely — the
composition donut already totalled the same fleet. The merged shape is `DonutTotal` + `MicroBars`:
ring, then the total at the band's own number size, then the rows. Two rules hold it honest — the
ring must PARTITION the population, so a top-N chart carries its remainder as an `other` segment
rather than drawing three slices as the whole; and the total is the LARGEST type in the card, never
the smallest (it briefly sat in the 44px donut hole at 11px, which made merging a demotion).

**A card is TWO SEGMENTS: a LEAD and a DETAIL, split by a hairline** (user, 2026-09-01). The lead is
the headline total the card exists to say; the detail is its breakdown. `BandCard` takes the lead as
a prop and the detail as children, and draws the divider only when both are present — either may
stand alone (geo's `NODES` is lead-only; `NETWORK LAYERS` and PulseStrip's poll cards are
detail-only). Three rules keep the row from going ragged, and all three answer the same complaint
("the details are right next to the total while there is a lot of white space on the right"):

- **`size` is the one width vocabulary** — `sm` (one reading, no breakdown) / `md` (a reading and its
  breakdown) / `lg` (a chart that reads better wide). It replaced six hand-picked flex values that
  each encoded a guess about one card's content. **Every tier keeps an `auto` basis**, never
  `basis-0`: a share computed with no reference to the card's content is what clipped the rate cards'
  extrapolation note off the plate at tablet width. **And every tier has a CEILING** — without one an
  `md` card grows to whatever the viewport gives it, and at 1600px three of them each held ~500px
  with a void between lead and breakdown. Past the ceilings the row centres; below them the cards
  still span margin to margin, so the centring is a no-op wherever width is scarce.
- **`MicroBars`' track is proportional but CAPPED** (`BAR_TRACK_MAX`), and the block is sized to
  what its rows can spend and marked `data-fit`, so `BandCard` shrinks the detail to it and CENTRES
  the whole body — lead, hairline, breakdown — in the card's share (user, 2026-09-29: "centered in
  their allocated space"). The phone sheet's uncapped column keeps filling (its own tier). The
  original 72px constant made every bar row intrinsically sized, which is where the dangling white
  space came from; an uncapped track is the opposite failure — a bar running the width of a 1600px
  row stops reading as a quantity.
- **A card may merge a claim with its EVIDENCE.** Hyper's type and layers were two cards until
  2026-09-01, when the user pointed out they are one reading: "the type is the 'total' and left
  section, while the layers are the details that confirm that type — e.g. a 'data' type has a number
  of L0 and dL1 layers and 0 cL1". Split, the reader had to carry the type in their head to the card
  beside it. Merged, the lead states the characteristic and the breakdown evidences it — which is what
  the two-segment grammar is for. It merges only under a COMMIT: unfiltered there is no single type to
  lead with, so the layers keep a card of their own.
- **An instrument CLAIMS the card's height.** The body is `items-stretch`, `MicroBars` distributes
  its rows with `justify-evenly`, and the charts fill rather than sitting at a fixed box. Once the
  band went to a fixed `--vitals-h` the leftover showed up as dead bands above and below every
  reading — a four-row card filled its body while a two-row one floated in the middle of one. Watch
  for wrappers BETWEEN the body and the instrument (the country card has one): they need
  `self-stretch` too, or the rows bunch inside a content-height box while their neighbours breathe.
- **A sparkline is bucketed, not sliced** (`Sparkline maxPoints`) — bucketing by mean keeps the
  window and lowers the frequency; slicing would silently shorten the window the rim states. A
  null bucket breaks the line (hole ≠ zero) and an isolated measured point draws a DOT
  (TrendChart's device — under connectNulls=false a dotless isolated point paints nothing).
- **The band's height is FIXED** (`--vitals-h`), not content height. Left to its content it measured
  81 / 72 / 62px across hyper / geo / ledger, and since the band is anchored at the BOTTOM that
  showed up as its top edge jumping on every view switch.

⚠️ **THE OPACITY LADDER IS THE DONUT'S ALONE.** `MicroBars` mirrored `DONUT_STEPS` until 2026-09-01
so a ring beside rows had a key — but only the cards WITH a ring passed them, so `Node composition`
ran bright→faint beside `Network layers` running flat, and two cards in one row read as two different
hues of one token (user). Adjacent arcs of a single colour genuinely need separating; labelled rows
do not — every row is NAMED and the slices are in the same order, which is how a legend works.
Don't reintroduce per-bar opacity.

`compositionCounts` lives IN VitalsBand (its one consumer since the
top-bar cluster retired). The band dims with the rails on `useSceneYield` and its plate is the
command bar's own `--topbar-glass`. **Its horizontal inset is `--bar-margin`, the COMMAND BAR's own**
(user, 2026-09-01: "the bottom bar should be the same exactly as the top bar") — one token read by
both, resolving to `--rail-margin` at desktop, where the band's edges must align with the rail cards
and clear the RailThread rulers, and to a wider 16px below 1100px, where the rails are edge tabs and
there is nothing to align with.

`BottomStream` is the **one publisher**: it both mounts the band and writes `--bottom-reserve`, from
the one policy flag `VIEW_POLICIES[mode].vitalsLane` **AND three deliberate gates** — the scene pose
(user, 2026-08-15: the raw layer pages history the lane wouldn't describe, and needs the space), the
rails (user, 2026-08-30: presentation mode shows just the 3D, so rails-hidden hides the band too), and
the phone (the dock + sheet own that edge; the dock's own VITALS section hosts the SAME cards as
a full-width stack — `VitalsDock` + `VitalsSheetBody`, since 2026-09-03; the filter strip's
second row was their first phone home and was retired the same day, because riding the top bar's
one grow-downward slot surfaced them under WHICHEVER strip opened, the pulse strip included).
Presence and
reserved space can't drift once hydrated; the token's static default in `globals.css` is the band's
own reserve (**`112px`**), matching the BOOT state (hyper's lane is on, SSR assumes desktop) so the
rails keep clear of the band before the effect runs. The SCENE⇄HUD toggle is the one `railsHidden`
writer, and it clears its own state when the viewport drops below 1100px — below that the control is
CSS-hidden and SCENE has no meaning, so a stuck `true` would strand the band and the camera's
rails-lean with no visible way back.

⚠️ **THE BAND'S CONTENT IS A POLICY ROW, AND ITS ONE INTERACTIVE TENANT IS THE TIMELINE**
(2026-09-18). `vitalsLane` says whether the band MOUNTS and reserves space; `bandContent`
(`"vitals" | "timeline"`) says what it HOLDS — two questions, two rows, because the History view
answers them differently: it mounts the same band at the same `--vitals-h` behind the same
`--bar-margin`, and fills it with `components/TrendTimeline.tsx` instead of read-only cells. The
dispatch is the ONE `ViewCells` function, so the desktop band and the phone Vitals sheet can never
hold different things, and the gate is the policy row rather than `mode === "trend"` (convention 7 —
a sixth view must answer for itself instead of inheriting "vitals" by silence).
**The plate stays `pointer-events-none`.** "No clicking etc required on any visualization here at
the bottom" (user, 2026-08-30) is a rule about VITALS, which are readings; a timeline is a control,
and a track you cannot press is a picture of one. So the timeline re-enables pointer events on ITS
OWN ROOT and nothing else — every other view's band keeps the charter and the orbit drag keeps
passing through. The sheets' `sceneCover` clip still governs it: measured, a covered strip hands
both paint and hit-testing to the sheet above.
**The Time range group stands above the band's right corner again since 2026-10-03** (user: "what about moving the time-range control just above the vitals section, right side?" — it was inside the band, on the left, from 2026-09-29; `TrendTimeline` records all three placements and why, without the "Time range" words: "it's obvious"). The original note: **The track takes the whole band and the window pills stand above its top-right corner** (user,
2026-09-26, two rounds — first over the corner, then "above the bottom section, not on top of it";
the band's clip opens its top edge for them, and `BottomStream` reserves their room while the
band holds the timeline). The band held three columns — the track, a CURSOR readout with a 16ch reserve, the
pills — and the two side columns cost the track a third of the lane. The readout is gone: no cursor
line IS "none picked" (the brush's own rule for ALL), and a picked instant is stamped on the track
beside its line, low by the handle where the pills cannot cover it, flipping to the line's left near
the right edge. On the phone arm the pills keep their own row above the track.
**The gesture split is the decision: a CLICK sets the cursor (`trendCursorMs`), a DRAG brushes the
range (`trendRange`)** — press inside the span ON SCREEN to pan it, press an edge to resize it, `×`
or Escape clears it. ⚠️ **What is DRAWN is what is GRABBED** (`drawnSpan`, one function read by both
the paint and the hit test): the track shows `trendRange` when one stands and otherwise the span the
window pill implies, and computing those two separately left the visible rectangle ungrabbable in
five of the six window states. Panning or resizing a window-implied span COMMITS it as a range —
that is what the gesture means. Both gestures want the whole track and the alternative (a modifier
for one of them) is unreachable on touch, which is the surface this most needs to work on; TRAVEL is
the one discriminator every pointer type reports. The cursor is a COMMIT — it persists when the
pointer leaves, because the rail reads it — while hovering previews a faint line locally and writes
nothing (rule 9). Every decision a pointer makes is pure and tested in
`src/data/trendTimeline.ts`; the component is a shell over it, split in two at ~300 lines —
`TrendTimeline.tsx` is the band TENANT (which payload, the readout, the pills, the honesty
states) and `TrendTrack.tsx` the INSTRUMENT (the SVG and every gesture), because the track's whole
subject is a geometry it measures itself and nothing above it has those numbers. The window pills
are shared with the Trends document through `components/trendPickers.tsx` — the two had already been
caught drifting once (user, 2026-09-09), so the class strings have one home, and since 2026-09-19
the setting SWITCH and the document's scope CHIP live there beside them for the same reason (the
METRIC picker left on 2026-09-26 for the explorer's heading control).

**THE SCRUB IS THIS VIEW'S PRIMARY GESTURE, AND FOUR SEPARATE MEMO FAILURES MADE IT UNUSABLE.** All
four were invisible in review and visible only in a frame counter, so they are recorded with their
measurements — this is the shape the next one will take too.

⚠️ **The scrub writes ONCE PER BUCKET, not per pointermove** (`sameBucket`, both gestures): the whole
stack subscribes to `trendCursorMs`, so every write re-plans the fetch and repaints five charts,
while two instants inside one bucket paint the identical frame. Measured on phone, a 300-event
precise scrub went 271 writes / 1084 slice assemblies / 2.9 FPS → 45 / 0 / 9.8.

⚠️ **A memo is only worth its key.** Two references were being rebuilt on the very renders the
memos existed for: the shell's `leadingTrim` call (it returns its input unchanged ONLY when there is
no leading gap, and the live `all` window always has one), and the stack's triple `metricSeries`
pass. Both are memoised — and instrumenting the scrub turned up a third, a LAYOUT one: the cursor
readout was content-sized beside a `flex-1` track, so a stamp changing width re-measured the track
and re-derived its whole x↔ms geometry mid-gesture. A value slot reserves its width (the `NodeStars`
rule, reaching a committed value). Across a 200-event scrub: `metricSeries` 8262 → **0**,
`globalSeries`/`trackRuns`/`axisTicks` 306/334/334 → **0**.

⚠️ **The charts themselves were the rest of it — the cursor is DRAWN OUTSIDE the memo** (2026-09-19).
With the shared cursor as a recharts `ReferenceLine`, a bucket write re-rendered all five planes'
charts: measured over a 60-step scrub of the `all` window at 1500×1000, **22.1s / 2.7 FPS / 600 plot
renders → 1.4s / 40.7 FPS / 0**, and the hover sweep over the Networks rows **8.0s / 2.7 FPS / 220 →
0.44s / 36.5 FPS / 0**. Two halves, both structural: `TrendChart`'s recharts subtree is a
`React.memo` child (`TrendPlot`) whose props are the SERIES alone, and the cursor is a 1px CSS
overlay beside it, positioned by `cursorFraction` over the chart's own numeric axis — `calc()` on a
percentage of the plot box, so it needs no measurement and rides the plane's projected scale for
free. `components/trendStackBoundary.test.ts` pins both halves, and the plot box they rest on: the
chart keeps `<YAxis hide` (a shown axis would reserve width) and the one `PLOT_MARGIN` that both the
plot and the overlay inset by.

⚠️ **A memo is only worth its PROPS, and a hook that composes a fresh view object every render
defeats one silently.** `useTrendRoster` runs its expensive pass in a `useMemo` and then returns a
`{…}` built from it — which for one round was a new reference on every render, so a consumer's
`useMemo([roster])` could not tell content-free churn from a real change, and the first cut of the
measurement above came back no faster at all. The hook memoises its RETURN as well, on the pass plus
stable or primitive fields, so `roster` itself holds still and a consumer may depend on it or on
`roster.rows` alike. Keep it that way: every field it returns has to be the memoised pass, a
reference its caller holds still, or something derived from a primitive dep — a field computed
inline in the return would quietly restore the bug for every consumer at once.

### Boot entrance, routes & the doc overlay (2026-09-04)

**Adding a view is registry-driven — consistency is the default, not a checklist.**
- A **3D view**: `Mode` union → a `viewPolicy` row (convention 7: inert until it opts in) → a
  `focusLadder` row → a `SceneView` (rule 6's contract) → a `VIEWS` entry in
  `components/views.ts` (name + slug + desc). The bar button, the route (`app/[view]` +
  sitemap read `ROUTED_VIEWS`), the footer link, the gather/entry choreography, boot staging
  and the URL bridge all follow from those homes.
  **History proved it** (2026-09-18): a fourth view landed through exactly those registries plus
  `cameraRig`'s `FOCI`/rest-pose entry and a `sceneRig` row, and the policy row grew six fields
  rather than the app growing six mode compares — `fleet` (placed or parked), `rawSurface` (which
  register RAW shows), `chartStack` (does the DOM plane layer mount), `autoRotate` (does the camera
  idle-orbit; it replaced a `mode !== "geo"` deny-list that had already silently handed the new view
  hyper's spin), `bandContent` (vitals cells or the timeline) and `show.trendGround`. Each is the
  same move: a question the app was answering by silence becomes a question every view answers.
- **The placeholder is ONE view** ("soon", consolidated 2026-09-04 — three modes said the same
  nothing three times): one dimmed "Coming soon" bar entry, one FLAT policy row, and the
  Blueprint GALLERY inside it previews every coming feature (each keeping the mark it wore as a
  bar button). A future placeholder is a gallery entry, not a Mode.
  **The gallery is DRAWINGS ONLY on a loose table** (user, 2026-10-02 — option B of
  `docs/superpowers/design/2026-10-02-soon-gallery`): no names, icons or captions, the wireframes
  at different sizes and slightly turned with empty dashed frames among them, so nothing reads
  as first — a captioned row was a roadmap. Static, takes no pointer events; a tall arrangement
  on phone keeps clear of the parked node columns.
- **The doc pages' one door is the footer's About · Design row** (2026-09-28 — user: "doc pages
  are not settings"; they rode the SettingsMenu as a Pages section from 2026-09-08 until then,
  and `InfoMenu.tsx` retired with it). The in-view ABOUT row in the bar is orientation for the
  current view, not a doc page.
- A **doc page**: one `DOC_PAGES` entry (everything derives: type, paths, titles, docForPath),
  its component in `components/docs/` + one line in DocLayer's `DOC_COMPONENTS` map, a thin
  route file passing `doc`, a footer `DocToggle`. The engine's bare stage, both transition
  signals and the roll grammar follow automatically; the store's `docPage` union is the one
  deliberate duplicate, and tsc flags it the moment the registries disagree.
  ⚠️ **The registry is for PROSE OVER THE BARE STAGE, and nothing else** (2026-09-18). A document
  that is a VIEW's second register is not a doc page: it belongs to the raw layer, through that
  view's `rawSurface` row. The Trends document was a third entry until History became a view, and
  the two flags it needed there — `scoped` (keep the bar's filter up over it) and `routeless` (no
  URL of its own) — were removed with it, since RAW gives both for free. Don't reintroduce either.

- **The HUD arrives staged** (`useBootStage` + `BootFade`, wired in `AppShell`): command bar when
  the engine is up (or failed — chrome is controls), rails/dock/footer on first data, vitals band
  on live; latched, paced `STEP_MS` apart, force-completed by an 8s timeout so chrome never hides
  behind a dead feed. `BootFade` is a plain opacity wrapper (trap-2 safe, `inert` while hidden) —
  never add a transform there, RailThread measures rects mid-fade.
- **`AppShell` is the app** — `/`, `app/[view]` AND the doc routes all render it; `RouteSync` is
  the URL↔state bridge (seed mode on mount, shallow pushState for `docPage ?? mode`, popstate
  back), `components/views.ts` the one view/doc vocabulary home (TopBar's VIEWS lives there).
- **/about and /design are the DOC OVERLAY, not pages** (user: footer navigation must not reboot
  the engine, and the live scene is the backdrop): `store.docPage` + `DocLayer` (scrollable
  veil over the scene, Escape closes; content in `components/docs/`, dynamic-imported so the
  chunks split; the routes pass `doc` so /about's prose still server-renders for crawlers) +
  `DocGate` (rails/dock/band/callout/sweep UNMOUNT while open — BottomStream's cleanup zeroes
  the reserve, which also folds the footer tuck). TopBar hides its scene-action controls
  (filter, presentation) while a doc is open; `setMode` closes any open doc by design. The
  /design specimen's generic hue is allowlisted in `noHardcodedColors.test.ts`.
  **The doc's edge rulers are `RailThread standalone`** — the SAME component, deriving its x
  from `--rail-margin` instead of measuring the (unmounted) rail columns, rendering ruler +
  identity spine with no card marks; DocLayer keys its `signal` prop on the RISEN document so
  the travelling switch-pulse plays on each arrival. Two wrong cuts preceded it the same day
  (column-flanking spans; an `.ig-sheet-edge` reuse whose comb pointed the wrong way) — the
  rails belong at the VIEW edges, drawn by the one existing instrument, never re-built.
- **The footer is a full-width strip, one row, one separator species (the mid-dot)**: view links
  (`FooterViewLinks`, store-committed) · About · Design (store toggles via `DocToggle`) ·
  Source code (octocat) · Constellation (the $DAG mark + siteUrl via `metagraphById("dag")`).
  In-app it tucks `min(10px, --bottom-reserve)` under the vitals band (the corner-notch fix) and
  the band sits flush on it. The brand waveform's one `d` is `components/brand.tsx`.
- **The vitals band does NOT inset by the tablet sheets** (user reversal, same day it shipped):
  the sheets overlay both bars alike; `sceneCover` stays published for the callout — and the
  band **CLIPS its paint by those covers** (user, 2026-09-04: "flickering when the explore and
  bottom bar overlap" — the sheet's glass is translucent, so a band still painting under it
  bled through as shimmer on every tick and a double-exposure under the yield dim; the
  clip-path rides the covers with CSS max() so desktop/phone's 0 cover is identity).
  ⚠️ Its transition is ONE `[transition:…]` arbitrary property on purpose: two `transition-*`
  utilities in one `cn()` are a twMerge group, so the later silently DROPS the earlier (the old
  `transition-[left,right]` died this way under `transition-opacity`, found by reading the
  computed style), and the comma'd `transition-[a,b]` arbitrary-VALUE form is the DocLayer
  compile trap besides. `motion-reduce:!transition-none` needs its `!` against an
  equal-specificity single class (trap 4's family).
- **The tempo family is tokenized** — `--tempo-beat` / `--tempo-signal` / `--tempo-roll` (0.65s,
  with `--ease-roll` its one ENTRANCE curve — exits keep ease-out) in globals.css `:root`, plus the
  text-arrival pair `--tempo-doc-sheet`/`--tempo-doc-rise` and the card lag `--tempo-roll-lag`;
  the 150ms disclosure clock deliberately is not (its header says why). Titles (`.roll-in`) ride
  the text clock; the odometer keeps `--tempo-roll` — digits are an instrument, not arriving text.
- **THE NO-POP RULE** (user, 2026-09-04, several rounds): a view-scoped HUD surface never pops on
  navigation, and **the swap unit is what CHANGES, not the zone**. Fully view-scoped content (the
  vitals cells, both presentations) takes `components/RollSwap.tsx` — out-beat then keyed arrival
  in tw-animate's own vocabulary; render from the KEY, never live state; the vitals' `[&>*]` cell
  rules ride the wrapper or it becomes their subject. A surface with a PERSISTENT resident reads
  the rule per card: the explore rail keys only the view-scoped tool card, transform-free (a
  materialize's scale visibly pulls a tall card's top edge; the About card that once persisted
  beside it retired 2026-09-28). HEIGHTS ease everywhere via `components/HeightEase.tsx` (every Inspector rung +
  both explore cards): measured content, WAAPI on the roll tokens, the whole chain down to the
  panel stretched so the CARD BORDER rides the ease (one `auto` link parks a percentage height), a
  one-frame re-measure standing down for foreign animators (the pager's pinned slides,
  disclosures), `growIn` easing lane-joining slots from 0 once the host lane booted. In-card
  arrivals take `CONTENT_EASE`, live bar widths `BAR_EASE` (both exported beside RollSwap; persist
  vs remount decides which). Reduced motion snaps all of it.
- **The canvas's display box is CSS-owned** (`setSize(..., false)` + a 2px viewport overdraw in
  `.scene-canvas`) — integer inline sizing left fractional-DPR background slivers at the edges.

### Responsive shell

Only the rails restructure; everything else holds the four-zone shape. Desktop (≥1100px) has both rails
inline with their `RailThread` siblings; tablet (700–1099px) collapses them to edge tabs opening
**non-modal** sheets (both can be open, orbit still works behind them — the sheets OVERLAY the
vitals band, which CLIPS its paint by their published `sceneCover`, see the band bullet); phone
(<700px) has a persistent bottom bar — Explore | Vitals | Details thirds where the view has a
vitals lane, halves elsewhere (`barGeom`; the icon trays compact to one unseen-update dot at
thirds) — and ONE sheet at a time, with a grabber that drags and flick-dismisses. **The bottom
section (dock bar + sheet) never takes more than 60% of the viewport** (user, 2026-10-04 — "so
that there is always room for the scene to show"; `RailDock`'s `sectionCeilingPx`): the sheet has
ONE resting height, its content's fit under that ceiling, a taller card scrolls inside it, and a
drag that does not dismiss springs back — the ~80% expanded detent is retired. **An open sheet
shifts the scene up into the band above it** (2026-09-28): the dock publishes its target height as
a bottom cover (`sceneCoverBExplore` / `sceneCoverBDetails` / `sceneCoverBVitals`, one per dock because their exits lag)
and the Engine eases a projection offset — `camera.setViewOffset`, never a camera move, so every
pose, the callout, the chart planes and picking follow — by half the cover
(`domain/sheetShift.ts`). Shift only, no zoom. The sheet GROWS out
of the dock (a height transition from a zero armed on the open flip — the content mounts a commit
later, the portal trap), fits its content live, and shrinks back on a
render-phase-derived exit. Dismissing a sheet only collapses it — it does not clear the selection.
On phone the Explore card opens EXPANDED like everywhere else (2026-09-28 — it opened collapsed
while the About card shared the sheet, as a two-head chooser; one card has nothing to choose
between), and the teaching copy says the pointer's own word (`usePointerCoarse` — Tap/Click, one
home; geo's node ghost alone advertises the long-press preview).

**No auto-open, ever** (global): a pick never opens a sheet or dock. The dock's icon tray announces it;
the user always taps the trigger.

SSR and first paint assume desktop, so the desktop rails carry a `max-[1099px]:!hidden` safety net.

## The design system — Instrument-Glass

The HUD's character is **Instrument-Glass**: translucent glass panels over a live 3D scene,
instrument-channel rulers and threads, one cyan heartbeat, restrained identity hues, calm transient
signals. **Bespoke design elements are the product — don't genericize them into stock-component
defaults.**

**Open `/design` before any design work.** It is the live reference: the colour lanes, the type scale
and the sans/mono split read from `globals.css` and the palette generator, and the signature elements
— the icon map, the ECG and Odometer, the four card states, the status pills, the state atoms,
`SELECTED_ROW`, the three edge signal levels, the instrument ruler — render through the *real*
components. It answers **what exists and what it looks like** by construction, so this file doesn't
restate that. What a rendered page can't carry is the prohibitions and the traps; those are below. It
is deliberately not a full component gallery — component *behaviour* is verified against the running
app.

**All styling lives in `app/globals.css`** plus Tailwind utilities in the JSX — **one name per token,
no aliases**, and component code doesn't re-derive paddings, radii or cyan tints. The SVG `RailThread`
mirrors the thread literals in code because an SVG stroke attribute can't resolve `var()` — keep the
two in sync.

**The HUD type scale is THREE steps, FLUID, plus the documents' prose step** (2026-10-02, two
rounds: "the fonts are tiny while there is a lot of empty space", then "the filter text is still
smaller"). `--text-label/body/title` are `clamp()`s — 12/14/16 hold to a 1440px viewport, a linear
ramp lands at 13.5/16/18.5 by 2560px — at least 2px apart, because the retired `micro` step sat
1px under `label` and a pixel is not a hierarchy: an eyebrow is caps + tracking + ink at the label
step. A container measured for a fixed figure must be stated in `em` or against the token, never in
px (ExplorerRow's figure column, the ghost rung's eyebrow column). `text-prose` (15px / 1.65) is for
the doc overlay's paragraphs ONLY; a card's description stays `text-body`. The rail widths (`--rail-w`,
`--detail-w`) and the vitals band (`--vitals-h`, paired with BottomStream's `RESERVE`) grew with it.
**The accent is a glow, `--primary-ink` is the accent as TEXT**: links, eyebrows and tickers set in
the accent take `text-primary-ink` (the accent itself on dark; a third toward black on paper, where
the bare accent measured 2.3–3.1:1). **An identity hue set as TEXT takes `IDENT_INK`** (`components/identInk.ts`): it
re-points `--ident-l` to `--ident-ink-l` on that element — 0.48 on paper, the lane's own 0.74 on dark —
because the lane's L is a MARK's lightness and a ticker in it measured 3.2:1. Dots, bars and icons keep
the lane. The shared "present, not your subject" dim is `opacity-65` (0.55 still measured 3.6:1 on paper).

### Two colour lanes

`/design` renders both lanes live, including the hue precedence (baked brand > `config.METAGRAPHS`
colour > hash fallback) and the zone snapping. Rule 3 enforces the mechanics. What neither shows:

- **Structural tokens are never repointed at an identity hue.** Structural cyan (`--primary`) is the
  sole accent/affordance signal — live dots, the ECG, selection washes, sparklines, blueprint chrome,
  the "all" identity; warn/ready use `--destructive`/`--success`. Identity appears only via inline vars
  on subject marks (`--mg`, `--spine`, `--filter-accent`, `--row-hue`, `--pulse-hue`, `--edge-hue`).
  `--core` is one blue for the whole DAG core, its L0/L1 shells included, like any metagraph.
- **The palette generates per medium**: a HUD lane (flat on glass) and a scene lane (bloom-tuned, so an
  emissive bloomed node keeps its hue instead of blowing out). The page shows the HUD lane only.
- **The 3D scene sources its structural colours from the CSS tokens.** At construction the Engine reads
  them through a hidden probe plus a 1×1 canvas (which normalises whatever computed-colour format the
  browser returns for an oklch token) and threads the result into every scene module. Calm and dim
  variants are the same token at low opacity, never a bespoke tone. `config.COLORS` is the static
  mirror the non-DOM layers need (SSR, bake scripts); the Engine dev-warns if it drifts.

### The signal language

In one line: **thread = resting identity cue; card edge = purely transient signal channel.**

- **Cards are spineless at rest, everywhere** — no steady or selected edge state, including the command
  bar and popovers.
- **Resting identity lives in the rail threads.** Both rails carry a mirrored fixed SVG in the margin —
  neutral ruler and ticks, an identity-hued spine, a node-dot at each card's middle measured live. The
  thread must stay a **sibling** of the rail: the rail's clip/mask would blank a child.
- **The facts rail's thread is its ONE instrument, and it carries STATE — the SLAB carries depth.** That
  division of labour is the rule: the pile's abutting geometry says what contains what, and the thread
  says what each slot IS — **dot state = slot state** (hollow ghost, solid populated, solid + halo for
  the focus rung), on uniform short measured tie-lines (0.9 opacity at the focus rung, 0.55 for an
  entry, 0.7 for the box) anchored at each card's `[data-eyebrow]`. A depth-REACH FUNNEL on those ties
  was tried and **retired** — like the `.rung` descent spine before it, it was a second hierarchy
  instrument competing with the first. **Never grow a second vertical instrument in a rail**; two
  attempts are recorded here precisely so a third isn't made.
  ⚠️ The SVG box is drawn wider than the visible lane because **the thread's fade mask clips ink
  overflow** — lines drawn outside the box render invisibly. Attribute checks pass, pixels don't;
  screenshot it. The same clip makes the box's **ORIGIN** load-bearing: when the funnel's `REACH_PAD`
  left the ink math it stayed in the width *and* the left offset, silently shifting the whole right-hand
  thread off the rail. **Width and origin must be changed together.**
  ⚠️ **The thread measures in SHELL-LOCAL coordinates, never viewport ones**: every rect is divided by
  `k = shellRect.width / shell.offsetWidth`, the live scale of whatever transform an ancestor is running
  (`components/RailThread.tsx`). Raw viewport rects are correct only while that scale is 1, which is why
  the dots landed off their eyebrows after `raw → switch view → scene` — GSAP leaves the scene wrapper
  mid-scale, and **an ancestor transform change fires no ResizeObserver, scroll or resize event**, so
  there is no signal to re-measure on either. Dividing by the measured scale makes the numbers
  transform-agnostic and the missing event moot.
- **Every card edge signal renders on the scene-facing (inner) edge**, in three levels whose hierarchy
  must stay readable at a glance — **grey whisper < hued pairing < moving pulse** (all three run live
  on `/design`). Pairing wins over the whisper by source order. The pulse fires once per subject
  change, skips mount, debounces, leaves nothing behind, and is **synchronized with the title's
  roll-in** so title and edge move as one moment.

  All edge lines share one soft-tipped gradient recipe riding `--edge-hue`, and **only opacity may
  animate on these pseudos, never colour** — swapping the hue var rather than the background keeps
  hover-out fades from flashing.
- **Sheets stay calm**: inside sheet content the whisper and pairing edges are suppressed, because the
  sheet's own edge spine is its single identity cue. The subject-change pulse still plays.
- **Dock icon trays** show a quiet legend of the cards the sheet hosts. A card updating while the sheet
  is closed goes vivid in its identity hue, still — colour alone since 2026-09-28 — until the sheet opens — purely visual, it
  **never opens the sheet**, and a pure deselect announces nothing.
- **Calm tempo.** The heartbeat family beats at 1.5s and transient signals run around 1.2s, debounced
  so a 4s-tick live feed never reads as a strobe. **Navigation moves on its own, slower clock** — the
  depth change is 0.55s and the view choreography ~3.9s — because that's the user's own gesture
  resolving, not the instrument speaking.
- **Reduced motion is guarded on every animation**: theme-var animations carry
  `motion-reduce:animate-none` at the call site, CSS recipes carry their own media override. The edge
  pulse degrades to one static blink; a hold collapses its fade (the hold is timing, not motion); a
  signal chip still swaps glyphs, because that's information.

### Inside a card — one grammar, three weights

The slab grammar above says how cards sit together; this says what a card BODY is made of. **One row
grammar everywhere: label left, value right, one line.** The stacked micro-uppercase-label-above-value
form is retired — it cost two lines per fact and read as a form, not an instrument. Its last survivor was
the `Composition` label over the dossier's composition table, which outlived the sweep only because that
table isn't a `Fact`; dropped 2026-08-10, since each row already names its own composition and without it
the description above reads as the card's lead. **THE BREAKDOWN IS ONE TABLE, ON EVERY CARD THAT HAS ONE** (user, 2026-10-02 —
`docs/superpowers/design/2026-10-02-right-rail-cards/`, D2 then `visuals.html`): rows of **name ·
count · mark**, where the mark is one SQUARE per countable thing (a node, an anchored snapshot) and
a BAR for a rate or a cut above 60 — never both in one cut, no dots, no legend. The dossier's three
cuts (composition in the network's hue, status in the bucket colours, archive depth in the neutral)
carry the cut's name in a leading column (`ScheduleTable` with an `axis`); a card with ONE cut drops
that column because its section label names it (`CUT_ROW` — the global snapshot's anchored rows, the
Moment's readings, a provider's and a country's nodes by network; the composition card is a plain
fact card — its strip and status row were built and removed the same day). Rows that are their own controls wear `CUT_ROW` themselves and
draw `UnitMarks`, so every card shares the columns. It replaced the stacked bars with a wrapping dot
legend, the dot · name · track · count rows and the inline network dots — three recipes. A zero part
is a muted row with no mark. **A FOLD IS MARKED ON ITS LABEL, never by a glyph beside the figure** (`foldLabel`,
user 2026-10-03, two rounds): a chevron in the row's flow pushed that row's figure left of every row
without one ("numbers should be on the right side and aligned … a structural solution for the >
space being taken sometimes"), and hung in the card's padding it "touches the edge, there is simply
no place there for a control". The label that opens a fold wears the dotted underline (the pager
scope word's affordance), solid and full ink when open — it takes no space, so every figure in a
card shares one right edge: the dossier's total over its cuts, the global snapshot's rows under
their total. ⚠️ A row with a `-mx-N` hover wash must be `w-[calc(100%+2N)]`, never `w-full`: at 100% the
negative margin only shifts the box, and its figures stop 2N short of the edge. The node card is a record and carries one mark only: the archive REACH
bar, the share of its chain's ordinals it still serves (`archiveReach`, `components/useArchive.ts`).

**Every right-rail card is the same SIX SLOTS in one order** (user, 2026-10-02 — the design and its
deviations are in `docs/superpowers/design/2026-10-02-right-rail-cards/`): **head · lead · breakdown
· facts · doors · foot + pager**, and a card uses the slots it has content for. The primitives beside
`Fact` and `Foot` in `inspector/parts.tsx` are the one way to draw each: `Lead` (the one dim sentence
a card says first, two lines at most — what the subject is to its parent), `SectionLabel` (a caps
label with the section's one headline figure on the right), `Empty` (the ONE empty value: a dash,
the reason on hover — the cards used to say "not known", "none" and "n/a"), `QualifierChip` and
`Door`. Three rules ride them: **a head's aside is a qualifier chip or a state pill**, never bare
text, a relation or an age (those are the lead's); **facts are regular weight** (the headline figure
lives on the section label); **every way out of a card is a `Door`** — a full-bleed row on the wash
ladder. The lead still obeys the pile rule: a piece an ancestor card states is left out, and a lead
with nothing left to say is omitted rather than filled.

Three weights, and a fact's weight is a claim about what the card is FOR:

| weight | holds | built from |
|---|---|---|
| **lead** | the 1–2 things the card exists to say | composed by the card itself — merges facts onto one line and drops labels the unit already carries (`1.8 KB of state · 4 data updates`, no "State"/"Updates") |
| **detail** | the measured facts | `Fact` inside `FactGroup` |
| **foot** | hashes, ids, bookkeeping numbers | `Foot` + `FootRow` — small muted mono on its own BASE PLATE, **always last** |

The four primitives live in `components/inspector/parts.tsx` and are the only way a card body draws a
fact row; nothing re-derives the layout locally. They carry no animation, so reduced motion is a no-op
here exactly as it is for the slab.

**The foot is a look-up column, not a demotion bin.** A value goes there when you'd only ever read it to
compare it against something else — the node card's NODE ID, the snapshot cards' hash and parent. That
is also why the node card's "NODE ID last" rule falls out of the grammar rather than being a special
case.

**The foot changes GROUND, not just type** (user, 2026-08-10 — the tier read as "only the font"). It
full-bleeds by the card's own padding to the panel's bottom edge, picks the inner radius back up and
sits on `--panel-plate`; that replaces the `Separator` outright, because a rule on top of a ground
change is redundant noise. **The fill is a neutral white LIFT, and the mechanism is the rule**: a dark
scrim composites multiplicatively, so it separates beautifully over the ledger's glow and dies to a
~4/255 step over the black scene the right rail actually rests on — it shipped that way for an
afternoon before being measured on both grounds. A white overlay is additive and therefore
ground-independent. Keep it neutral: `--wash-*` is accent-hued and IS the selection language, so a
tinted lift would read as selected. The bottom bleed is `--foot-bleed`, which `RailPager` overrides to
its own strip height so a paged box's plank rides ON the plate — one number, two consumers.

On the two snapshot cards the foot has one shape: **the artifact's chain identity — what it is, what it
links to, what it proves.** They are the same `Signed[]` artifact, so they carry the same set, and the
metagraph card's `State hash` is the one addition (renamed from `State proof` 2026-08-14 — it collided
with the signers' `snapshot proof`, a SIGNATURE set, while this is a digest, kin to Hash/Previous),
because only a metagraph snapshot proves an
application state. **Counters are not chain identity**: `Height`, `Blocks` and `epochProgress` are all
carried by the types and none of them appear.

⚠️ **"PREVIOUS HASH", NOT "PARENT HASH"** (user, 2026-09-01). Upstream calls the field
`lastSnapshotHash` and that is literally what it is: the hash of the snapshot before this one in
the SAME chain. "Parent" borrows tree/DAG vocabulary for a link that is strictly linear — a
snapshot has exactly one predecessor, never several — and on the metagraph card it invited the
reading that the parent was the GLOBAL snapshot it anchored into, which is a different relation
entirely (the head aside's `anchored to N`). All three surfaces say "Previous hash": both snapshot
cards and the raw layer's channel pane.

**The PILE is the unit of consistency: a card never re-states an ancestor's identity.** Adjacency is what
the slab uses to say containment, so a leaf repeating its parent at equal weight is noise, not
reassurance. The node card drops Country, Composition and Hosting exactly when the country, composition
or provider rung above it is committed — each of those cards states that fact as its own TITLE, and a
title survives the collapse into an entry, so the plank speaks whether it is open or not. **Gate on
presence, not view** (convention 7): the `!= null` rung checks, never `mode`, so the rule holds as
ladders change and the fact grows back wherever nothing above it says it. Read down the pile, the fact
set is identical in every view — only its distribution across planks moves. Whichever facts survive keep
one fixed reading order, **place → role → host → reference**, so the card always reads the same way; it
just has fewer lines.

**CARDS TELL THE STORY, NOT A STATIC RECORD** (user, 2026-08-15 — the named principle behind the pile
rule and its kin). A card is its subject *as seen from the current scene*: the same facts, redistributed
to lead with what the present context makes relevant. Three forms, one principle:

- **Across cards** — the pile dedup above: a fact moves to whichever plank states it best, never
  duplicated at equal weight.
- **Within a card** — the node card's LEAD is contextual (user, 2026-10-02: "in snapshot view it
  should say something like 'validated snapshot 123'. This should be the principle for that
  section"): it opens with what the node is TO THE SUBJECT ON SCREEN, then where it sits and who
  hosts it. With a metagraph snapshot committed and its signer list read, a node of that network
  reads `Signed snapshot N.` or `Did not sign snapshot N.` and NOTHING ELSE (user, 2026-10-03: "too
  much text, just say that it signed the snapshot") — the place and host step down into `Location`
  and `Hosting` fact rows while the relation holds the lead; another network's node has no relation
  to it and says nothing. The head aside keeps the status. A new view's relation
  joins the lead the same way — presence-gated, one sentence, before the place.
- **Across surfaces** — the subject callout mirrors the BOX (`store.boxedCard`, published by Inspector
  from the same state that renders it): the box is the subject — it already gets the camera — so
  re-boxing an ancestor card steps the scene label up with it.

The gate is always **presence** (a committed rung, a live relation, the box), never `mode` — `metaSnap`
being ledger-scoped is what scopes the signed relation to the chamber, with no view check anywhere. A
new per-context variation must name the story state it answers to, not the view it appears in.

**Density came from culling, not from tightening.** `Data blocks`, `Height` and `Blocks` (metagraph
snapshot) and `Epoch` (global snapshot) were removed outright — a fact nobody reads costs more than the
pixels it takes.
Measured at 1600×950: the ledger box 649px → 459px, and the ledger's committed ladder went from
overflowing its lane (831 in 663) to fitting (629 in 641). Don't re-add a culled fact without saying
what question it answers.

**A code appended to a value is a THIRD COLUMN in disguise** (user, 2026-08-10 — asked whether the node
card wanted three columns). It doesn't want one: three columns break the one row grammar, and the codes
themselves ran 2ch (`US`) to 8ch (`AS212317`), so a fixed column is either gappy or truncating. The codes
are **culled** instead — `US` restates "United States" and nobody looks a country code up. The role chips
STAY on the Composition line: they qualify the word, and a value column can't hold them. Measured live,
the raggedness was at the **left** edge of the value block anyway — a third column would not have
addressed it.

**The ASN is a BODY fact, beside the host it names** (user, 2026-08-13). It spent three days in the foot
on the look-up rule, and that reading is too literal here: the foot holds the card's own REFERENCES, and
the ASN is not this node's reference, it is the provider's — read down the foot it sat above `Node id` as
if the two identified the same thing. In the body it lands where the fixed reading order already puts it,
one line under the provider NAME it is the number for, and the foot is left saying exactly one thing:
which node this card is about. It keeps the **provider rung** condition the Hosting line above it uses, so
the two can't disagree about who owns the host. The look-up rule still governs what the foot is FOR; it
just doesn't reach a value that belongs to a different subject.

### CardHead — the one card header

Every rail card leads with `CardHead`: eyebrow / title / inset hairline / body.

- The **eyebrow** is a view tag or the bare slot noun; the populated card wears the same slot label as
  its ghost state, with no breadcrumb grammar. The provider card's user-facing word is **provider**
  while every internal identifier stays `cohort` — one concept, two registers.
- The **title** is one standard, with `titleKey` keying the roll-in remount on a subject change. Panel
  titles carry a leading identity dot on the shared beat. The node card is titled by the node's
  id (2026-09-29 — it was city-first), shown exactly as the explorer's node row shows it, with a
  City fact in the body that yields to the provider card; the foot still carries the full NODE ID.
  A provider reads provider-first everywhere ("Hetzner · Falkenstein" — row, crumb, pager, card).
- **Card-head kind marks tint with the ACTIVE FILTER's identity** via
  `text-[var(--filter-accent,var(--primary))]`. Hardcoding a mark to cyan is a recurring bug; node
  marks use their node's own hue inline.
- The **`aside`** is the right-aligned title-row companion — bodies render no title rows of their own.
  Every rail card fills it; the country card was the last one leaving it empty, and now carries its ISO
  code (2026-08-10) — the subject's own short form, the role the dossier's ticker plays, so it takes the
  same weight but **muted rather than hued**, because a place carries no identity and the head's tinted
  mark is already the filter accent. It suppresses itself when the display name is unknown, since the
  title has then fallen back to the code and a head must not say the same thing twice.
- **Every RESTING division is inset by its card's own horizontal padding** — the head hairline included
  (user, 2026-08-09). One weight for anything that is simply *there*: the slab's resting seam, the head
  rule, the Fact-row separators all line up at the same left/right spacing, so a card reads as one body
  quietly divided rather than a stack of slices. The panel layout insets with `--panel-pad-x`; the
  inspector layout just sits inside `--card-pad` and needs no bleed at all. Full width is **reserved
  for the hovered seam**, where it is a transient signal, not a resting edge.
  **The inset is ARITHMETIC, not an eyeball**: a division nested inside a body that already has padding
  carries the difference, so the explorer's instrument/list rule is `mx-[2px]` — 14px of body padding
  plus 2px to reach the 16px `--panel-pad-x` the head rule uses. Deriving it from the tokens is what
  makes the lines actually share an edge.
- **One close**: every dismissible card's × is CardHead's ghost close labelled "Clear selection", with
  no per-card variants. A right-rail ENTRY expands on click (the whole entry is one invisible
  stretched toggle, required for touch) — but the BOX carries **no minimize** (user, 2026-09-11:
  "hardly used"; the − on the eyebrow line and the whole-head collapse toggle both went): the box
  moves by expanding another entry or by the plank's ladder pair, never by collapsing into
  nothing. The LEFT rail's explore cards keep their collapse toggle. The × and the aside float
  above the entry overlay so closing and links keep working. ⚠️ **Floating above it means
  `pointer-events-none` on the wrapper and `pointer-events-auto` on its own links/buttons**
  (`[&_a]:pointer-events-auto`, `[&_button]:pointer-events-auto`) — a `z-index` alone leaves the
  whole aside eating the toggle click, which is exactly how a collapsed head stopped expanding.
- **The cards ARE the rail's controls — there is no rail toolbar.** The collapse-all/restore + clear-all
  pair above the pile was removed (2026-08-09): every head is already a disclosure toggle, so a
  collapse-all button restates what a click says, and its × was the coarsest card's own × — clearing
  from the top rung cascades down. `clearAllActions` went with it. Don't grow the toolbar back.
- **A head hairline only exists where there's a body to divide.** Collapsed, the rule would fall on the
  card's own bottom edge, with nothing above it to separate — both `CardHead` layouts gate it on
  `!collapsed`.
- **FULL WIDTH is a hover signal, not a structural weight** — and the slab's seam is the one line that
  carries both states (user, 2026-08-09): inset at rest, reaching out to full width on hover, because
  hover is the entry's materialize preview and a materialized card owns its own edges. **Both joints
  around the hovered entry switch together** (its own `::before` plus the NEXT member's, which draws its
  bottom edge) or it half-materializes.

### Selection & pairing

- **`SELECTED_ROW`** is the one committed-selection language for list rows: the wash plus a 1px inset
  ring **as a single box-shadow** — deliberate, because the transient states it composes with are
  background-based and box-shadow is an independent property — plus a reserved trailing check mark in a
  fixed slot so columns never shift.
- **`subjectPairing`** is the one scene↔HUD hover coupling: a subject is paired when its key equals its
  store channel's value, using the same channels the engine reads and writes. Hovering a card glows its
  3D object and vice versa. This coupling is rule 9; `components/useSubjectPairing.test.ts` asserts the
  selectors.
- **`IdentityDot`** is the shared flat identity-hue dot, no glow.

### State atoms & timing

`components/state/StateAtoms.tsx` builds empty and loading states from the app's own marks (all four
render on `/design`), so an absent feed reads as part of the instrument rather than a spinner. The
sonar ring is remounted per retry, so the animation IS the retry.

**`useMinHold`** gives every *transient* signal a minimum calm cycle even when data resolves instantly,
then eases out — no blink. **Steady** states like NO SIGNAL and STANDBY never hold or fade; they
persist by nature. Boot latches once live, so a later feed drop is the per-panel NO SIGNAL rather than
the boot overlay returning.

**Acquiring has two forms, and the choice is about the SLOT, not the wait** (2026-08-10). `NodeStars`
fills a value slot a real number is arriving into — it reserves that slot's width so nothing reflows
when the number lands, and carries no text because the label already names what's coming (the global
card's `Fees paid`, `AnchoredTags`, the metagraph card's Data count). A **word** is for everything
else: no slot is being held, so it states the situation and is replaced wholesale — `reading…` for a
block acquiring, `unread` for a value nobody has looked up yet, `unavailable — read failed` where
nothing is coming. Stars where nothing is in flight would promise an arrival that isn't coming; a word
in a held slot reflows the row when the number replaces it.
⚠️ **Every acquiring state needs its give-up path wired.** A read that fails otherwise shows
`reading…` forever, which rule 10 counts as a fabricated state exactly
like a fabricated number. The exact read's signal is `store.exactMiss` (recorded by
`RawSnapshotBridge`, cleared when the read lands); the deep read's is the 12s `decodeGaveUp` timer.
⚠️ **The payload host's depth is a PER-REQUEST LOTTERY — the LB fronts pruned and archival
nodes.** Probed node-by-node 2026-08-14: of 152 Ready L0 validators, **143 serve only a rolling
~78-day window and 9 serve deep history**, so a deep read through the LB succeeds on roughly a
1-in-17 draw — which is how the same probe measured "entire history" one day, a hard ~78-day band
the next, and genesis again the day after. All three were real. Deep history itself starts at
**ordinal 766,718 (2023-11-13 11:44 UTC** — right after a 27-minute cadence gap, the
metagraph-era upgrade restart); nothing behind the LB serves anything older, and nothing needs
to: every metagraph snapshot ever anchored postdates it (DOR's genesis anchored 43 minutes
after). **Reach is not completeness**: the deep archives share holes (~2.4–2.8M missing on all
nine, ~3.5M on eight — common holes mean a shared sync source), so "archival" means "serves deep
history", never "serves every ordinal". `app/api/archive/probe.ts` is the census's one home
(cached 6h; feeds the node card's Archive fact via `/api/archive` and `useArchive`), and
`app/api/snapshot/fetchGlobal.ts` is the one global-snapshot pull — LB first, then every
archival node in random order on a 404. So **no failed old read is provably permanent** and no
serving horizon may be stated in copy — the give-up copy invites a retry, and the channel
route's upstream-404-throws-as-transient choice is what makes each retry a fresh draw. The
explorer separately serves tiny full-history RECORDS at any depth (its own indexer storage, not
the validators), which is what the anchor log's history paging and the timestamp→ordinal
resolver ride.

**A value slot states a READING; an invitation is a CONTROL** (user, 2026-08-10 — "I don't like the
word 'pin', it's not very clear to me"). The metagraph snapshot card's Data slot said `pin to read`:
internal vocabulary in user copy, naming a gesture whose only control was the head aside — top of the
card, labelled with a *time*. The words moved out of the slot and became the block's own button,
because the deep read fills **both** payload sections' shape rows, so an instruction sitting in one
section's value slot was governing the whole block. What stays is the honest reading, and **`unread`
and `none` are different facts** — haven't looked vs looked and found nothing. Rejected on the way:
"encrypted"/"decrypt" (it is brotli-compressed public JSON — no key, no cipher, and it says the
opposite of the one thing that matters, since this read is gated *because* one channel publishes
personal records in the clear) and "uncompress" (true, but it puts the cost on local bytes when the
cost is the ~2.5 MB fetch).

**One control position, two tiers**, because there are two costs and the card charges the second only
once the first is paid: `Read this snapshot` runs the deep read and states the SHAPE in place;
`Show the raw data` opens the raw layer for the payload (named for the MODE, 2026-08-13 — the pane shows state, data and signers, so naming one lane undersold it). Tier 1 is the card's ONLY route to
the read — the card never fetches on its own, because being pinned is not the same as asking (the
surface gate, in `src/engine/scene/CLAUDE.md`); the button writes `deepWanted` and that is the whole
request. Tier 2 gates on the deep read having
LANDED, not on decodability — while following it used to land on a pane whose own copy said to pin,
with the pin control back in the HUD the raw layer had just marked `inert`. The cost rides the
**button's** title, never a value row: `PAYLOAD_LANES` is one home shared with the raw pane's tabs, and
"only when you ask" is stale the moment the read lands. ⚠️ The read pins through
**`metaSnapSelectActions`**, not the aside's `followToggleActions` — the aside's builder commits the
GLOBAL tick as the subject, which moved the box to the Global snapshot card and collapsed the card you
were reading. Same builder as the anchor-log row, so a read and the equivalent row click can't drift.

### Disclosures — one Radix primitive, one panel recipe

Every collapsible body in the app is `Collapsible` + `.disclose-panel` (2026-09-01). The migration
off `{open && …}` bought two things `{open && …}` structurally could not: an **animated** body (an
unmounted node cannot travel, and it also popped into existence under `RailThread`'s measurement)
and the **trigger↔panel id pairing** AT needs. (The explorers no longer disclose at all: since
2026-09-26 depth there is a PATH — one level on screen, the ancestry a breadcrumb — so
`components/ExploreRows.tsx` and its `Disclosure` recipe retired with the old trees.)

⚠️ **RADIX HOLDS THE PAIRING, NEVER THE STATE.** A collapsible whose open state is a selection —
the dossier's Online-nodes schedule is a plain toggle, but a rung-driven one would be — derives
`open` from the store and runs the same builder the click always did. Rule 2's one write path is
untouched; Radix decides nothing about what a click means.

⚠️ **150ms, and it is the CHEVRON's clock.** The arrow already rotates at `duration-150` and the two
are one gesture; a panel on its own timing reads as two things happening. Changing `.disclose-panel`
means changing every chevron with it.

**Four sites deliberately do NOT migrate**, each for a structural reason rather than an oversight:

- **`CardHead`'s three** — the head toggles the card BODY, which its PARENT renders as a sibling in
  another component. A Collapsible root would have to wrap both, restructuring every rail card for
  an `aria-controls`.
- **`TopBar`'s two strips** — the grow-downward slot is a LAYOUT PARTICIPANT: TopBar publishes its
  height and the rails and canvas add it to their `top`. A height animation would fight a published
  measurement, and the strip is not hidden content but a resized bar.
- **The `Explorer`'s levels** (every explorer since 2026-09-26) — depth there is a PATH, not a
  tree: one level on screen, the ancestry a breadcrumb, so nothing is ever hidden-when-closed
  under a trigger. There is no disclosure to migrate.
- **`Desc`'s show-more** (`inspector/parts.tsx`) — evaluated and rejected on its own merits before
  this sweep: Collapsible's model is hidden-when-closed, this is always-visible-but-CLAMPED.
- **`ChannelStatePanel`'s raw-JSON well** takes the primitive but NOT `.disclose-panel`: it opens to
  its SIBLINGS' leftover height (`flex-1`, and it is the lane's one scroller), not to its content's,
  so a measured height animation would hand the scrolling back to the box — the double-scrollbar bug
  the header there records fixing twice.

### shadcn primitives

`components/ui/` holds the adopted primitives; compose classes with `cn()`. **`Button` is adopted only
for small text/icon controls that map cleanly onto a variant** — accordion rows,
rail edge-tabs, phone-dock halves, the view switch and the filter button are deliberately NOT Buttons,
and that boundary is the convention. The filter picker is NOT a `Command` palette — it is the top
bar's own network-chip strip (see the command bar's grow-downward slot); `cmdk` and the adopted
`Command` were removed 2026-08-31 once nothing had imported them for some time, so don't reach for a
palette here without deciding it afresh. `Table` + `ScrollArea` are the raw layer
only, with `Table` adopted MINUS its scroll container so the header stays sticky while the body scrolls
under it. **`Tabs` is the channel pane's lane axis** (2026-09-01, swapped off `ToggleGroup`): the two
looked and behaved alike, but a toggle group announces "three buttons, one pressed" while this is a
tablist over three panels — AT never learned the region below belonged to the pressed chip, and there
was no arrow-key navigation between lanes. ⚠️ **Every lane's `TabsContent` must carry the flex chain
its plain `<div>` did** (`min-h-0 flex flex-col`): the primitive inserts a layer between the bordered
box and the lane body, and one default `block` in the middle hands the scrolling back to the box.
**`Calendar` (react-day-picker) is the raw log's date range** — see `components/ui/calendar.tsx` for
why every surface it paints is restated in this app's tokens, and the two traps in its own
composition (the doubled caption, the three-orientation chevron). The engine-anchored `Tooltip` stays custom, because a Radix tooltip can't track a raycast.

### CSS traps

Each has cost real debugging time. Traps 3, 6, 8 and 10 are executable — `components/cssTrapBoundary.test.ts`
for 3, 6 and 10, `components/breakpointArmBoundary.test.ts` for 8; the rest are yours to remember.

1. **Recipes that must beat element utilities stay UNLAYERED.** Tailwind v4 orders `theme, base,
   components, utilities`, so a rule in `@layer components` loses to a utility **at ANY specificity** —
   raising the selector weight does nothing. Unlayered CSS beats every layer at equal specificity.
   `.subject-paired` and the card signal system live unlayered on purpose — new must-win recipes go
   there too. The other escape is to stay in the SAME layer: an arbitrary variant like
   `[&>.ig-panel]:pb-[30px]` is (0,2,0) in the utilities layer and beats `RIGHT_CARD`'s `p-[18px]`
   (0,1,0) — how `RailPager` reserves its footer strip without touching globals.css.
2. **A transform on an ancestor re-anchors every `position:fixed` descendant to it**; `opacity` does
   NOT (it only makes a stacking context). Both halves are load-bearing: the scene wrapper is `fixed
   inset-0` with an inline identity transform **from first paint**, precisely so the canvas and rails
   resolve their fixed boxes against the wrapper before anything renders — geometry never jumps when
   GSAP later writes that same property. Its HUD child is animated by **opacity only**: a transform
   there would make that zero-size static div the rails' containing block. A plain `<div>` with no
   transform/filter/will-change is safe to nest. Anything that must stay pinned to the real viewport
   goes outside the wrapper or through a portal.
3. **`bg-[var(--x)]` compiles to background-COLOR.** A token holding a gradient or shorthand silently
   renders nothing — use the arbitrary property form `[background:var(--x)]`.
4. **Variant selectors compile to class+attribute specificity.** `data-[state=open]:…` is (0,2,0) and
   beats a single-class override like `motion-reduce:animate-none` (0,1,0). When a variant must win,
   use the important modifier.
5. **JS-toggled classes must remain real CSS classes** — `.scene-in`, `.rail-clip`, `.rail-dragging`
   are added and removed at runtime, so they can't be inlined into utility strings.
6. **Custom `@theme` utilities whose prefix collides with a tailwind-merge group MUST be registered in
   `lib/utils.ts`.** Unregistered, twMerge classifies e.g. `text-body` as a COLOR, so
   `cn("text-body", "text-muted-foreground")` silently drops the size class and text falls back to
   16px. Register any new `text-*`/`rounded-*`/`tracking-*` token utility in the same breath.
7. **`:has()` cannot nest inside `:has()`** — CSS forbids it and the whole rule is dropped SILENTLY
   (the slab's corner-squaring vanished this way). Reach through a sibling with ONE `:has()`
   (`+ div > .rail-entry`), and comma-join when several subjects need the same rule rather than nesting
   a second one. `:is()` inside `:has()` is fine.
8. **`max-[N]` is EXCLUSIVE** — Tailwind v4 compiles it to `@media not (min-width: N)`, so it stops
   applying **at** N, not after it. A tier boundary is therefore written with the SAME number on both
   arms (`max-[1100px]` / `min-[1100px]`), which is how the rail widths pair. Never pair `max-[N]` with
   `min-[N+1]` thinking it closes the gap: it opens one, and the hole is invisible to every other gate
   here because both arms are individually well-formed. **The phone tier had one** (fixed 2026-08-19):
   `max-[699px]` against `min-[700px]` left exactly 699px with the dock CSS-hidden and the tablet tabs
   not yet matching — no rail control at all, neither rail openable. Every arm names 700 now, which is
   `breakpointOf`'s own boundary, and `components/breakpointArmBoundary.test.ts` is the rule; its header
   carries the ONE exemption, the `max-[1099px]:!hidden` safety nets, where the desktop rails fill in at
   the same width the tabs vanish so nothing goes missing. Don't copy that older form into a new
   boundary.
9. **One slim scrollbar recipe, `.slim-scroll`.** Any scroll region **on glass** wears it — the platform
   default paints a chunky bright bar that reads as a browser part laid over the panel. It's a class
   rather than a token because its consumers are reusable primitives (the filter strip's phone overflow,
   the raw layer's lane pane), and it styles **both axes**, because a JSON tree scrolls sideways too.
10. **A decorative pseudo that COVERS its host must declare `pointer-events: none`.** An absolutely
   positioned `::before`/`::after` at `inset: 0` paints above the host's in-flow content, so with the
   default `pointer-events` it becomes the hit target for the whole box. Cost real time on 2026-09-14:
   the card signal edge grew from a 2px bar into a full-box border ring (so the ink could bend into the
   corners) and silently took every click in the rail cards — and the tell was that only SOME controls
   died, because a descendant with a positioned box of its own still wins. `pointer-events` inherits, so
   an already-inert host (`.edge-pulse`) needs no declaration of its own.

**Settle any cascade or specificity question by reading the compiled CSS in the browser**, not by
reasoning about it.

### Marker classes and ids queried by JS — these are contracts

Rename only with all consumers. These are **CSS contracts as much as JS ones** — the slab's member,
seam and corner rules select on the same markers the thread measures:

| Marker | Consumer |
|---|---|
| `#leftcol` / `#rightcol` | RailScroll, RailThread, the globals rules |
| `.ig-panel` | RailThread's card-dot measurement — every rail card must carry it (the `Card` baseline supplies it) |
| `.rail-ladder` | The facts rail's lane — the slab CSS is scoped to it (`gap: 0` + the seams) |
| `.rail-entry` | The unboxed entry tier; the thread queries both tiers |
| `[data-eyebrow]` | Where a card's tie-line anchors vertically — **both `CardHead` layouts must emit it**; without it the thread silently falls back to the card MIDDLE, which on a tall explorer card drops the mark hundreds of px below its own header |
| `data-tier` (`ghost`\|`entry`\|`box`) | **The slab's ONE discriminator** — members, seams, squared corners and the box's raise/lift all key off it |
| `data-depth` / `data-focus` / `data-ghost` | The thread's read — depth dimming and dot state |
| `.nb-row` | The pairing row-wash selector |
| `#topbar`, `#metapane`, `#tooltip` | Layout and positioning |
| `canvas.scene-canvas` | `SceneCanvas` renders it; the engine's controls listen on it (the card-drag handoff that once queried it is retired) |
| `#callout` (+ `data-on`) | The subject callout's 0-size anchor wrapper — `SceneCallout` renders it, `CalloutSync` writes its transform + `data-on` per frame (the Tooltip discipline: position never renders React) |
| `#callout-2` (+ `data-on`) | The same contract's second anchor — the GLOBAL snapshot's label in Snapshots. Same two homes, same per-frame writes, no multi-leader |
| `#trend-stack` (+ `data-on`) | The trend view's chart-plane layer — `TrendStack` renders it, the engine queries it to find the planes. It waits at `opacity: 0` and `TrendStackSync` writes `data-on="1"` once the view has ARRIVED (policy `chartStack` + the trend furniture alpha at full), so the stack fades in with the room rather than riding the camera's flight — the `#callout` `data-on` precedent |
| `[data-plane]` (the network id) | One chart plane, as an ANCHOR + a CHILD. The anchor is a **0-size box at the layer's top-left with `origin-top-left`**, mounted `invisible`; its one child is the plane, `planeFormat(tier).pxW` wide (640 on desktop and tablet; 360 on phone, so the card is drawn at about scale 1 and its type is legible — the projector divides by the same number, and on phone the head drops its unit into the front plot's caption, `unitInPlot`), centred on it by `-translate-x-1/2 -translate-y-1/2`. **React renders the plane and owns everything inside it** plus the anchor's `opacity` / `zIndex` / `pointer-events` (all from the same `PlanePose`); `TrendStackSync` (engine layer) writes the anchor's `transform` — a `matrix3d` translate + uniform scale, never a rotation — and its `style.visibility` per frame. The anchor's geometry IS that matrix's coordinate system, so don't give it a size, an origin or a transform of its own; `components/trendStackBoundary.test.ts` pins it |

⚠️ The card query is deliberately **depth-agnostic** (filtered to outermost panels): a `:scope >
.ig-panel` form silently matches nothing once the ladder lane nests the cards.

## The subject callout & furniture labels

**One split, decided in a spike (2026-08-15) and matching the user's own instinct: FURNITURE text is
in-scene (`scene/objects/TextLabel.ts` canvas-texture meshes — blooms on the scene lane, rides group
transforms and shader fades); the SUBJECT callout is real HUD DOM** (`components/SceneCallout.tsx`),
composited crisp over the bloom pass so it reuses the HUD's tokens and grammar directly.
CSS2DRenderer was evaluated and declined — the node chips are InstancedMesh instances, so per-frame
anchor resolution must live in the Engine either way; the renderer would only replace the final
projection while adding its container, render pass and a React-portal handshake. Contained swap if
callouts ever multiply.

**`components/calloutBoundary.test.ts` pins the contracts**: `#callout` has exactly two homes (React
renders + owns content, `CalloutSync` writes transform + `data-on` per frame — the Tooltip
discipline); BOTH owners consult `store.boxedCard`; and `SCENE_GLASS` is the one container the hover
Tooltip shares (hover and commit are one species — identity never tints the frame; it lives on the
hued ticker, the anchor ring and the `.edge-spine`). The design rules the test can't carry:

- **The box leads.** The callout mirrors the expanded card (`boxedCard`, published by Inspector from
  the same state that renders the box), exactly as the camera answers it; the component picks the
  MODEL and the Engine the ANCHOR from one mirrored preference, falling through to the finest
  committed rung.
- **Snapshots stands TWO callouts, each on a FIXED anchor** (user, 2026-10-03: "2 callouts"). A
  committed metagraph snapshot is always read against a global snapshot, and one label could
  name only one of them. `#callout` is the metagraph snapshot's (its tile) and `#callout-2` the
  global snapshot's (its bar, or the resolved network's segment of it) — whichever card is boxed.
  Handing the subject's anchor to the boxed card was the first cut and it re-drew both labels on
  every re-box, over two subjects that had not changed. A boxed node's label still stands alone.
  **The Metagraph card has a label too** (user, same day: "the dossier on snapshots page has no
  callout on the scene" — reversing 2026-08-16's "a lane gets no label", which read as a
  forgotten card once both snapshots were labelled): the hyper dossier's own model, at the head
  of the network's lane. It SHARES `#callout` with the metagraph snapshot — the two stand at
  the same end of the same lane — and takes it when the Metagraph card is the box or no
  snapshot of that network is committed.
  **The global one HANGS** (design A of `docs/superpowers/design/2026-10-03-snapshot-callouts`,
  user: "ok A, but make the angle of the lines the same"): below-left of its bar, into the strip
  between the floor and the bottom band, on the standing label's own diagonal turned half a
  circle — `--co-k` shortens both axes by one factor, so the two leaders are parallel. Standing
  up-right from the floor put its panel over the ribbons. `calloutHangs` (domain, tested) says
  whether the strip has room; where it has not, the label stands as it always did.
- **The HOVER card is the name of the thing with its mark** (user, 2026-10-03 — all three of
  `docs/superpowers/design/2026-10-03-hover-cards`): the same mark (`SceneMark`, shared with the
  callout), no "click to inspect", no "L0" chip on a global snapshot, and a country is named
  where only its border lit. **Its colour is the hovered OBJECT's own, never the filter's**
  (same day): a network's hue, the unlisted neutral, the DAG's identity hue for what is the
  DAG's (its nodes, its core, a global snapshot), the structural accent only for a country.
- **A callout wears its card's MARK** before the title (user, 2026-10-03 — picks 1, 4 and 5 of
  `docs/superpowers/design/2026-10-03-callout-cards`): the cube, the stacked cubes, the globe,
  the pin, the server, or a network's logo — `iconForPick`, the cards' own glyph home, in the
  card head's own hue rule. A label and its card pair at a glance instead of by reading both.
- **The global snapshot's label names BOTH things its bar shows**: the count in the card's word
  ("3 of 5 snapshots") and the size as a chip on the right ("8.9 of 15 KB"), because the band its
  ring points at is drawn in BYTES. The size is the exact read's or absent — never estimated.
  Its aside reads age, then state, the order the card's head uses.
- **The free band starts under the command bar.** The canvas runs behind the bar, so "near the
  top" was measured from y = 0 and a label stood up into it; `CalloutSync` hands
  `calloutPlacement` the bar's bottom edge as `top`.
- **Ring and leader wear a ground-coloured casing** (same day): a ring in its subject's hue lands
  on a block of that hue, and the dashed line crosses lit geometry — both read as nothing there.
- **A hyper NODE's callout points at EVERY layer bead** (the multi-leader, 2026-08-30): a machine
  is one record per layer on separate shells, so up to two extra dashed legs fan **from the
  panel's own corner** (the beads are peers — user's second-round correction of a bead-to-bead
  chain) to the non-primary beads, each ending in a small identity ring. Engine-written per frame
  into the callout's `.co-multi` SVG (the Tooltip discipline); `Globe.selectedNodeHyperAnchors`
  resolves the siblings by `nodeId` through the one `_hyperAnchorOf` home.
- **Anchors are object-level**: a geo node's own chip (the spotlight's per-record resolution), the
  pinned snapshot's own tile (live position recorded as the trail draws, rewind included). Group
  anchors are fallbacks only. A distributed subject (a filtered fleet in geo, unlisted anywhere)
  gets NO callout — a single anchor would lie about where it is.
- **It is a label, not a control**: `pointer-events-none`, no ×, dismissal is the selection's own.
  Content mirrors the cards' grammar rung for rung (eyebrow ink, bare ordinals, aside rules,
  RoleChips, the ticking age on the global tick).
- **The entrance is a sequence: panel rolls in, THEN the leader draws panel→anchor, THEN the ring
  lands** (user, 2026-09-05 — the tie was fully drawn while the panel was still arriving). An
  SVG-mask ink line (`.co-draw`) eases its normalized dash offset so the dashes reveal without
  crawling; the wrapper is keyed by subject so the choreography replays as one unit, and it's
  PAUSED until the Engine's `data-on` — after a commit flight it plays at reveal, not invisibly
  mid-flight. Clock is the panel's own (lag + rise, then --tempo-roll); reduced motion snaps it.
- **The phone declines it** (user, 2026-08-18). Co-location is the whole promise — the panel stands
  beside its subject and points at it — and a phone has no width to stand beside anything: the panel
  is a third of the viewport, so it lands ON the subject or over the dock, and the flip rule has no
  roomier side to flip to. **Both owners decline, through the same `breakpointOf` home** the rails
  restructure on, so presence and anchor can't disagree; `components/calloutBoundary.test.ts` pins
  that neither grows a threshold of its own. Tablet keeps it — there the flip has somewhere to go.
- **Placement measures the FREE CANVAS BAND, not the canvas** (`domain/calloutPlacement.ts`, its
  test the spec). Below 1100px the rails are sheets that OVERLAY a viewport-sized canvas, so a
  placement measured against the canvas rect puts the panel under one: at 900px with both sheets
  open a geo node's callout rendered as a ~25px fragment in the strip between them, while the
  Details sheet behind it showed the whole node card anyway. The band is the canvas pulled in by
  `store.sceneCover{L,R}` — the px each open side sheet covers, MEASURED by `RailDock` and reported
  through an `onCoverPx` prop so the dock stays store-free. An anchor outside the band, or a panel
  that fits on neither side, gets no callout: this is the phone rule's own reasoning reaching the
  width the SHEETS create rather than only the width the device does. It is a no-op on desktop and
  phone, where the cover is 0. ⚠️ The sheet mounts a commit LATER than the one that opens it (radix
  portals its content), so the cover is published off a callback REF, not an effect keyed on `open`
  — keyed on `open` it measures a null node and publishes 0 forever, which passes tsc and vitest
  and fails only in the browser.
- **Furniture labels are sparse by review**: geo's hosting-country names (the set states where the
  network runs — empty countries staying nameless is information) are the only ones standing. Hyper's
  hub tickers AND its "Global L0" were built and removed the same day (clutter over what hues,
  tooltip and callout already answer) — HyperView's header records it; don't re-grow without a live
  look.
