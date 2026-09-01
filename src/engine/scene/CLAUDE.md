# src/engine/scene — working notes

The Three.js adapter layer: what the views draw and how the chamber is built.

Split out of the root `CLAUDE.md` (2026-08-31) so it loads when you work here rather
than on every session. The root file holds what this is, the eleven rules, run & test,
the architecture map and the dev workflow; **its rules govern this file too**.

## Nodes, layers & the filter

**Vocabulary rule — a validator is a LAYER, never a machine** (user, 2026-08-10, app-wide sweep): a
**node** is one host — one machine, one IP, one city, one status; a **layer** is an L0 / cL1 / dL1
process on it, with **its own keypair and its own peer id**; a node's **composition** is the set of
layers it runs; and a **validator** is a layer acting, so the word is *always* layer-qualified and never
a synonym for "node". The global snapshot card's bare `155 validators` is what surfaced this — under
the unified node model its seal is the DAG's own L0 cluster, so it reads `155 L0 validators` like every
other signer count. There is **ONE layer vocabulary** app-wide, the codes the composition chips already
use (`L0` / `cL1` / `dL1`); the signer copy's `data-L1` was a second dialect for the same three layers
and is gone, `ROLE_FR` with it. `src/data/network.test.ts` makes both halves executable — every
`SIGNER_GROUPS.who` must match `/^(L0|cL1|dL1) validators$/`, and no group's words may say `data-L1`.
Internal identifiers keep their existing names (`validatorDim`, `NodeFabric`, `machineRows`) — one
concept, two registers — and a phrase naming a SHELL rather than a machine ("the validator shells around
it") is correct as it stands.

Validators and metagraph nodes are `InstancedMesh`es with a patched smooth-shaded material. In hyper
they're small spheres; on the globe they cross-fade to standing round chips, edge-lit so stacks read
as lit chips rather than a flat mass; in the ledger they're the same chips in the trays.

- **DAG L0/L1 are two armillary shells around the core**, and each metagraph is laid out the same way
  around its hub — L0 inner, dL1 middle, cL1 outer. Each ring is drawn from the *same* curve function
  the nodes use, so nodes and hoops can't drift. Metagraph nodes live in the rotating globe group but
  stay glued to their orbiting hub in hyper.
- **A metagraph's identity hue is the same everywhere it appears** — hub, globe nodes, filter dot,
  rail thread, card marks — matched by metagraph `id`.
- **Two sources, kept different on purpose.** Hyper hubs come from `config.METAGRAPHS` (all of them,
  unconditionally); globe nodes come from `globe.metaList`, filtered to metagraphs with at least one
  *locatable* node. A metagraph with 0 locatable nodes has a hub but can't be plotted — the picker
  keeps those rows clickable but dimmed with a bare `0`. They're real, selectable in hyper/ledger,
  just not plottable.
- **Co-located nodes are deterministic poker-chip stacks** in a honeycomb, one hex per real node,
  sizes always summing to the true count. Never randomized — don't add jitter.
- **Arcs are travelling packets**, not fixed lines: comet agents hopping node→node, all sharing one
  `LineSegments`, rebuilt on every filter change. Tuned calm.

Everything routes through `Engine.applyFilter()`. The ladder per view is data in
`domain/focusLadder.ts`; what a click commits is `domain/pickActions.ts`.

**Geography** — network → country → provider cohort → node, each deselect stepping back one. Selecting
isolates and dims, refreshes the leaderboard, and rotates the globe so the densest part of the
selection faces the camera (Y rotation only — north stays up). A metagraph frames deliberately wider
than the country pose so drilling still reads as a zoom.

**The country drill is a lens, not a filter**: it flies to the country, draws its border, firms the
land glass and marks the row, but the other nodes stay fully visible, pickable and fanned. The drill is
shape-driven — the globe spins to the polygon centroid and every country is viewed at the same surface
angle, north up, never over the zenith, with only distance varying to fit the angular extent. Framing
composes on the **main landmass** (France's geometry includes French Guiana; the US's includes Alaska
and Hawaii).

**The country hover/click pairing is bidirectional** (geo only): pointer-moving over a drillable
country writes the same `hoverCountry` channel the explorer rows do, and clicking toggles the drill
exactly like the row. A canvas `pointerleave` clears every hover channel, because cards overlay the
canvas and pointer moves stop at their edge.

⚠️ **Data rebuilds must not wipe the drill.** `Globe.setMetagraphs` restores its own `countryFilter`
around the internal `setFilter`, and `Engine.applyFilter`'s geo branch re-asserts `this.country` —
otherwise the background cluster poll silently clears the border seconds after every drill. A real
filter *switch* still clears it by design.

**Hypergraph** — committing a metagraph eases the whole structure's shared tilt to near-flat (the
structure moves, the camera never rolls) and flies to the hub using its **local/unscaled** position:
the root is morph-scaled, so a world position would aim at the origin mid-morph. The hub's orbit pauses
while focused, and picking is filter-gated to the in-focus selection's nodes. Depth of field is wired
but no view opts in — the bokeh read as fuzz on the selected atom.

