# Multi-network: mainnet, integrationnet, testnet — design

**Date:** 2026-08-20 · **Branch:** `multi-network` · **Status:** approved by the user, section by section.

The visualizer connects to one Constellation network per page load. Today that network is
hardcoded to mainnet across config, nine server routes and one bake script. This design makes the
network a **parameter**: `?net=integrationnet` / `?net=testnet` select a dev network, the bare URL
stays mainnet, and everything the app does — catalog, routes, palette, accent, chamber — follows.

## Locked decisions (user)

1. **Switch, not simultaneous** — one network live at a time; mainnet boots by default.
2. **Full parity** — "exactly the same as on mainnet; visualize it." The network is a parameter,
   not a feature tier.
3. **Network identity is all three of:** (a) the control names the current network, (b) a
   transient signal on switch, (c) a subtle colour cue.
4. **Tint reach: everywhere, mainnet anchored** — mainnet stays byte-identical; dev networks shift
   the structural accent through the HUD affordances, live dots, ECG, selection washes AND the 3D
   scene.
5. **URL param** — `?net=testnet`; mainnet is the bare URL, no param. Query string ONLY, never the
   hash (a hash never reaches the server; `#net=testnet` would give a violet client talking to
   mainnet routes). This deliberately diverges from the dev-flag idiom (`?stats` etc. read
   `search + hash` — Engine.ts:408); `?net=` is not a dev flag and must never be stripped.
6. **Approach A** — boot-time resolution on the client, per-request on the server. Rejected:
   B (runtime store-key switch — the module-scope lane derivations and the long-lived engine
   instance make a live switch a rebuild of everything), C (route segment `/[net]` — makes every
   page dynamic and every internal link network-aware).
7. **Cost accepted:** hard reload on switch (~2s); the transient switch signal is the existing
   boot sequence, which on a dev network renders in that network's accent. (Section 5 refines the
   mechanism from `location.assign` to real `<a href>` anchors — same reload, better semantics.)
8. **Three distinct accents** — "separate color for testnet also."
9. **The network select sits on the RIGHT of the command bar**, "same location as the dag explorer
   essentially"; reshuffling other controls is authorized; the view switch must stay centered.
   Resolved as position (a): rightmost, after the PresentationToggle.

## Live probe findings (2026-08-20; all endpoints HTTP 200)

| | L0 nodes (Ready) | metagraphs | latest global ordinal |
|---|---|---|---|
| mainnet | 159 (157) | 11 | 6,790,908 |
| integrationnet | 102 (93) | 18 | 5,894,023 |
| testnet | 18 (14) | 5 | 3,251,123 |

- Host scheme uniform: `be-{net}.constellationnetwork.io`, `l0-lb-{net}…`, `l1-lb-{net}…`. All
  serve `/global-snapshots/latest`, `/cluster/info`, `/node-params`.
- The explorer directory takes the network **in the path**:
  `https://production.dagexplorer-api.constellationnetwork.net/{net}/metagraphs`. Same entry keys
  on all three (`id, name, description, symbol, iconUrl, siteUrl, stakingWalletAddress,
  feesWalletAddress, urls`).
- testnet `/node-params` is 358 B — essentially empty; the future Staking view degrades honestly.
- integrationnet metagraphs (18): ChainStats/STATS, Digital Evidence/DED, BLDR, ACY,
  PacaSwap/SWAP, ACX, The Void/HALO, Hypermatrix/HPMX, The Upsider AI/UP, BioFi, Common Crawl/CMC,
  AutoSight/AUTO, El Paca/PACA, Cyberlete/LEET, Intrana/INT, National Digifoundry/NDT,
  Metagraph Token/MGT, Dor Technologies/DOR.
- testnet metagraphs (5): PacaSwap/SWAP, ACX, ACY, Dor Technologies/DOR,
  Constellation Test Token/CTT.
- Metagraph ids are globally unique across networks (PacaSwap mainnet `DAG7X5idd…` vs testnet
  `DAG1VF44t1ZaxK9gknpEYRysm3MBm7rsxhaARUGb`).

---

## 1 · Config, resolvers, catalog

**`src/engine/config.ts` stays pure static data and goes plural.** It gains:

- `type NetworkId = "mainnet" | "integrationnet" | "testnet"`
- `NETWORKS: Record<NetworkId, NetworkDef>` — each network's four hosts: the block-explorer API
  (`be-…`, today's `API_BASE`), the L0 and L1 LBs (today's `L0_CLUSTER` / `L1_CLUSTER`), and the
  explorer **directory URL as a whole field** (the one asymmetry: the network rides in its path,
  not its hostname).
