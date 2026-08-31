# src/engine — working notes

Engine-wide: live look-tuning under ?tune.

Split out of the root `CLAUDE.md` (2026-08-31) so it loads when you work here rather
than on every session. The root file holds what this is, the eleven rules, run & test,
the architecture map and the dev workflow; **its rules govern this file too**.

## Tuning the look live

The dev **`?tune`** flag (present at page load, the `?stats` idiom) dynamic-imports a tweakpane panel
from `src/engine/devTune.ts` — never in the normal bundle. The contract is `src/engine/tune.ts`; three
rules make it non-intrusive, and the header comment there is their authoritative statement:

1. **`*_TUNE_DEFAULTS` is the shipped look and stays what tests pin** — they assert the DEFAULTS, never
   the live struct, so turning a knob can never make a test pass or fail.
2. **The hoist rule.** A tunable read inside a per-node loop is loaded into a local in that loop's
   preamble, so the inner body reads a local exactly as it did when the value was a module const — one
   property load per FRAME, not per node. Sibling discipline to `noFrameAllocations.test.ts`.
3. **A knob's range is colocated with the constant it bounds** — a `*_TUNE_SCHEMA` next to its
   `*_TUNE_DEFAULTS`, typed against its own values so a renamed field is a compile error rather than a
   silently missing slider. `devTune.ts` is ONLY the manifest plus a generic walker, so adding a knob is
   one line in the owning module and no edit there.

**The tree is STATIC** — shared groups, then one collapsed folder per view, then the
camera. A folder for a view you aren't in simply sits collapsed; that costs a click and saves the panel
tracking `mode`, subscribing to anything, or rebuilding itself. Values that are BAKED rather than read
per frame (the ribbons' vertex colours) carry an `onChange` that re-pushes them, so an edit shows
without a reload — **prefer reading the row per frame and needing no callback at all**, which is what
the stage light does. Persistence is **opt-in and default OFF** — a silently-restored session is a
trap, because you would be looking at last week's knobs believing they were the shipped look.

**A knob belongs to the view whose look it changes, even when central code applies it** (user,
2026-08-11). Emphasis and lighting are both `Record<View3D, Row>` + ONE row schema — `FOCUS_TUNE`
(`domain/dimModel.ts`) and `STAGE_LIGHTS` (`domain/stageLight.ts`) — so each view folder holds its own
`focus & dim` and, where it stages one, its `spotlight`. Only what is genuinely cross-view stays above
them; today that is the focus TIER ranking alone. `dimModel`'s four resolvers all go through one
`viewMix(c, field)`, so a new emphasis number is a field on the row and nothing else.

⚠️ **HIDE IS NOT DIM** (user, 2026-08-11). A dim number used to drive three effects, and one of them —
scaling the node to nothing — is geo's ISOLATE, not a mute. It only rode along because hyper's
metagraph dim was then pinned to 0, so the shrink was never seen there; the moment the knob existed it
was the first thing it did. The shrink is now its own row field, `hide`, resolved by `hideFrac()` — geo
keeps `1` (off-filter nodes vanish on the globe), hyper and the ledger `0`, so a dim there mutes in
place. Any new effect a dim number reaches must ask the same question before joining it.

**The two are INDEPENDENT readings of the same raw ramp, not a knob and its fraction** (user,
2026-08-11 — *"dim · off-filter actually also resizes"*). `hideFrac` first took the RESOLVED dim, which
made shrink `raw × dim × hide` against mute's `raw × dim`: `dim` was a master gain over both effects,
so turning it down shrank nodes less as well as muting them less. It now reads the raw ramp, so each
knob moves exactly one effect. A corollary that matters: the country drill's `countryMix` raise is a
MUTE, and reading the raw ramp is what guarantees a lens can never shrink what it looks past.

⚠️ **BRIGHTNESS IS THE EMPHASIS CHANNEL IN A SPARSE FIELD; SIZE IS THE ONE IN A CROWDED ONE** (user,
2026-08-18 — *"I can't really see the difference on what node is selected"* about the DAG's own
validators). Measured: the DAG's 160 validators sit closer together than the bloom radius, so their
halos merge into ONE continuous ~54,000px ribbon (a metagraph's 19 stay discrete, largest blob
~12,000), and every node core already clips white — so a focus expressed only as emissive has no
channel left to spend. `boost` can't answer it either; it was pulled 1.85 → 1.1 on 2026-08-16 for the
opposite bug. **`grow` is the second channel**: `focusGrow()` reads the row's own field and the node
loops scale by `1 + grow × fw`, where `fw` is the eased focus weight carried ON THE RECORD (the scale
and the glow are written by different passes and must swell together). It began as **hyper's alone**
on the argument that geo's chip size is DATA (the honeycomb's hexes sum to the true node count) and
the ledger's trays are uniform by design — but the user reversed that (2026-08-28): the swell is a
TRANSIENT emphasis riding the eased focus weight, not a resting size claim, so it lies about no
count. **Every view now grows, hyper loudest** (its field is the crowded one), and the test pins the
RELATIONS — every view above 0, hyper the largest, all modest — never the numbers. It is the same
question `hide` had to
ask: a new effect gets its own field rather than riding a dim number.

