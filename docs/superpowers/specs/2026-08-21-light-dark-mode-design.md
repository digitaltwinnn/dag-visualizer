# Light/dark mode — design

**Date:** 2026-08-21 · **Branch:** `light-dark-mode` · **Status:** approved by the user, section by section.

The app is dark-only today. This design adds a light theme that reaches **everything, the 3D
scene included** — a designed "day instrument" look (ink on paper), not a lightened copy of the
dark one — behind a three-state System / Light / Dark control with an instant flip.

## Locked decisions (user)

1. **The scene themes too** — not HUD-only chrome around a dark canvas.
2. **Three-state System / Light / Dark**, persisted; System follows `prefers-color-scheme`.
3. **Instant flip** — no reload; the engine re-threads colours live.
4. **The control lives in the command bar.**
5. **The light scene is a "day instrument"** — pale paper/blueprint ground, nodes and ribbons as
   saturated dark-ink marks, bloom near-off; a designed second look, not a dimmer switch.
6. **Approach: `light-dark()` per token** (over duplicated `[data-theme]` blocks): every themed
   token is defined ONCE as `light-dark(light, dark)`; the three-state mechanism collapses to
   `color-scheme` (`:root { color-scheme: light dark }` IS the System state — the browser
   resolves it and OS flips propagate live for free; `[data-theme="light|dark"]` pins it). No
   duplicated blocks, no drift surface. Browser support (Chrome 123+, Safari 17.5+, FF 120+) is
   a subset of what the WebGL app already requires.
7. **Scope split:** this spec covers the infrastructure plus a FIRST-PASS light look
   (sub-project 1). The per-view "day instrument" refinement is sub-project 2 — live design
   sessions against the running app per the repo's own design workflow, deliberately not
   spec'd. Don't judge the light look by sub-project 1's output.

## Measured facts (2026-08-21 — do not re-derive)

- Token inventory in `app/globals.css`: **111 custom properties; 32 are colour-bearing
  definitions** (the whole `light-dark()` conversion set — lines ~478–621); 39 chain through
  `var()` and theme automatically; the rest are structural (px, timing, easing) and don't theme.
- **Cyan flips from the widest hue to the narrowest at ink lightnesses.** Max in-gamut chroma:

  | hue | L 0.45 | L 0.50 | L 0.55 | L 0.60 |
  |---|---|---|---|---|
  | cyan 195 | 0.076 | **0.085** | 0.093 | 0.102 |
  | violet 300 | 0.240 | 0.266 | 0.293 | 0.258 |
  | magenta 327 | 0.208 | 0.231 | 0.254 | 0.277 |
  | core-blue 265 | 0.308 | 0.280 | 0.248 | 0.216 |
  | red 25 | 0.182 | 0.202 | 0.222 | 0.243 |
  | green 165 | 0.094 | 0.105 | 0.115 | 0.126 |

  (On dark ground cyan peaked at 0.150 while violet starved — the inversion is why the light
  accents get their own shared L/C rather than reusing the dark chroma.)
- Identity-lane gamut at ink lightnesses: roughly half the hue wheel exceeds C 0.14–0.16 at
  L 0.5 — fine, because the generator's chroma-reduction gamut mapping already handles per-hue
  ceilings for the dark lanes today.

---

## 1 · The token layer

- `:root` gains `color-scheme: light dark` (the System state). Explicit choice pins it:
  `:root[data-theme="light"] { color-scheme: light }` and the dark twin. That is the entire
  switching mechanism — no `[data-theme]` token blocks exist.
- The 32 colour tokens each become `light-dark(lightValue, darkValue)` at their one definition
  site. **Dark values verbatim** — dark mode's resolved values are pinned identical to the
  shipped look. The 39 `var()`-chained tokens follow automatically.
- The `--net-*` accents are among the 32: their light variants keep each network's hue at the
  shared ink L/C (§5) — today's L 0.78–0.88 are dark-ground values and wash out on paper.