- `CATALOG: Record<NetworkId, MetaConfig[]>` replacing the flat `METAGRAPHS` export — 11 / 18 / 5
  rows, `MetaConfig` unchanged.
- `COLORS` stays **exactly as today** (see amendment 2 below).

**One resolver per side, sharing one validator.**

- `src/net/current.ts` (client): reads `location.search`'s `net` param once at first module
  evaluation, validates against the three ids, falls back to mainnet on anything unrecognised,
  freezes. Exports `NET: NetworkId`, `NET_DEF`, the resolved `METAGRAPHS` (a frozen module-scope
  array — so every module-level lane derivation keeps working untouched), and `netUrl(path)`.
  Under Node (vitest, SSR) there is no `location`, so it resolves mainnet — which is what keeps
  the whole existing test suite green.
- `src/net/request.ts` (server): `netOf(req)` reads the same param through the same validator
  with the same fallback. Routes then read `NETWORKS[net]` / `CATALOG[net]` per request.

**`netUrl(path)` is the one client fetch helper.** It appends **nothing on mainnet** — mainnet's
`/api/*` URLs stay byte-identical, so existing CDN and browser cache keys are preserved — and
appends `?net=…` (or `&net=…` when the path already carries a query) on dev networks. All ten
current client fetch sites route through it:

```
src/engine/Engine.ts:650              /api/metagraphs
src/data/geoResolve.ts:13             /api/geo
components/datasection/AnchorLogTable.tsx:129,159
components/useArchive.ts:176,206,264
components/useNodeNames.ts:18         /api/node-names
components/RawSnapshotBridge.tsx:47,126
```

**Catalog import moves, shape doesn't.** Client modules switch
`import { METAGRAPHS } from "@/src/engine/config"` → `from "@/src/net/current"`. Non-test
consumers: pickActions.ts, ledgerBands.ts, ledgerModel.ts, ledgerLayout.ts, Engine.ts,
identity.ts, api.ts, hoverSubject.ts, LedgerView.ts.

**Rule 1 needs no widening — correction to an earlier draft.** `layerBoundaries.test.ts` is a
**denylist** (forbids `scene/`, `three/addons`, `react`, store value imports); `@/src/net/current`
matches none of its patterns, so `domain/` importing it passes with zero test-code change. The
plan carries a **header-comment edit only**, recording that `domain/` may import the network
resolver because it is still pure frozen data — the same standing `config` has.

**The store gains nothing.** The network is fixed for the page, so it isn't state.

### Amendment 1 — the mirror-drift claim was wrong (user-corrected)

An earlier draft claimed static-mirror drift would leave "the DAG's own chip cyan while the page
turns violet." Verified false: `metagraphById("dag")` returns
`{ ...DAG_CFG, color: identityHudNumber(id) }` (network.ts:290), so the literal
`color: COLORS.core` is overwritten — the DAG's HUD hue is the baked brand pin in
`data/brand-hues.json` (`"dag"` → 248.999, `#1050e0`), exactly like BioFi's. And `filterAccent`
returns a live `var(--primary)` for "all", so it tracks the token, never the mirror.

### Amendment 2 — `COLORS` does not change at all

The originally-drafted `COLORS: Record<NetworkId,…>` is **cut**, along with the planned
`accentMirrorBoundary` test. Reframed: section 2 overrides `:root` with a `[data-net]` rule, so
the mirror stays an accurate mirror of `:root` — `:root` just stops being the whole story. A
prohibition becomes a fact. Three consequent edits:

1. **hoverSubject.ts:9** — `CORE` becomes the literal string `"var(--primary)"`; the `COLORS`
   import goes. Verified end to end: the only consumer of `tooltipSubject` is Engine.ts:1316,
   which builds a change-detection key (a `var()` string discriminates fine) and writes
   `st.setHover(subj)`; Tooltip.tsx:47 renders `style={{ color: hover.color }}` — a CSS property,
   which resolves `var()` natively. No DOM read; the module keeps its Node-test safety.