**A view's own FURNITURE dims on its own field, `elem`** (user, 2026-08-11). `dim` mutes off-filter
NODES; the per-network furniture a view draws around them — hyper's hubs, tethers and hoops — used to
fade by two unrelated magic numbers (`HyperView`'s local `fdim = 0.62`, `Ribbons`' exported
`RIBBON_DIM = 0.2`). One row field replaces both, resolved by `offNetMul(view)`, which returns the
SURVIVING brightness so the knob keeps `dim`/`hide`'s strength polarity (0 = off). It is read **per
view, not `viewMix`ed**: furniture belongs to one view and fades out with it, so blending a neighbour's
value would describe elements that are no longer drawn. One knob may still drive two CHANNELS of the
same element where the look needs it: hyper's hub BODY takes a fraction of the drop (`HUB_BODY_SOFT`)
so an unfocused hub stays legible as a position while its light goes; `elem: 0` removes both, which is
what keeps it one knob.

⚠️ **THE DAG CORE'S OWN FURNITURE IS FURNITURE TOO** (user, 2026-08-11 — *"dim elements in hyper view
does not affect the rings of the core in the middle"*). ONE NODE MODEL: the core is a metagraph-shaped
hub, so its hoops, rim fills and glow read `elem` like every other hub's — they had kept three magic
coefficients of their own (0.5, 0.5, 0.6) and so sat at full brightness while every metagraph's dropped.
The one difference is the switch: a hub flips on a binary `focusOther`, the core eases on `_coreDim`
(the DAG tracks the highlight state gradually), so the knob is LERPED by it — `coreOffMul = 1 −
_coreDim × (1 − hubOffMul)`. The core BODY keeps full opacity, which is the hub's soft channel taken to
its limit: the one sphere at the origin is the structure's centre and always reads as a position.

⚠️ **A SNAPSHOT IS DATA, NOT FURNITURE** (user, 2026-08-11). `elem` is hyper's alone, because both
other views honestly answer `0`: geo's globe draws no per-network furniture (its off-filter answer is
the nodes' `hide` isolate), and everything the chamber emphasises — the byte bands, the lane tiles, the
ribbons — is a real snapshot, so it reads the NODE vocabulary instead. `snapBright()` in
`domain/dimModel.ts` is that one call: the ledger row's own `dim`, `boost` and `back`, exactly what the
chips in its trays answer to, applied to whichever resting level the instrument owns (the bar's is an
opacity, the tiles' a colour multiplier — two numbers, one per instrument, and nothing else left in
those `*_TUNE_DEFAULTS`). So the chamber gained the focus boost and the dim-back it never had, and one
knob moves one effect across nodes and snapshots alike. **COLOUR stays fully independent** — identity
hue vs the neutral trail is the chamber's own second reading, decided at the call sites and untouched
by any of these knobs.

⚠️ **ONE NODE MODEL** (user, 2026-08-11). *"Across all views I want no difference between DAG nodes and
other metagraphs — they are the same network topology, only positioned differently in some views."* The
dim code had FOUR split points, all of them hyper-only (geo and the ledger already carried identical
numbers for both pools): separate `core`/`meta` row fields, twin `validatorDim`/`metaNodeDim` with
identical bodies, twin emissive resolvers differing by a sub-1% coefficient, and — the root — hyper's
`0.32` dim BAKED into `NodeFabric`'s resting constants (`1 − 0.32 = 0.68` scale, `0.47 × (1 − 0.32×0.92)
≈ 0.33` glow). With the dim pre-applied as the resting look, the live dim *had* to be zeroed or it would
apply twice; that zero is the whole origin of the split, never a design decision. `domain/dimModel.ts`
now exposes ONE `dim` row field and one `nodeDim`/`nodeGlow`/`nodeEmissive` triple that both pools call.
That asymmetry's last survivor, `hubMatchBoost`, is RETIRED (user, 2026-08-30, structural): **a
committed filter adds NO light to member nodes, in any view.** The commit is answered by each
view's own channel — hyper by the HUB and the others' `elem`/`dim` drops, geo by the isolate
(`hide`; no per-network furniture exists there), the ledger by the coloured dim — and light added
to a node is reserved for the FOCUS vocabulary (the hovered/committed node, a group while it is
the finest rung). Member nodes keep their at-rest colour under a filter everywhere; the rule's
executable pin is in `dimModel.test.ts`. The core's own SPHERE follows
the same rule and is now the shared `HUB_ORB` geometry at hub size (was r 1.5 vs the hubs' 0.9): *"its
central position already tells it's a bit different from the others, not size"* (user, 2026-08-11).

**The camera folder is a READOUT, not sliders**: poses are ~8 constants and each needs its own selection
state to even see, so orbiting to a pose you like and reading it off beats dragging numbers.
`capture ← live` dumps the raw `pos`/`target` **with a caution naming the levers the Engine composes on
top** (`dollyBack`, `railsLean`, and the subject-relative hub framings). Deliberately raw — per-pose
inverses would be a second home for pose knowledge that drifts silently.