**Snapshots** — the ladder is node → network → all. Committing a filter leans the chamber pose in (the
one commit tilt) but never moves the lanes; floors and trays are visual aid, and the real subjects are
the snapshots themselves.

**Hover previews at the same strength as a committed filter**, but never runs the click's camera
flight. Hovering an explorer node row glows that node and nothing else; a country row previews its
border at a whisper level; a cohort row glows the whole stack and lights its country border. A hover
always cleans up after itself.

## The Snapshots view

A 3D anchoring chamber on the shared canvas, composing four adapters over the pure modules
`ledgerBands`, `ledgerRails`, `ledgerLayout` and `ledgerModel` — **their tests carry the geometry and
the slot model; this section carries the intent.**

**The frame.** The group is rotated so that **+X faces the camera** (the lead slot nearest the
camera-side floor edge, time trailing away), **+Y** is floor height and **+Z** the lane/width field. X
is owned by the view, Y and Z by `ledgerLayout`.

**Two storeys, and the upper one is per-metagraph planes.** The global floor is one whole plane
spanning the same symmetric field as the planes above it — **the only place the metagraphs come
together.** The upper storey is not a shared floor: one narrow plane per lane (the unknown lane
included), gapped, each with a small ticker label, machines hanging in one tray under its front edge.
The storey heights give the ribbons a deliberate long run.

**The byte bar IS the global snapshot.** One bar per tick on the global floor, fixed height and depth,
**its width alone encoding the bytes that tick carried** against a FIXED baked reference — **~p70 of
anchored KB/tick** (user, 2026-08-16: "more often too filled than too small" — the earlier p99 bake
made the median bar a sliver of unreadable segments), so a heavy tick clips at the floor edge instead
of rescaling the whole past — and states its true size in words in the SIZE column below, which is the
honest answer the clip never had. (`spec.clipped` / `spec.overflow` were computed in `ledgerBands.ts`
for an `×N` overflow label that was never built, and were removed 2026-08-19 — the size column
supersedes them, so a clipped bar states its size in words rather than in a multiplier.)
`scripts/bake-ledger-scale.ts`
re-measures it; its header carries the complete-window sampling trap. The bar is centered on the lane field and split into bands, one
per contributing metagraph plus unlisted, each its own pickable mesh from a pool allocated once.
**Bands follow lane order, so band order and lane order agree and the ribbons never cross.**

**The honesty is in the domain, not the adapter** (`ledgerBands.ts`): **no exact read → no bands.** A
composition is never inferred from the anchor count and never from the fee.