2. **RailThread.tsx:88–95** — set `color: filterAccent(filter)` as a style property on the SVG
   and make the five accent attribute sites (269, 286, 291 `stroke`; 295, 296 `fill`)
   `currentColor`. The `rawAccent.startsWith("var(")` ternary disappears, and with it the whole
   2026-08-08 bug class: both `var()` cases now resolve structurally. `currentColor` is a native
   SVG keyword (the lucide idiom), not a `var()` in an attribute, so the noHardcodedColors
   allowlist note is not contradicted — but verify it empirically in the browser. Line 317's
   `["--spine"]: accent` is already a custom property and is fine. Detail for the plan: confirm
   whether `color` sits on the `<svg>` or its wrapper. Fallback if `currentColor` snags:
   RailThread already runs a measure effect, so an effect-based token read is available with no
   SSR mismatch.
3. **Fallout (grep-verified):** RailThread was the only non-test consumer of both resolved
   hexes, so `CORE_HEX` (network.ts:15) and `UNLISTED_HUD_HEX` (unlisted.ts:39) are **deleted**.
   identity.ts:28's private `const CORE_HEX` is a different const behind an unreachable `??` and
   **stays**.
4. **One loose end, two lines:** the Engine's dev drift-warning (Engine.ts:311–322) compares the
   mirror against live tokens; with `--primary` overridden per network it would fire spuriously —
   skip the `core` comparison when `NET !== "mainnet"`, keeping `dagCore`/`bg` checked (neither
   is overridden).

This also disposes of the one known SSR hazard: RailThread resolving a hex during SSR would have
emitted mainnet cyan into HTML and hydrated to magenta under `?net=testnet`; with `currentColor`
no accent is resolved in JS at all. Open check for the plan: confirm no other catalog-derived
value reaches the SSR'd HTML (belief: none does — boot state is `filter:"all"`, empty `metaList`,
ghosts everywhere).

---

## 2 · The network's colour

One `--primary`/`--ring` pair per network, all at chroma 0.13:

| | token | renders | ΔE vs mainnet |
|---|---|---|---|
| mainnet | `oklch(0.88 0.13 195)` | `#53f2f2` cyan | — |
| integrationnet | `oklch(0.78 0.13 300)` | `#c4a4fe` violet | 0.229 |
| testnet | `oklch(0.84 0.13 327)` | `#f7acf7` magenta | 0.241 |

Dev-to-dev separation 0.085 (~5× JND); three colour families; no gamut reduction at these
lightnesses. Lightness differs per row because each hue's in-gamut chroma peaks at a different
brightness (cyan peaks bright, purple darker — the reason an earlier violet-305-at-L0.88 draft
was washed out). The values are computed once and baked; lightness is not a second tuning
variable. `--primary-foreground: oklch(0.14 0.02 265)` stays for all three (contrast verified).