- **Pre-paint stamp** — the `data-net` script's twin in the same `<body>` slot: read
  `localStorage["dagviz:theme"]`, stamp `data-theme` iff the value is exactly `"light"` or
  `"dark"`; absence/anything else = System = no attribute. Same CSP posture; same React-19
  caution (controls render their state post-mount — the NetworkSwitch pattern).
- Special cases:
  - `--axis-hairlines` is a gradient token: `light-dark()` per colour STOP (it is a `<color>`,
    not an `<image>` — trap-3 kin).
  - **The rule-3 allowlisted component literals join the theme.** TopBar's inline glass
    gradient, the sheet scrim, and RailThread's hand-mirrored ruler/punch-out literals exist
    because SVG ATTRIBUTES can't resolve `var()` — but CSS PROPERTIES targeting SVG elements
    can (the 2026-08-08 finding was about attributes). The RailThread ruler lines get classes
    styled from globals.css; the literals become tokens; the `noHardcodedColors` allowlist
    SHRINKS.
- Deliberately theme-blind: the opengraph image (baked static asset), `config.COLORS` (stays
  the dark mirror — §4), `*_TUNE_DEFAULTS`.

## 2 · Theme state & the control

- **Store gains two keys**: `themePref: "system" | "light" | "dark"` and the resolved
  `theme: "light" | "dark"` — the only value engine and components consume. (Theme is genuine
  runtime state, unlike the network.)
- **One owner**: a client `ThemeController` in the page shell — reads localStorage on mount,
  listens to `matchMedia("(prefers-color-scheme: dark)")` while pref is System, stamps/removes
  `data-theme`, persists on change. Only explicit `"light"`/`"dark"` are ever stored; absence
  IS System (keeps the pre-paint script branchless).
- The engine learns of flips the only allowed way: one more store subscription in the Engine
  bridge, driving §3's `_refreshTheme()`.
- **The control is an icon cycle button** (~36px ghost, `Monitor`/`Sun`/`Moon`, aria-label
  naming current and next state), sitting **between PresentationToggle and NetworkSwitch** — a
  "how it looks" control beside presentation; the network keeps the outermost slot. On phone it
  joins the NetworkSwitch in the filter strip's second row. Icon renders post-mount; the bar's
  dev overflow alarm re-arbitrates the width thresholds once it's real.

## 3 · The engine re-thread

- **Most of the scene retints for free**: instanced colours, dim/emissive and tile brightness
  are written PER FRAME through the dimModel resolvers reading the colors object the Engine
  threaded in. `Engine._refreshTheme()` re-runs `readSceneColors()` and the themed scene lane
  (§4), swaps results into the SAME threaded object, and per-frame writers repaint next frame.
- The construction-time survivors each get `setColors()` on their adapter (plain data in —
  rule 1 untouched): glass shader uniforms, NodeFabric material tints, the starfield, the scene
  clear colour; the Ribbons' baked vertex colours re-push through the exact `onChange` path
  `?tune` already uses; `TextLabel` canvas textures redraw; **the bloom pass** becomes a
  per-theme strength/threshold pair read at refresh (the one post-processing parameter that
  themes); StageLight tints ride the swapped object.
- **The flip is an instant snap, deliberately** — CSS flips atomically on the same click, and a
  scene cross-fade synchronized against a CSS repaint is complexity with no payoff. Reduced
  motion is a no-op by construction. `?tune` knobs are orthogonal.
- ⚠️ Named trap: any module holding a `THREE.Color` COPY of a threaded colour at construction
  won't follow the swap — the implementation pass greps `new THREE.Color(`/`.clone()` over
  construction paths and converts offenders to `setColors` recipients. (A review lens, not a
  boundary test — a mechanical classifier would flag every legitimate scratch colour.)

## 4 · Identity hues per theme, and the mirror

- **Hue never themes.** brand-hues.json, assignPalette, guard bands, per-network ALLOWED — all
  untouched. Only each lane's L/C themes.