**HEIGHT says whether a measurement exists; WIDTH says how big it is** (user, 2026-08-18 — *"it shows a
snapshot in that view which can't be drawn … now it's just empty"*). An unmeasured row used to draw
nothing at all, so a tick whose exact read failed was blank floor with a dotted anchor line pointing at
it — the HUD said `EXACT READ FAILED` while the scene said nothing had happened. A row with no
measurement now draws the **SEED**: a flush block lying in the glass, `SEED_W × SEED_H`.
Lying in the glass it is not a bar, so it makes **no width claim** — which is exactly what lets its
footprint be nominal under `ledgerBands.ts`'s ban on inferring a width from anchor count or fee — and
when a read lands the row RISES into its bands through the machinery that already existed. It sits
**still and dim**, because nothing is arriving: a read that failed or was never taken is not in
flight. A seed stays **pickable** — selecting an unread tick
is what asks for its read. ⚠️ `s.forming` stays true for a still seed: it is what short-circuits the
grow loop, which would otherwise ease the mark into a full-height bar.

**The tick still FORMING is not a row at all — it is the LIVE EDGE** (user, 2026-08-18: *"what if we
don't show an actual snapshot for [forming], but instead a dim line in front of the snapshots with
some relevant info about what's happening, to indicate it's forming, live, filtered"*). A tick arrives
and its exact read is in flight for ~1.8–2.5s; drawn as a seed in the lead slot that window had no
honest place to stand, because under filter + follow the rewind holds the NETWORK's own newest
anchored tick at the lead, so the forming tick sat ahead of the front edge and dissolved. **A row that
cannot be placed is not a row.** `scene/objects/LiveEdge.ts` is the boundary with NOW instead: a thin
line lying flush in the glass at `LIVE_X`, mounted straight into the view root — **never into a group
the rewind offsets**, because now does not slide with the trail — running WIDER than `BAR_MAX_W` so it
can never be misread as a bar, and not pickable, because there is no snapshot there to select. It
**breathes** on the calm beat while a read is in flight and **rests still** in standby, and it takes
the committed network's identity hue, which is how it says *filtered* without a word. `liveEdgePhase`
(`domain/ledgerModel.ts`) is the resolver and **`LedgerView._liveOrd()` the one predicate** all three
consumers ask — the slot's mute, the ordinal column's suppression and the edge's own phase — so the
line and the row can never both claim the tick, and the column can never name it twice.
⚠️ It carries **no label**, measured rather than omitted: the strip it would occupy is ~10px at the
resting pose and already holds the floor's front rim, the floor's own `GLOBAL SNAPSHOTS` name and the
lead bar's bloom, so the words washed out. Hyper's hub tickers are the precedent — furniture labels are
sparse by review, the line's own behaviour says all three states, and words about the live tick belong
to the HUD, where the global snapshot card already ticks its age. Don't re-grow it without a live look.

And the **SEAM** — a measured tick that anchored nothing — is a MEASUREMENT, so it draws at full
height, riding the real write path through one synthetic neutral band. Since 2026-08-30 it wears
**the SEED's own square footprint** (`SEED_W`, promoted to `domain/ledgerLayout.ts` as the two
special rows' SHARED shape): height is the only thing separating them — flat = unread, standing =
measured-empty — so neither ever makes a width claim (user: "use the same shape and just use the
height").

**Ribbons carry the anchor.** One tapering sheet per anchoring lane, from that metagraph's lane tiles
down to **its own band** — the literal statement of which bytes came from where. Both edges are eased
identically so adjacent ribbons can't cross, and a **hidden lane draws no ribbon** (its old-position
sheet would overlap the committed lane's field). Only FOUR rows get a sheet — lead, hot, hover
preview, grace — because N networks × every row is a wall of glass.

⚠️ **That cap answers the UNFILTERED chamber, and it used to be inherited by the filtered one.** This
paragraph claimed for months that "older ticks keep a hairline strut"; there was no such strut — it had
been retired and the sentence outlived it — so under a commit the two readings that run the length of
the trail (the lane's tiles above, its bands below) had nothing joining them, and the user asked why
"the trail when filtered doesn't show any relation between global and meta snapshot" (2026-09-01).
**THREADS** (`Ribbons.setThreads`) are the honest version of that sentence: under a commit, one
hairline per trail row that actually anchored the committed network, on the rows the sheets don't
cover. Commit a network and there is at most ONE line per row — a twelfth of the load the cap protects
against — so the cap does not apply. Three rules hold it: only under a commit (unfiltered draws
nothing and the chamber is byte-identical); only where the anchor exists, so a tick that network
missed draws no line and **the gap is the fact** (rule 10, the byte bar's own zero rule); and it
follows the **sheets' own eased sweep**, never a straight segment — the ribbon geometry falls, sweeps
and lands vertically precisely so nothing slices diagonally across the chamber, and sharing `sweep()`
is what stops a thread drifting off the ribbon it stands in for. Geometry is event-time, alpha is
per-frame (`setThreadFades`, on the same rewind ramp the bands and tiles answer).

**Composition.** Every storey surface is the same composed unit — glass plane, optional edge label, its
own tray — instantiated per position. What it deliberately does not own is the snapshots: tiles, bars
and ribbons stay pooled instanced meshes spanning every plane, and the lead-identity/neutral-trail rule
stays one shared code path.

**The chamber's look is live-tunable.** Under `?tune` (see `src/engine/CLAUDE.md`) the `ledger` folder
carries the ribbons, the byte bar, the lane tiles and the two plane channels.

**Node trays** hold each metagraph's machines under its own plane and the whole validator fleet under
the global floor, with no role split. **Machines are deduped — a hybrid appears once**, since roles
belong to other views. Trays are pure visual aid — no picks, no rungs, no labels of their own, because
the plane above each one is already named — but the machines inside stay pickable as nodes.

**Reuse, not clones.** The node chips are the SAME instances from hyper/geo; the ledger branches
rewrite *those* matrices to the tray positions. The Engine freezes `morph` while settled here, and
`ledgerT` is a boundary-snapped layout parameter, not an eased blend. The hubs, the globe surface and
the starfield are gated off so none lingers when arriving from geo.

**The DAG core never dims in the chamber** (user, 2026-08-30): every metagraph anchors INTO the
global, so the global layer — floor, fleet tray, its L0 validators — is inside every committed
story, not an off-filter bystander. A WHO-is-in-scope statement, so it lives at the dim TARGET
(`Globe._applyDim`'s ledger clause, re-derived by `applyLedgerLayout` on the flag flip); the view
rows keep saying how much, and every other view still dims the DAG under a metagraph filter.

**Lanes and the committed filter. The field is fixed**: every lane always owns its own slice, and a
committed filter never moves or hides geometry — only the shared commit tilt answers it with the camera.
The emphasis is a **coloured dim** on every identity-coloured element — the others drop to their *own
hue* at the row's `dim`, a tier between full colour and the neutral trail, so the committed network
leads while the rest stay identifiable. `src/engine/scene/objects/dimTiers.test.ts` keeps the tier
hierarchy ordered through tuning: **the order is the design**, the numbers may move.

A committed metagraph puts the view in **live metagraph mode**: entering with one committed, or
committing one while there, flips following on and the whole card chain rides the heartbeat. **"Live"
under a filter means the NETWORK's anchors**, so the network's newest anchored row holds the front
through anchor-less global ticks. Browsing or pinning drops live mode; leaving clears the cards, so
coming back starts live again.

⚠️ **The ~2.5 MB deep read is gated by the SURFACE, not by the mode** (user, 2026-08-10). Being PINNED
is not the same as ASKING: selection used to be the whole trigger, which put the read behind a BROWSE
gesture — every pager step and every explorer leaf fetched. So:

- the **card never reads on its own** — it states the SHAPE, and its `Read this snapshot` button writes
  the store's `deepWanted` key, which IS the request. One press, one read; a pager skim costs nothing.
- the **raw layer always reads on arrival** — that surface exists for nothing but the payload, so being
  there is the request, and getting there took a deliberate depth change.
- `following` stays a hard guard on top: an auto-advancing card must never turn an explicit-gesture
  route into a poll.

The measurements are the justification: the client only ever receives the decoded row (**599 B** for
DED, **4.4 KB** for DOR) — what's rationed is the SERVER's fetch of the whole global and the latency
the user waits through, **~1.8 s cold**, ~1 ms warm from the immutable per-ordinal cache. And it
MULTIPLIES: tick 6,741,486 anchored **20 DOR snapshots**, so one swipe through that pager was 20 ×
2.5 MB against Constellation's public L0 LB, ~36 s. Privacy is the other half — one anchoring channel
publishes personal records, which is why the payload is two deliberate gestures deep at all.

**Labels.** The global floor is named by subtle flat edge-aligned text rather than billboards, and each
metagraph plane carries a smaller ticker label the same way. Every visible tick row is named at BOTH
ends, by two mirrored dotted columns: a global ordinal screen-left — the exact reading of what POSITION
encodes — and its SIZE in kB screen-right, the exact reading of what WIDTH encodes, through the HUD's
own `fmtKB` so scene and cards can't disagree about a size. Each is tied to its row's bar by a dotted
anchor line whose end tracks the bar's live width, keyed by ordinal so labels and lines ride their row
down the trail. The two columns share one line recipe, one aim and one dispose, so they can't drift.
⚠️ The size column reads **outward** — ink pinned at the inner boundary, growing away from the chamber
— because a bar already reaches ±(`LANE_HALF_Z` − `BAR_EDGE_MARGIN`) and a value growing inward would
land on top of it; outward there is no bound, so a 1.2 MB tick states its size as calmly as a 4 KB one.
Only a MEASURED row gets a number (rule 10): reading down the column a GAP means *not read*, never
zero, and a measured-empty seam honestly reads its own tiny size. The forming tick is named by neither
column — the live edge stands for it, and a label there would run its anchor line out to a bar that
doesn't exist.

**Glass, emphasis and the rewind.** The glass fill shader is shared but the looks are split: the PLANES
are square with a soft-rim drop-off, the node TRAYS are flat rounded-corner panels. Rounded corners are
the trays' signature, the drop-off is the floors'. **The floors are pick blockers** — a normal surface
swallows the ray, so content under a floor can never be hovered or clicked through it. Related: **a
tile is only pickable once a resolver can name it from the polled feed** — a tile the buffer can't name
is anonymous, drawn but not pickable. The chamber shows that the anchor happened without inventing an
identity for it.

**Emphasis is TWO independent readings — brightness, and colour** (user, 2026-08-11), and in both the
order is the design.

*Brightness is the node vocabulary*, resolved for every band, tile and ribbon by `snapBright()`: the
SELECTED row takes the `ledger` row's full focus `boost`; a HOVERED row takes the same boost at
the group tier, **without demoting the selected row**, because the hover previews what a click would pin;
while any focus exists every other row steps back by `back`; and an off-filter network drops by `dim`,
the same knob its node chips in the trays answer to. **A COMMITTED member is HELD above the trail's
resting weight** by `snapHold` and never steps back — the ledger follows the live row, so `anyFocus`
is true almost always, and a member's bands and tiles were sitting at the resting weight of an
UNFILTERED neutral trail on every row but one (measured: 0.12 against a focused row's 0.82). The point
of naming a network here is to trace it back through time, and a trail you cannot follow is a commit
that did nothing. It is a multiplier taken in the *else*-of the boost, never additive — added to the
focused row's boost it would clip past 1 and flatten the row meant to lead.

⚠️ **On paper the bands take an ink FLOOR** (`BarTune.ink`), exactly as the lane tiles have always
taken `TileTune.ink`. The bands never had one, which is why an off-filter band composited at 0.165
alpha while the tile beside it was already lifted into `[0.3, 1]` — the floor is affine, so every tier
above it keeps its order and only the bottom of the span lifts off the glass. `dimTiers.test.ts`
pins primary > preview > resting > stepped back, and that off-filter dims without vanishing. Exactly one
hot row — a committed older snapshot beats the live lead, a hover doesn't steal it.

⚠️ **THE BOOST ANSWERS THE SELECTION, AND THE BARE LEAD IS NOT ONE** (user, 2026-08-11). With nothing
selected the chamber is simply running: its front row is already named by its place at the front edge
and by keeping identity hue, so lifting it made `boost` a second `rest` — the whole trail permanently
stepped back against a row the chamber walked onto by itself, with nothing left for a hover or a click
to add. That is also what made the RIBBONS read as undimmed: a ribbon takes no boost, so an
automatically-boosted band separated from its off-filter neighbours ~30× while the ribbons only halved
by `1 − dim`, and the mismatch read as the dim missing from the ribbon rather than as a boost that
shouldn't be there. But **live/not-live is HOW a row was reached, not WHAT it is** (user, 2026-08-11):
a live follow's row IS selected, so it reads exactly like a pin. Suppressing the boost while following
left live metagraph mode — which the committed filter turns on by itself — with no focus at all, and
the user read the whole chamber as dull. So there is one question and `model.selectedSlot` answers it;
the scene no longer reads `following`, and `LedgerView._focusSlot()` / `ByteBar.setFocusSlot()` are gone.

⚠️ **A ROW'S FOCUS IS THE COMMITTED NETWORK'S, NOT THE WHOLE ROW'S** (user, 2026-08-11). A row is a
TICK, and a tick holds every network's snapshot side by side — so under a filter the boost reaches the
committed network's band and tile alone (`snapFocusOf()`, the one home). The boost is added UNDIMMED,
which is exactly what made a row-wide focus swamp the dim: on the shown row every band came up together
by the same `+boost`, so at the moment the filter matters most the committed network had no lead. The
one exception is a directly hovered TILE — that IS the subject, so it takes the primary weight whatever
the filter says, the same answer the node model gives a hovered off-filter node. Kept OUT of
`snapBright` on purpose: subject identity is a call-site question, like colour, and `snapBright` stays
term-for-term faithful to `nodeEmissive`.

⚠️ **`back` IS THE ROW'S ANSWER, SO THE FOCUSED ROW NEVER STEPS ITSELF BACK** (user, 2026-08-11 — *"the
snapshots look dimmed too much, almost gray/black, next to a ribbon I like the colour of"*). Its
OFF-FILTER members included: they take the `dim` alone, which is exactly the tier the RIBBON landing on
them takes (`Ribbons` passes no focus and no back at all), so a ribbon and its two endpoints read at one
level. Compounding the two knobs made `dim × back` ≈ 0.28 against the ribbon's 0.5 and left the band and
the tile above it near-black under a sheet that was only gently dimmed. `dimTiers.test.ts` pins it per
instrument.

*Colour is decided separately at the call sites and no dim knob may touch it.* The active and hovered
rows take identity hue; with a network committed, **that network's OWN bands and lane tiles keep their
identity hue down the WHOLE trail**, so the committed story reads as one coloured thread through the
chamber, while every other resting snapshot stays neutral cyan. Under a filter the trail therefore
separates by HUE where it used to separate by brightness as well — `dim · off-filter` is the knob that
buys contrast back if the thread ever reads too quiet.

**Selecting a non-live snapshot rewinds the trail**: the whole time trail eases forward until the
selected row sits at the lead position, so the active selection owns the front instead of fighting the
live lead's arrivals, and rows newer than the selection slide past the front edge and dissolve. The
rewind follows only the committed pin — a hover previews the hot row in place. There is no scene fog and
no depth fade on the trail: every row keeps one brightness, and recency reads from position plus the
ordinal labels.

⚠️ **A ROW IS ONE OBJECT — every instrument that rides a row derives its x from the SLOT, and the
rewind offset is the trail's one source of motion** (user, 2026-08-18 — *"it does not jump to the exact
row location and then corrects itself directly after"*). The bars, the ribbons and both label columns
all read `LEAD_X - slot * SLOT_SP` in the frame that draws them; the lane tiles alone used to keep a
stored `x` on the block and ease it toward that same expression, snapping only while a `holding` flag
said a pin held the front. So a tile chased its row rather than riding it. It tore worst exactly where
the flag dropped: under a filtered follow a fresh anchor moves the held ordinal to slot 0, so `holding`
went false in the same event that incremented every slot, and the tiles started a full `SLOT_SP` behind
their own bars. `LaneBlock.x` and `TrailRewind.holding` are both gone — **a second home for row
position is a tear waiting for the frame that separates them**, and easing one instrument toward a
number every other instrument already has is not motion the chamber has.

**A held row arrives in ONE movement, and `scene/objects/TrailRewind.test.ts` is that contract** —
the offset's jump-vs-ease rules as pure scalars, asserting direction and standing still rather than
the easing rate. The same bug class recurred the next day (user, 2026-08-18 — *"active snapshot moves
to the back, then a bit to the front now and then arrives at its trail row … only appears when
current and new is both active?"*): the calm jump's guard read `_slotPrev > 0` where it meant *was the
held row VISIBLE*, and slot **0 is the lead** — the one state a filtered live follow sits in. So the
advance drew the row a slot back, the missing jump let the offset ease up after it, and the store's
follow then named the fresh ordinal and unwound that ease. Three movements from one tick. Only `−1`
may skip the jump.

⚠️ **A DISSOLVED ROW MUST ZERO-SCALE, NOT JUST GO DARK** (user, 2026-08-11). The lane tiles are one
instanced mesh on an **opaque, depth-writing** material whose brightness rides the instance COLOUR, so a
row multiplied to brightness 0 is a BLACK BLOCK — it occluded the ribbons and glass behind it in front
of the active row, and the raycaster ignores `visible`, so it still ate clicks. Both POSITION dissolves
(the rewind's front edge and the horizon below) resolve to one `edge` factor per row, and `edge <= 0`
takes the same zero-scale branch an unfilled tick already gets. The byte bar never showed this — its
bands are `transparent` with `depthWrite: false`, which is why a brightness dissolve is enough there.

**The far end is a HORIZON, not an edge** (user, 2026-08-09). The one exception to "no depth fade": the
trail's last slots dissolve at the far boundary, the mirror of the rewind's own front-edge dissolve, so
the chamber reads as continuing into history rather than stopping at a hard rim. It is **one function
with one home** — `horizonAt(x)` in `domain/ledgerModel.ts` (`HORIZON_X`, `HORIZON_SPAN`) — and the
furniture half is the shared glass shader's `uFadeDir`/`uFadeAt`/`uFadeSpan` plus
`SnapshotPlane.setHorizon`, so planes, trays and their labels fade on the same ramp. **No trail
instrument may float on glass that has faded out**: the ordinal labels, their anchor lines, the lane
tiles and the byte bars all multiply their own brightness by `horizonAt`, because a label hanging over
dissolved floor is worse than a hard edge. The **node trays are deliberately exempt** — they sit at the
front of the chamber, where an end is simply the truth. Deliberately **not** a `?tune` knob: it is the
frame's own shape, not a look.

**The trail has TWO boundaries, one home each, and every row-riding instrument reads both** —
`horizonAt` above and `frontAt` beside it, where the rewind pushes rows off the front. ⚠️ The front
one is what a filtered follow leans on hardest (user, 2026-08-18): the rewind holds the *network's*
own newest anchored tick at the lead, so every global tick that anchored nothing of it sits ahead of
the front edge, and a forming row is exactly the kind that piles up there. The byte bar's SEED branch
skipped the call and left those blocks hanging in the air off the glass — **a seed is a row too.**
They are not dropped and must not be: **POSITION IS TIME**, so a row is drawn where its tick belongs
and dissolves when that is off the chamber, never pinned to the glass to keep it visible; when the
network anchors again the offset eases back and they slide onto the panel in their own place. The
front formula had two homes when this happened (`TrailRewind.fadeAtX` plus an inline copy in the
bar), which is how one write path came to miss it at all.

⚠️ **A BOUNDARY MUST FINISH INSIDE THE GLASS, AND THE RAMP IS DERIVED FROM THE RIM** (user,
2026-08-19 — *"nothing is ever drawn in front of the plane; I still see sometimes something
drawn/flash in front"*). Every row-riding write path already multiplied by `frontAt`, so the hunt
for a missing call found nothing: the defect was one level up. `frontAt` dissolved over
`SLOT_SP * 0.9`, a length picked for how the fade LOOKED, which put its zero at x 7.14 while the
glass stops at 6.5 — and a byte bar reaches `BAR_D / 2` ahead of its own centre, so the last ink of
a fading row sat at 7.94, nearly a slot and a half out in mid-air. Visible only while the rewind
pushes rows forward (a pin, a filtered follow), which is exactly why it read as an intermittent
flash. The chamber's footprint is now `FLOOR_W` / `FLOOR_CX` in `domain/ledgerLayout.ts` with
`FLOOR_FRONT_X` / `FLOOR_BACK_X` beside them (promoted out of `LedgerView`, which keeps only the
label X and the glass shader's drop-off reference), and the ramp ends at `FRONT_INK_X =
FLOOR_FRONT_X − ROW_HALF_D` — so at `frontAt = 0` the row's leading face lands ON the rim. Retune
the rim, the slot spacing or the bar's depth and the ramp follows; there is no second number to
keep in step. **Two tests, because the rule has two halves that fail independently**: the sweep in
`domain/ledgerModel.test.ts` proves the ramps are short enough (both ends, pick set included), and
`scene/rowBoundary.test.ts` proves they are asked — any non-test `scene/` module referencing
`SLOT_SP` must reference a boundary, with `setRowFade` the one stated exemption for `Ribbons`,
whose vertex colours are baked at event time so the view pushes its fade in.

**Signer glow.** When the selected metagraph snapshot changes, the Engine resolves its signers to IPs
and lights those machines in the trays — the scene keys metagraph nodes by IP, not id, so the machines
that actually signed are the ones that glow.

**Three signer groups, and the layer is the point** (`SIGNER_GROUPS` in `src/data/network.ts` is the ONE
home for their words). A metagraph seals every snapshot with its **own L0 cluster**, so the proof signer
set IS that cluster — DOR's is the same 3 machines every time, out of 20. Its **data blocks** are produced
by the **dL1 cluster**, each block by a rotating subset, so that count varies per snapshot and is 0 when a
snapshot carries none. The third group is the **global** snapshot's own proof, which is the same thing one
storey down: the DAG's own L0 cluster. A bare "signed by 3" against a 20-machine fleet reads as a bug, so
every signer surface (the two snapshot cards, the raw layer's SIGNERS lane, the ledger panel's list) names
the producing layer beside the count from that one constant. The ledger panel can only ever show the PROOF
group — data-block signers exist solely in the ~2.5 MB deep read, which browsing must never trigger.

**The two snapshot cards are ONE shape** (user, 2026-08-10 — "global has no signed table, just a count"):
lead → the payload block with its bars → `Fees paid` (DAG over `N KB anchored`) → the signer
COUNTS → foot. The global card composes its lead as a body row; the metagraph card's lead moved INTO its
head (above), so its body opens straight on the payload. So the metagraph card's own signer TABLE is
gone: a list whose first column was a CITY
said cities sign, it sat at equal weight below the facts with nothing dividing it, and it put the
secondary fact first. The good version already lives one tier down in the raw layer's SIGNERS lane, which
is what the card's "Show the raw data" link opens — the card states the SHAPE, the pane renders
the payload. The named cost is the card's signer↔tray hover pairing; the Engine's signer glow on
selection is separate and unaffected. The card gains `Blocks by N dL1 validators` beside
`Signed by N L0 validators`, because the user's question — "general signing is L0 validator, and data
updates are separate and have separate signers as dL1's?" — is exactly right, and two counts of two
different things need two labelled lines.

**A signer that can't be named is named as such, once.** `resolveSigner` in `src/data/network.ts` is the
ONE home for that: given the view's node rows, a metagraph id and a signer prefix it returns either the
real node or the honest unknown, with `SIGNER_UNKNOWN` carrying the two copies (a network-level and a
node-level phrasing). It keys on **the DATA, not the network id** — an unlisted channel is just the
common case of a signer whose machine isn't knowable, and a listed metagraph with an unmatched signer
gets exactly the same answer. So no surface fabricates a node card, and no surface grows its own
special-case for unlisted.

### The unlisted network

**`unlisted` is a first-class network with one home** (`src/data/unlisted.ts`): the module owns its
identity — **neutral gray in both lanes**, because no single identity can speak for a mixed set, so
none does — and its data, derived from the exact reads, **the only honest source**, since the polled
buffers only track the catalog. It is committable in every view: geo and hyper land in the honest
quiet-empty state (no machines are knowable), the ledger lights its lane and dims the rest.

`components/unlistedBoundary.test.ts` enforces the single home. Its two identity LITERALS sit one
file down in `src/data/unlistedId.ts`, a leaf with no imports, re-exported by `unlisted.ts` — the
only way network.ts and ledgerStory.ts can name the id without closing an import cycle back
through it (`src/data/noImportCycles.test.ts` keeps the graph acyclic).

⚠️ **AN INSTANCED MESH WHOSE INSTANCES MOVE MUST BE HANDED ITS BOUNDS** (2026-09-01), or picking
silently dies. three's `InstancedMesh.raycast` opens `if (this.boundingSphere === null)
this.computeBoundingSphere();` then rejects the ray against that sphere — **computed lazily, exactly
once, from whatever the instance matrices were on the FIRST raycast this mesh ever received, and never
invalidated.** Every pool here moves constantly (the view morph, the hyper structure flattening on a
commit, the hub orbits, the trail sliding a slot per tick), so the sphere goes stale immediately and
the ray is tested against where the instances USED to be; when it misses, the whole mesh returns before
a single per-instance test runs. `frustumCulled = false` does NOT help — that governs drawing, not
raycasting.

It is a SILENT failure, and it reached a user as "in hyper, click a metagraph, then its node spheres
don't select": the hub is a separate object and still picked, while the shared node mesh was skipped
wholesale, so the ray carried on to whichever pool's stale sphere still covered it and landed on
ANOTHER network's node — which is what `?clickdebug` showed, the committed filter and the picked node
naming two different networks. The fix at every site is `NodeFabric.openBounds`: bounds three cannot
reject with, so the early-out is a no-op and the accurate per-instance loop does the work. That loop is
O(count), but picking is EVENT-TIME only, whereas recomputing the sphere per frame would pay O(count)
every frame to serve the occasional click. `scene/instancedBounds.test.ts` pins it — and note its own
lesson: it must strip COMMENTS before counting, because the notes at these sites quote three's API and
a naive regex counted the prose, which let the test pass with the fix deliberately removed.

## The instance audit (dev only)

`scene/instanceAudit.ts` + `Engine._auditPass` sweep what the frame ACTUALLY wrote into the node
fabric's instanced buffers, and report a corrupt slot as a console error naming the mesh and index.

It exists because this directory is the app's largest untested surface and its bugs are silent by
nature: measured 2026-08-31, `scene/` is ~8,400 lines at a ~0.03 test ratio with a HIGHER branch
density than pure `domain/` (6.6 vs 5.4 decisions per 100 lines). That is not neglect — these
modules write GPU buffers, so their correctness is pixels and no unit test can see them — but it is
why a defect survives here: a single NaN entering a transform renders as an object silently
VANISHING, which looks exactly like a node that legitimately left the set.

Two checks, both about that one failure: non-finite values in a matrix or instance colour, and
finite-but-absurd coordinates (drawn, but nowhere the camera goes). Cheap by construction — every
15th frame, one mesh per sweep in rotation, findings capped, and each distinct problem reported
ONCE per session rather than once per frame. Dev, or `?audit` in any build (the `?stats` idiom).

⚠️ **It finds corruption, not omission.** "Every instanced slot is written or zero-scaled every
frame" is a real discipline here, but proving it needs the WRITE PATH instrumented — in the buffer,
an unwritten slot and a deliberately zero-scaled one are the same bytes. The audit reads buffers
only and stays honest about that limit; don't cite it as enforcing the write rule.

`Globe.auditMeshes()` is the one accessor it uses, deliberately narrow: the audit needs to READ four
buffers, not to reach `fabric`, and keeping that distinction is what stops a dev-only check from
becoming a public seam into the node pool.