**Why these hues.** palette.ts reserves six structural guard bands (red 25 · amber 90 · green
165 · cyan 195 · blue 265 · violet 300, ±16°). Violet 300 is reserved and unclaimed —
integrationnet simply claims it; no palette change. Magenta 327 has no band, so testnet's
`ALLOWED` **swaps** one: takes a 327 guard, hands cyan 195's guard back (cyan is no longer the
accent there). `ALLOWED` becomes derived per network from that network's guard list. Slots:
mainnet 23 (unchanged), integrationnet 27 (pure +4: the violet band already existed), testnet 24
(327 guard cuts slots 316/324/332/340; freeing 195's band adds 179/187/195/203; net +1).

**PacaSwap, settled by arithmetic:** testnet's magenta sits 18° from PacaSwap's baked brand hue
(345.2°), separation 0.061 — but `SLOT_STEP` is 8°, so adjacent metagraph chips are routinely
0.018 apart, three times narrower. Not a collision. Rejected: re-pinning PacaSwap's brand hue on
dev networks (brand hue is brand hue); amber ~90 as an accent (it is `--warn-soft`, semantically
"caution").

**Mechanism.** The hues live in `app/globals.css` alone. All three are defined in `:root`
always — `--net-mainnet`, `--net-integrationnet`, `--net-testnet` — one home, and the switch
popover can name all three on any network. Each dev network gets one `[data-net="…"]` rule
pointing `--primary` and `--ring` at its token. **Mainnet gets no rule**, so its rendered CSS is
byte-identical. `data-net` is written on `<html>` before first paint (section 5's inline script).
The 3D scene needs no change: `readSceneColors()` already reads `--primary` off the live DOM at
boot. Clearances verified: `--core` blue `#618df3` 0.151/0.235, `--destructive` red 0.274/0.271
against the two dev accents — no live check needed.

---

## 3 · The server routes

**Nine files hold a mainnet host outside config.ts**; each asks `NETWORKS[net]` instead, with
`net` from `netOf(req)`:

```
app/api/snapshot/ordinalWindow.ts:30      app/api/snapshot/fetchGlobal.ts:11
app/api/node-names/route.ts:16            app/api/global/at/route.ts:16
app/api/archive/probe.ts:23-24            app/api/network/[address]/snapshots/route.ts:21
app/api/network/[address]/snapshots/[ordinal]/route.ts:13
app/api/network/[address]/chain/route.ts:12
scripts/bake-ledger-scale.ts:16           (script: takes a network argument instead)
app/api/metagraphs/route.ts:23            (the directory URL — network in the PATH)
```

(`constellationnetwork.io` in about/page.tsx, layout.tsx, network.ts:278 and bake-brand-hues.ts:89
is the marketing-site URL — untouched.)

**Two routes are per-network beyond a hostname:** `ordinalWindow.ts` (each chain has its own
head: ~6.79M / 5.89M / 3.25M — the window is already computed from a live reference read, so this
is "read the right chain", not new logic); `archive/probe.ts` (mainnet's census of 152 nodes / 9
archival says nothing about testnet's 18 — the census runs per network, 6h revalidate unchanged).

**Every `unstable_cache` key gains `net`** — twelve sites (ordinalWindow:35,
network-snap-record:51, metagraphs:142, archive-probe:266, network-snapshots-before:76,
node-names:23, geo:30, network-chain-span:55, snapshot-exact:125, be-global:39, global-at:69,
channel:71). Mainnet's keys change too, so mainnet's server cache re-warms once on deploy —
seconds of upstream fetches, accepted rather than contorted around.

**The one real cost: three prerendered routes flip dynamic.** `/api/metagraphs` (`○ Static`
today), `/api/geo` and `/api/node-names` read a search param, which makes them `ƒ`. The answer is
to move caching one layer out: each gains
`Cache-Control: public, s-maxage=<its revalidate>, stale-while-revalidate=…` — the shape
`/api/archive` and `/api/node-names` already use — so the CDN caches **per URL** and mainnet's
hit behaviour is preserved; `unstable_cache` stays underneath. CLAUDE.md's phase-boundary check
("`/api/metagraphs` should stay `○ (Static)` with `5m` revalidate") becomes stale; the plan
carries that doc edit (the new check: `ƒ` with `s-maxage=300`).

**Failure semantics unchanged:** honest 503, no baked fallback, transient upstream failures
throw so the next request retries, deterministic misses cached like successes.

---

## 4 · Catalogs & baked artifacts

- **`CATALOG` goes plural, the shape doesn't** (section 1). `MetaConfig` unchanged.
- **`brand-hues.json` stays one flat id-keyed file.** Ids are globally unique across networks, so
  all ~34 entries absorb with no network key. `scripts/bake-brand-hues.ts` gains a loop over the
  three networks; `brand-hue-overrides.json` remains the escape hatch. `country-codes.json` is
  network-independent.
- **Palette slots fit everywhere:** integrationnet 19 needed (18 + dag) vs 27 available; testnet
  6 vs 24; mainnet 12 vs 23. Stated caveat, not fixed: an *unpinned* metagraph on two networks
  could hash to different hues per network — low stakes, since unpinned means absent from
  brand-hues.json, and brand pins win outright.
- **`BYTE_SCALE_KB` is baked per network** — `bake-ledger-scale.ts` gains the network parameter.
  Known calibration gap carried forward: the bake sums only LISTED metagraphs' `sizeInKB` × 1.08
  while the bar renders the exact read's `totalSizeKB`, which counts every channel.
- **Lane geometry needs no work — it recomputes:**

  | | lanes (+unlisted) | `lanePlaneHalf` | tray `cap` |
  |---|---|---|---|
  | mainnet | 12 | 0.940 | 0.818 |
  | integrationnet | 19 | 0.458 | 0.481 |
  | testnet | 6 | 2.428 | 2.046 (growth term wins) |

  `clusterRadius`'s own header anticipated both directions: more lanes = narrower Z step = taller
  trays (`ledgerSpread` sends overflow up, never overlapping chips); a small catalog falls back
  to the growth term (testnet). **One live-verification item:** integrationnet's 19-lane chamber
  at the resting pose — correct arithmetic and readable-at-19-lanes are different claims.

---

## 5 · The switch control

**Position (a), chosen by the user:** rightmost, after the PresentationToggle.

```
[◉ DAG VISUALIZER] │ [● All ⌄]      [views]      │ [vitals] │ [present] │ [MAIN ⌄]
```

Named cost, resolved by reframing: PresentationToggle's header says it sits "LAST because it acts
on everything to its left" — the network acts on everything *including* the presentation toggle,
so the rule, applied consistently, supports (a): the right edge escalates in scope and the bar
reads as a valley (broadest framing at both outer edges — brand = what this app is, network =
which chain; the most specific controls in the middle). **The plan carries the PresentationToggle
header edit.**

**Centering fix — the grid promotion.** A self-correction: the tablet/desktop
`[left][flex-1][switch][flex-1][right]` row does NOT keep the switch centered when L ≠ R (TopBar's
own phone comment records the ~28px symptom). Fix: promote the phone's existing
`grid-cols-[1fr_auto_1fr]` (TopBar.tsx:132) to all widths — the zone wrappers already exist in
the DOM (lines 137, 289) as `display: contents` above 700px, so this turns on a built mechanism;
the two flex spacers go. Honest caveat: `1fr` is `minmax(auto,1fr)`, so a zone that outgrows its
share still pushes the centre — it centres while both zones fit and degrades as flex does.
`minmax(0,1fr)` would hard-centre but clip zone content under the bar's `overflow-hidden`. Keep
auto-min; the dev overflow alarm arbitrates.

**The face:** short code **MAIN / INT / TEST** plus the filter's own `ChevronDown`. **No identity
dot** — each network's accent IS `--primary`, and the filter's "all" face already renders a dot at
`var(--primary)`; two identical dots in one bar. Colour rides the word: mainnet muted, dev
networks `text-[var(--primary)]` — decisions 3(a) and 3(c) in one object at zero extra width.
Short codes chosen by width arithmetic (full names ≈151px worst case) and by grammar (the filter
face already shows tickers), and they make the control's width independent of which network is
live. No glyph.

**The surface:** the adopted Popover (`components/ui/popover.tsx`), three rows, each a **real
`<a href>`** — `/`, `/?net=integrationnet`, `/?net=testnet`. A refinement of decision 7, not a
contradiction: same hard reload, but middle-click, hover-preview, copy-link and back all work
(the brand is already a plain `<a>` for the same reason). Current row wears `SELECTED_ROW` +
`aria-current="page"`; trigger is `<button aria-haspopup>` with an aria-label naming the current
network. Popover spineless at rest. **Not** the filter strip — one strip, one purpose, and two
toggles fighting over `--topbar-extra` is a mess.

**How `data-net` reaches `<html>`.** layout.tsx is a server component and layouts cannot read
`searchParams`. Rejected: a page-level `<div data-net>` (sheets/popovers/tooltip portal into
`document.body`, outside it — they'd render mainnet cyan); middleware + `headers()` (makes the
layout, and so every page, dynamic). **Chosen: a synchronous inline `<head>` script** reading
`location.search`, validating through the same three-id list, setting
`document.documentElement.dataset.net` — before first paint, shell stays static. CSP already
permits it (`script-src … 'unsafe-inline'`, next.config.mjs:27; layout.tsx already uses
`dangerouslySetInnerHTML` for JSON-LD). `<html>` gains `suppressHydrationWarning`.

**Phone:** the right zone is the PresentationToggle alone there (vitals ride the filter strip's
second row), so the network control lands in the emptiest zone while relieving the crowded left
(~114px of content in a ~99px column). Re-measure at 360/390/430. Pre-committed fallback, the
repo's own move ("No chevron on phone"): drop the chevron, code alone; failing that, the strip's
second row beside `<VitalsCluster align="center" />`. The filter strip opens normally on phone
(the force-close effect fires only on a transition INTO phone width — dependency `[bp]`).

**Width arithmetic** (~93px + ~9px divider; estimates — the dev overflow alarm arbitrates):
wordmark `max-[1439px]` → ~1530; view labels `max-[1299px]` → ~1390; dividers + `soon` views
`max-[820px]` → ~915. **The control never hides at any width** — "which chain am I looking at"
must not go missing; if another rung is needed, drop the chevron before the word.

**Decision 3(b) needs no new chrome:** the hard navigation replays BootOverlay, which on a dev
network renders in that network's accent — the switch announces itself for ~2s. Decision 7
already bought this.

**Param propagation:** the `/about` and `/design` links carry `?net=` through, or the accent
snaps back to cyan mid-session. One line each.

---

## 6 · Testing

**New tests — two:**

1. **`netUrl` boundary test**, shaped like `src/data/signerMatchBoundary.test.ts` (walk
   `components`/`src`/`app`, strip comments, grep, exempt-with-reason): no client file calls
   `fetch` with a `/api/` literal except through `netUrl()`. The home is `src/net/`; all ten
   current fetch sites convert, so the exemption list starts empty. This keeps the eleventh fetch
   site — written months from now — from silently talking to mainnet under `?net=testnet`.
2. **Colocated resolver tests** (`src/net/current.test.ts`, `src/net/request.test.ts` — rule 4
   reaches new pure modules): the three ids validate; anything else falls back to mainnet;
   `netUrl` appends nothing on mainnet (the byte-identical-URL / CDN-key property as an
   assertion, not a comment) and appends `?net=`/`&net=` correctly on dev networks.

**Edited tests — three:**

3. **`src/palette/palette.test.ts`'s guard-band test** becomes network-aware — the only
   substantive palette-test edit. With `ALLOWED` derived per network, it asserts each network's
   slots avoid *that network's own* guard list, plus one assertion that every network's slot
   count covers its catalog (23≥12, 27≥19, 24≥6).
4. **`src/data/hoverSubject.test.ts`** — `CORE` becomes the literal `"var(--primary)"`, the
   `COLORS` import goes, and the two-line comment is rewritten: "derived from the SAME source …
   so a token change can't silently break this" stops being true; the new rationale is that CSS
   resolves the token at render time, so there is nothing to keep in sync. The three assertions
   stand.
5. **The eleven `METAGRAPHS`-importing tests** (followFlow, ledgerModel, identity, ledgerLayout,
   ledgerBands, unlisted, ledgerStory, pickActions, + comment-only dataExportCoverage:52) —
   import path moves to `@/src/net/current`, no assertion edits: under Node the resolver answers
   mainnet, and every use is `METAGRAPHS[0].id` ("some listed id") or `METAGRAPHS.length`
   ("however many lanes").

**Expected green, with reasons:**

- **Rule 1** (`layerBoundaries.test.ts`): denylist — `@/src/net/current` passes; header-comment
  edit only (section 1).
- **Rule 3** (`noHardcodedColors.test.ts`): no allowlist edit. Amendment 2 touches only the five
  RailThread accent sites (runtime-computed, never literals); the two allowlisted RailThread
  literals (`0xb2c1df` ruler, `0x0c1020` punch-out ring) are the structural mirrors and stay. The
  allowlist note warns about `var(--…)` in SVG attributes; `currentColor` is a native keyword,
  not a `var()` — no contradiction, verified empirically anyway.
- **The five globals.css-reading tests** (breakpointArm, railTier, cssTrap, noHardcodedColors,
  calloutPlacement): the three `--net-*` tokens and two `[data-net]` rules trip none of them —
  no gradient behind a `bg-[var()]` (trap 3), no `text-*`/`rounded-*`/`tracking-*` utility
  (trap 6), no breakpoint arm.

**One cut, stated because section 1 originally promised it:** the `COLORS.core` accent-mirror
boundary test is gone with amendment 2 — `COLORS` no longer changes, so there is nothing to fence.

**Live verification (not vitest):** integrationnet's 19-lane chamber at the resting pose; the
boot sequence rendering in the dev accent; `?net=` surviving the `/about`/`/design` round trip;
`currentColor` on the rail thread in the real browser; the phone bar at 360/390/430 with the
network control in the right zone.

---

## Reference — measured colour data (do not re-derive)

Max in-gamut chroma by lightness (oklch, via palette.ts's own `oklchToHex`):

| hue | L 0.88 | L 0.84 | L 0.80 | L 0.76 | L 0.72 |
|---|---|---|---|---|---|
| cyan 195 | 0.150 | 0.143 | 0.137 | 0.130 | 0.123 |
| violet 300 | 0.069 | 0.093 | 0.119 | 0.145 | 0.172 |
| magenta 327 | 0.111 | 0.154 | 0.198 | 0.242 | 0.288 |

Mainnet's chroma is 0.13, deliberately below cyan's 0.150 ceiling — match it, don't max it.
Corridor walls: `--core` blue 265 + 16° guard → accent ≥ 281; PacaSwap 345.2 − 16° → ≤ 329.
Rejected cyan-family option: teal 183 / blue-cyan 209 separations 0.027 / 0.032 — indistinguishable.