- **The HUD lane goes CSS-native**: two tokens `--ident-l` / `--ident-c` (light-dark()), and a
  new `identityHudCss(id)` returning `oklch(var(--ident-l) var(--ident-c) <deg>deg)`. Every
  HUD identity mark retints on flip with ZERO React re-renders — the browser resolves the
  tokens (amendment-2's mechanism, extended to identity). `filterAccent`'s metagraph branch
  migrates to it; the module stays pure and Node-safe (it emits a string, no DOM read).
  `identityHudHex` survives only where a genuine hex is unavoidable — the implementation pass
  greps to prove where.
- **The scene lane themes explicitly**: `SCENE_L/C` become per-theme pairs;
  `identitySceneHex(id, theme)` takes the theme; the Engine passes `store.theme` at refresh.
  `UNLISTED_SCENE_HEX` becomes a pair; `UNLISTED_HUE` already rides `var(--muted-foreground)`.
- **`config.COLORS` stays the dark mirror** (its consumers — SSR, bake scripts — have no DOM
  and no theme). The Engine's dev drift-warning gains the theme gate beside the network one:
  compare only on mainnet-dark, the one state `:root` fully describes.

## 5 · First-pass light values (all live-tunable; sub-project 2 refines)

- **Accents** — one shared L/C bounded by cyan's measured ceiling:
  `oklch(0.50 0.085 195 | 300 | 327)` (teal / violet / magenta ink). Structural kin:
  `--core: oklch(0.45 0.16 265)`, `--destructive: oklch(0.50 0.18 25)`,
  `--success: oklch(0.45 0.10 165)`, `--warn-soft` a darker amber.
- **Ground & ink**: `--background: oklch(0.965 0.008 265)` (cool paper, not pure white);
  `--foreground: oklch(0.24 0.03 265)`; panels as white glass `rgba(252,253,255,0.78)` with
  deeper blue-alpha borders; `--sel-*` rebuilt from the light accent's RGB.
- **One documented reversal**: the foot plate's "white lift, because a dark scrim dies on the
  black scene" flips on paper — the light plate is a faint dark scrim `rgba(10,20,60,0.05)`.
  The plate rule is per-theme: whichever overlay reads on ITS ground.
- **Identity lanes**: HUD-light `L 0.50 / C 0.14`; scene-light `L 0.45 / C 0.17` (ink: darker,
  MORE chromatic); chroma-reduction handles per-hue ceilings as it already does for dark.
- **Scene**: clear colour = the paper token; bloom pair (dark keeps current, light ~0.15×);
  glass planes shade DARK at low alpha instead of glowing; starfield → ~0 in light (stars on
  paper are noise — the day sky is the paper).
- **Deferred to sub-project 2** (live design sessions, never a spec): per-view day-look tuning
  (hyper ink marks, geo globe-on-paper, ledger chamber shading), TextLabel contrast, the
  `/design` page audit, a contrast/a11y pass.

## 6 · Testing

1. **`src/theme/resolve.ts` is pure with a colocated test** (pref × media → theme; the
   localStorage validator: exactly "light"/"dark", else System) — the `src/net/parse.ts`
   pattern.
2. **Rule 3's allowlist SHRINKS** — the migrated literals (TopBar gradient, scrim, RailThread
   ruler) come OUT of `noHardcodedColors.test.ts`; the test proves the migration.
3. **`identity.test.ts` pins the dark lane pairs equal to today's values** (HUD 0.74/0.19,
   scene 0.68/0.20) — the dark look's byte-identity pin, the mainnet-ALLOWED move. New exports
   get sibling references; export-coverage tests enforce where they reach.
4. **Expected green, with reasons**: dimTiers (order is the design; numbers untouched),
   hoverSubject (`var(--primary)` themes free), every net/signer/unlisted boundary, the five
   globals.css readers (`light-dark()` adds no gradient-behind-`bg-[var()]`, no new
   `text-*`/`rounded-*` utilities).
5. **Honest non-test**: the no-THREE.Color-copies rule is an implementation grep + standing
   review lens, not a boundary test.
6. **Live verification**: flip on each 3D view (instant full retint — a laggard IS a stale
   copy); System following a real OS flip; persistence + no dark-flash on a stored light pref;
   dark byte-identity (computed styles spot-compared before/after); the theme × network matrix
   (6 combos, spot); phone strip control; `/design` both themes; reduced motion (no-op by
   construction).
