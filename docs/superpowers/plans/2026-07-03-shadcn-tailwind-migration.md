# shadcn/Tailwind HUD Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-home the HUD's existing Instrument-Glass styling onto Tailwind v4 utilities + themed shadcn/Radix primitives and retire all 13 hand-written `app/styles/*.css` files (~1,470 lines), with pixel-level visual parity — no design changes.

**Architecture:** Zone-by-zone migration (command bar → right rail + cards → left rail → bottom strip → scene tie-in → states → responsive shell → base). Each zone rebuilds its components on Tailwind-on-tokens / themed primitives, then deletes the CSS file(s) it fully owns. **Migrate-then-delete, never delete-first** — a CSS file is deleted only when zero components reference its classes. Canvas-adjacent bespoke bits (ECG, heartbeat, halo, rail thread, LiveStrip caps, odometer, blueprint) stay custom React + Tailwind on the tokens, never hand-written CSS files.

**This is a pure technical rewrite** — every visual spec is already implemented; only the tech stack changes. Per-task verification is cheap and mechanical (`tsc` + `vitest` + grep-verify + commit). Visual verification happens exactly **twice**: one baseline capture in Task 1 and one full comparison pass in Task 10 — no per-zone screenshot gates.

**Tech Stack:** Next.js 15 App Router, Tailwind v4 (`@theme` in `app/globals.css`, no config file), shadcn primitives in `components/ui/` (new-york style, unified `radix-ui` package, `cmdk`), `tw-animate-css`, vitest.

**Spec:** `docs/superpowers/specs/2026-07-01-design-system-tokens-design.md` (this plan is its "Migration (incremental)" section, sequenced).

## Global Constraints

- **Visual parity is the acceptance bar, checked at the END.** This migration re-homes existing looks; any visible change is a bug. But visual checking happens only twice — the Task 1 baseline capture and the Task 10 full before/after comparison (chrome-devtools MCP, 1400×900). Individual tasks reproduce the retired CSS file's literal values faithfully and rely on the mechanical gates; do NOT screenshot per task.
- **Migrate-then-delete.** Never delete or stop importing a CSS file while any `.tsx` still uses one of its classes. Verify with `grep -rn "<class>" components app --include="*.tsx"` before each deletion.
- **Two-lane token rule:** structural = shadcn vars (`--primary` cyan is the sole live/accent signal); identity = per-metagraph `--mg` / `--spine` custom property only. Never a fixed identity token; lanes never cross.
- **Number-colour rule:** data numbers neutral (headline white/bold, secondary muted); cyan = live/accent only; identity hue only on per-metagraph marks.
- **Motion:** ~1.5 s calm tempo, opacity-over-transform, meaningful-only; `prefers-reduced-motion` disables. Keyframes live in `app/globals.css` (Tailwind `@theme` / `@layer components`), not per-component CSS files.
- **One dev server** (coordinator owns it, `run_in_background: true`); workers reuse `http://localhost:3000`, never start/kill servers. **Never run `next build` while the dev server is up** — production-build checks happen only in Task 10 with dev stopped.
- Per-task gates: `npx tsc --noEmit` clean · `npx vitest run` green · grep-verify before every CSS deletion · commit. (No per-task screenshots.)
- Top-bar view glyphs stay plain monochrome symbols — never emoji.
- shadcn class merging goes through the existing `cn()` (`lib/utils.ts`); don't add a second merge helper.
- Component class conversions must reproduce the **literal values** in the CSS file being retired (the CSS file is the parity spec — read it fully before touching its components). Use arbitrary values (`text-[10.5px]`, `bg-[rgba(8,12,26,0.92)]`) where no token exists; use token utilities (`text-muted-foreground`, `border-border`, `rounded-lg`) where one does.
- `git commit` messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## CSS-file → component ownership map (the retirement ledger)

| CSS file | Lines | Consuming components | Retired in |
|---|---|---|---|
| `14-top-bar.css` | 320 | `TopBar`, `topbar/Vitals`, `topbar/FilterPicker`, `ExperimentalBanner` | Task 2 |
| `13-right-column.css` | 93 | `Inspector`, `RailThread`, `RailScroll`, `ContextCard`, `InspectorCard`, `GeoExplore` (`nb-*`), `inspector/cards`+`parts` (`gel-*`, `role-tag*`, `insp-*`, `nb-*`) | Task 4 |
| `05-inspector-metagraph-context-pane.css` | 196 | `InspectorCard`, `inspector/AnchoredTags`, `inspector/parts`, `inspector/cards`, `Tooltip` (`insp-hash`!) | Task 4 |
| `12-panel-system.css` | 73 | `PanelHead` + every rail panel (`panel`, `panel-cap`) | Task 5 |
| `10-country-leaderboard-distribution-score.css` | 46 | `GeoExplore` | Task 5 |
| `09-ledger-placeholder.css` | 14 | `LedgerPanel`, `AboutView` (`prose-*`, `ledger-legend*`) | Task 5 |
| `17-blueprint.css` | 27 | `Blueprint` | Task 5 |
| `01-snapshot-ribbon.css` | 195 | `LiveStrip`, `inspector/parts` (`chip-*`) | Task 6 |
| `07-hover-tooltip.css` | 19 | `Tooltip` (`#tooltip`, `tt-*`) | Task 7 |
| `15-states.css` | 105 | `BootOverlay`, `state/StateAtoms`, `GeoExplore` (`geo-q*`), `LiveStrip`, `inspector/cards` (`st-peer*`, `st-sonar*`), `topbar/Vitals` | Task 8 |
| `16-responsive-shell.css` | 235 | `RailDock` (`rail-tab*`, `sheet-*`, `phone-dock*`, `sr-only`) | Task 9 |
| `11-responsive.css` | 18 | `#leftcol`/`#rightcol` width media queries (no class consumers) | Task 9 |
| `00-base.css` | 129 | tokens + `html`/`body` + `.scene-canvas` + `#leftcol` container + thread-tick vars | Task 10 |

Cross-file couplings to respect (they set the order *within* tasks):
- `Tooltip.tsx` uses `insp-hash` (defined in 05) → Task 4 must swap that one usage to an inline utility so 05 can retire before Task 7 rebuilds the tooltip.
- `inspector/parts.tsx` uses `chip-*` (defined in 01) → Task 4 swaps those to `Badge` so 01's only consumer left is `LiveStrip` (Task 6).
- `GeoExplore.tsx` uses `nb-row`/`nb-dot` (defined in 13, also 05 has `nb-row`) → Task 4 must migrate GeoExplore's `nb-*` usages (a small, contained swap) even though GeoExplore's own file retires in Task 5.
- Components migrated early keep their `st-*`/state classes untouched until Task 8 (states classes stay live until then — that's allowed; referencing a *not-yet-retired* file is fine).

---

### Task 1: Baseline gates + before-screenshot suite

**Files:**
- Create: `docs/superpowers/plans/shots/before/` (screenshot set, committed)
- No source changes.

**Interfaces:**
- Produces: the `before/` screenshot set every later task diffs against, and the canonical **state recipe list** below (later tasks re-shoot exactly these states into `shots/task-N/`).

- [ ] **Step 1: Confirm the working tree is clean and gates are green**

```bash
git status --short          # expect: empty (or only docs/)
npx tsc --noEmit            # expect: exit 0
npx vitest run              # expect: all pass
```

- [ ] **Step 2: Start the one shared dev server** (coordinator, background)

```bash
npm run dev   # run_in_background: true; wait for "Ready" then curl -sf localhost:3000 >/dev/null
```

- [ ] **Step 3: Capture the baseline states** (chrome-devtools MCP, viewport 1400×900)

The canonical state list — one PNG each, named exactly:

| # | File | Recipe |
|---|---|---|
| 1 | `hyper.png` | load `/`, wait for canvas + top bar |
| 2 | `hyper-filter-open.png` | click the filter button (top-left) — bar expands into the picker grid |
| 3 | `hyper-meta-focused.png` | pick a metagraph (e.g. DOR) in the picker — hub focus + dossier in left rail |
| 4 | `geo.png` | click the Geography view glyph, wait for globe |
| 5 | `geo-node-selected.png` | in "Nodes by country" expand a country, click a node row — GeoLive detail card in right rail |
| 6 | `ledger.png` | click the Snapshots view glyph, wait for chamber |
| 7 | `ledger-snapshot.png` | click a LiveStrip bar — SnapshotCard opens in right rail |
| 8 | `status.png`, `transactions.png`, `staking.png` | each placeholder view (PlaceholderPanel + LiveStrip) |
| 9 | `design.png` | `/design` full page |
| 10 | `tablet.png` | resize 900×800, `/` — rail tabs visible; `tablet-sheet.png` with left tab open |
| 11 | `phone.png` | resize 500×850, `/` — phone dock; `phone-sheet.png` with Explore half open |

- [ ] **Step 4: Commit the baseline**

```bash
git add docs/superpowers/plans/shots/before docs/superpowers/plans/2026-07-03-shadcn-tailwind-migration.md
git commit -m "docs(plan): shadcn/tailwind migration plan + visual-parity baseline"
```

---

### Task 2: Command bar — retire `14-top-bar.css`

**Files:**
- Modify: `components/TopBar.tsx`, `components/topbar/Vitals.tsx`, `components/topbar/FilterPicker.tsx`, `components/ExperimentalBanner.tsx`
- Modify: `app/globals.css` (only if a shared keyframe/recipe must move up; prefer utilities)
- Delete at end: `app/styles/14-top-bar.css` + its `@import` line in `app/globals.css`

**Interfaces:**
- Consumes: `ToggleGroup`/`ToggleGroupItem` (`components/ui/toggle-group.tsx`), `Command` family (`components/ui/command.tsx`), `Badge` (`components/ui/badge.tsx`), `Avatar` (`components/ui/avatar.tsx`), `cn()` from `lib/utils`.
- Produces: no API changes — same store reads/writes (`mode`, `filter`, `hoverFilter`), same DOM ids if the engine or tests reference them (check `grep -rn "topbar\|tb-" src/engine js` first; keep any id the engine queries).

**Primitive mapping (from the spec):**
- View switch (`tb-views`/`tb-view`) → **ToggleGroup** `type="single"`, themed to the existing boxed segmented look; glyphs stay plain monochrome text.
- Filter picker (`fp-*` rows) → **Command** (`Command`, `CommandInput`, `CommandList`, `CommandItem`) rendered exactly where the shipped component renders it — **the compact popover anchored under the filter button** (the shipped code deliberately moved on from the older "bar expansion" design; parity wins over the stale spec text). 0-located metagraph rows keep the shipped behaviour (dimmed, still clickable). Row identity dot keeps its inline `--mg` colour. *(Adjudicated during Task 2 review: the spec's "inline in the bar's downward expansion" predates the shipped popover; the user's parity mandate governs.)*
- Filter pill, vitals key/value chips → **Badge** variants + Tailwind; `Odometer` stays as-is.
- `ExperimentalBanner` (`xb-*`, the full-width single-line strip) → pure Tailwind-on-tokens (no primitive fits; keep it custom classes inline).
- Brand mark (`EcgMark`) already tokenised — leave untouched.

- [ ] **Step 1: Read `app/styles/14-top-bar.css` end-to-end.** It is the parity spec: note every literal (paddings, font sizes, letter-spacing, rgba values, breakpoints — 14-top-bar owns its own media queries; those move to Tailwind responsive prefixes `max-[...]:`).
- [ ] **Step 2: Migrate `TopBar.tsx`** — replace `tb-*` classes with Tailwind utilities reproducing the same computed styles; swap the view switch to `ToggleGroup`. Verify hover-preview behaviour (`hoverFilter`) still fires (it's store logic, not CSS).
- [x] **Step 3: Migrate `FilterPicker.tsx`** onto `Command`, keeping the SHIPPED layout (compact popover anchored under the filter button), `--mg` dots, counts, dimmed 0-located rows.
- [ ] **Step 4: Migrate `Vitals.tsx`** (`tb-vital*` → utilities/Badge; keep `Odometer` and the states markup — `st-*` classes stay until Task 8).
- [ ] **Step 5: Migrate `ExperimentalBanner.tsx`** (`xb-*` → utilities).
- [ ] **Step 6: Verify zero consumers, then delete**

```bash
grep -rn "\btb-\|\bfp-\|\bxb-" components app src --include="*.tsx" --include="*.ts"   # expect: no hits
```
Remove `@import "./styles/14-top-bar.css";` from `app/globals.css`, `git rm app/styles/14-top-bar.css`.

- [ ] **Step 7: Gates** — `npx tsc --noEmit` · `npx vitest run`.
- [ ] **Step 8: Commit** — `git commit -m "feat(hud): command bar on shadcn ToggleGroup/Command/Badge, retire 14-top-bar.css"`

---

### Task 3: Right-rail shell + glass panel frame (no CSS retired yet)

**Files:**
- Modify: `components/PanelHead.tsx`, `components/Inspector.tsx`, `components/ContextCard.tsx`, `components/RailThread.tsx` (class swaps only — thread stays custom SVG), `components/RailScroll.tsx`
- Modify: `components/ui/card.tsx` only if the themed glass Card needs an extra slot (prefer `className` composition)

**Interfaces:**
- Consumes: `Card`/`CardHeader`/`CardContent` (already themed `ig-panel`-style with `--spine`), `Separator`.
- Produces: **`PanelHead` keeps its exact current props** (`grep` its usages first — every rail panel calls it). Panels opt into the glass frame via `Card` (or the `ig-panel` recipe class) — the `.panel` class from 12-panel-system keeps working for not-yet-migrated left-rail panels until Task 5.

- [ ] **Step 1: Read `app/styles/13-right-column.css` + `12-panel-system.css` fully.**
- [ ] **Step 2: Rebuild `PanelHead` internals on Tailwind** (eyebrow/title/aside/collapse affordance) — same rendered output, same props; keep emitting nothing from `12-panel-system` (the *panel container* class stays on consumers for now).
- [ ] **Step 3: Migrate `Inspector.tsx`** rail container (`rc-context*`, `rc-empty-text`, `rc-pickhint`, `insp-eyebrow`, `insp-foot`, breadcrumb/× affordances) + `ContextCard.tsx` onto `Card` + utilities. The subject-stack layout (`--detail-w`, rail tokens) stays on the `00-base` tokens.
- [ ] **Step 4: `RailThread.tsx` / `RailScroll.tsx`** — swap any `13-…` classes to utilities; the SVG tick/spine logic is untouched (canvas-adjacent custom, stays).
- [ ] **Step 5: Gates** — tsc · vitest. **Do not delete any CSS file yet** — `13-right-column.css` still serves `inspector/cards`/`parts`/`GeoExplore` until Task 4.
- [ ] **Step 6: Commit** — `git commit -m "feat(hud): right-rail shell + PanelHead on themed Card/Tailwind"`

---

### Task 4: Inspector card bodies — retire `05-…css` **and** `13-right-column.css`

**Files:**
- Modify: `components/InspectorCard.tsx`, `components/inspector/cards.tsx`, `components/inspector/parts.tsx`, `components/inspector/AnchoredTags.tsx`
- Modify (one-line touchpoints): `components/Tooltip.tsx` (`insp-hash` → inline `font-mono text-[11px]` equivalent), `components/GeoExplore.tsx` (`nb-row`/`nb-dot`/`nb-label` → utilities)
- Delete at end: `app/styles/05-inspector-metagraph-context-pane.css`, `app/styles/13-right-column.css` + their `@import` lines

**Interfaces:**
- Consumes: `Badge` (role tags `role-tag*`, anchored pills `anc-*` pills, status `st-pill`/`st-ready`, comp chips `comp-chip`), `Avatar` (dossier logo + monogram fallback `dossier-logo`), `Separator` (`insp-div`), `Card` from Task 3.
- Produces: no API changes — `InspectorCard` stays the thin frame dispatching to per-kind cards; `parts.tsx` exports (rows, `RoleTags`, `nodeComposition`, `Desc`) keep their signatures.

- [ ] **Step 1: Read both CSS files fully** (05 is the densest file — dossier, anchored-breakdown bars, snapshot settle rows, composition grid).
- [ ] **Step 2: Migrate `parts.tsx`** (shared rows/tags/Desc clamp) — including swapping its `chip-*` usages (from 01) to `Badge` so `01-snapshot-ribbon.css` loses its inspector consumer.
- [ ] **Step 3: Migrate `cards.tsx` + `AnchoredTags.tsx` + `InspectorCard.tsx`** — `anc-*` bars keep their inline `--mg` widths/colours; keep the `FLOOR`/`COMPLETE` tag logic untouched (it's data logic). State classes (`st-peer*`, `st-sonar*`, `anc-acquiring`) stay as-is until Task 8.
- [ ] **Step 4: Touchpoints** — `Tooltip.tsx` `insp-hash`, `GeoExplore.tsx` `nb-*`.
- [ ] **Step 5: Verify + delete**

```bash
grep -rn "\banc-\|\bcomp-\|\bdossier\|\binsp-\|\bgel-\|\bnb-\|\brole-tag\|\brc-\|\bsnap-\|\bst-bd\|\bst-pill\|\bst-ready\|\bsubject-paired\|\brail-thread" components app src --include="*.tsx" --include="*.ts"
# expect: only matches that are Tailwind-utility strings or Task-8 state classes; zero uses of 05/13-defined classes
```
Remove both `@import` lines, `git rm` both files.

- [ ] **Step 6: Gates** — tsc · vitest.
- [ ] **Step 7: Commit** — `git commit -m "feat(hud): inspector cards on Badge/Avatar/Separator, retire 05 + 13 css"`

---

### Task 5: Left rail — retire `10-…css`, `09-…css`, `17-blueprint.css`, `12-panel-system.css`

**Files:**
- Modify: `components/GeoExplore.tsx`, `components/LedgerPanel.tsx`, `components/LeftColumn.tsx`, `components/AboutView.tsx`, `components/Blueprint.tsx`
- Delete at end: `app/styles/10-country-leaderboard-distribution-score.css`, `app/styles/09-ledger-placeholder.css`, `app/styles/17-blueprint.css`, `app/styles/12-panel-system.css` + `@import` lines

**Interfaces:**
- Consumes: `Card` frame (all left-rail panels drop `.panel` for the themed Card/`ig-panel` recipe), `Badge` (flag chips, legend dots), `Separator`. If a scrollable list needs themed scrollbars, add **ScrollArea** via `npx shadcn@latest add scroll-area` — but `RailScroll`'s mask-fade behaviour is custom and stays; only adopt ScrollArea where it reproduces the current look exactly (spec maps it to rail lists; parity wins over mapping).
- Produces: `PlaceholderPanel` (in `LeftColumn.tsx`) and `LearnPanel` content keep their markup semantics; `prose-body`/`prose-dim` become utility recipes shared by `AboutView` + `LedgerPanel`.

- [ ] **Step 1: Read all four CSS files fully.**
- [ ] **Step 2: Migrate `GeoExplore.tsx`** — country accordion (`geo-c*`, `lb-*` rows/bars/flags, "Other" fold). Leaderboard bar widths stay inline styles. `geo-q*` quiet-empty classes stay until Task 8.
- [ ] **Step 3: Migrate `LedgerPanel.tsx` + `AboutView.tsx`** (`ledger-legend*`, `prose-*`) and `LeftColumn.tsx` (`PlaceholderPanel` SOON card).
- [ ] **Step 4: Migrate `Blueprint.tsx`** (`bp-*` SVG previews) — canvas-adjacent custom, expressed as Tailwind-on-tokens (SVG attrs may keep literal colours where CSS vars can't reach; mirror-in-code rule as `RailThread` does).
- [ ] **Step 5: Swap every remaining `.panel`/`.panel-cap` consumer to the Card frame** (both rails are migrated now), verify:

```bash
grep -rn "\bpanel\b\|panel-cap\|panel-head\|panel-eyebrow\|\bgeo-c\|\blb-\|\bledger-legend\|\bprose-\|\bbp-" components app --include="*.tsx"   # expect: no CSS-class hits
```
Remove the four `@import` lines, `git rm` the four files.

- [ ] **Step 6: Gates** — tsc · vitest.
- [ ] **Step 7: Commit** — `git commit -m "feat(hud): left rail on Card/Badge/Tailwind, retire 09/10/12/17 css"`

---

### Task 6: Bottom strip — retire `01-snapshot-ribbon.css`

**Files:**
- Modify: `components/LiveStrip.tsx`, `components/BottomStream.tsx`
- Delete at end: `app/styles/01-snapshot-ribbon.css` + `@import`

**Interfaces:**
- Consumes: nothing new — LiveStrip caps / chip-stacks / share-bars are **stays-custom** (Tailwind-on-tokens). `--ls-accent`, `--bottom-reserve` publishing logic untouched.
- Produces: same DOM/store behaviour (bar click → snapshot card + ledger jump; hover → `hoverSnapOrd`).

- [ ] **Step 1: Read `01-snapshot-ribbon.css` fully** (the `ls-*` bars, tip rows, gradients; the `chip-*`/`stream-*` legacy selectors should already be consumer-free after Task 4 — verify which selectors are actually still used before converting; dead selectors just die with the file).
- [ ] **Step 2: Migrate `LiveStrip.tsx` + `BottomStream.tsx`** — bars, live dot, tip (`ls-tip-*`), empty state (`ls-empty` visual moves to utilities now; its *content* semantics stay), the no-chrome rule (bars blend into the scene).
- [ ] **Step 3: Verify + delete**

```bash
grep -rn "\bls-\|\bchip\b\|\bchip-\|\bstream-\|\bconnector\b" components app --include="*.tsx"   # expect: no hits
```

- [ ] **Step 4: Gates** — tsc · vitest.
- [ ] **Step 5: Commit** — `git commit -m "feat(hud): LiveStrip/BottomStream on Tailwind tokens, retire 01-snapshot-ribbon.css"`

---

### Task 7: Scene tie-in tooltip — retire `07-hover-tooltip.css`

**Files:**
- Modify: `components/Tooltip.tsx`
- Delete at end: `app/styles/07-hover-tooltip.css` + `@import`

**Interfaces:**
- Consumes: tokens only. **Decision (flagged for review):** the spec maps shadcn Tooltip here, but Radix Tooltip is trigger-anchored and the scene tooltip is positioned by the Engine at raycast coordinates with no DOM anchor — forcing Radix would change behaviour. Keep the fixed-position wrapper custom (Tailwind-on-tokens glass surface: `fixed z-30 pointer-events-none flex items-baseline gap-[7px] px-[10px] py-[6px] rounded-lg border backdrop-blur-[8px] bg-[rgba(8,12,26,0.92)] …`), identity hue stays the inline border/ticker colour.
- Produces: same `#tooltip` element contract the Engine positions (keep the id if the Engine queries it — verify with `grep -rn "tooltip" src/engine js`).

- [ ] **Step 1: Read `07-hover-tooltip.css`** (19 lines, table above shows it in full detail) and check the Engine's contract.
- [ ] **Step 2: Migrate `Tooltip.tsx`** (`tt-ident`/`tt-sep`/`tt-name`/`tt-hint` → utilities).
- [ ] **Step 3: Verify + delete** — `grep -rn "\btt-\|#tooltip" components app --include="*.tsx"` shows only the kept element id; remove `@import`, `git rm`.
- [ ] **Step 4: Gates** — tsc · vitest.
- [ ] **Step 5: Commit** — `git commit -m "feat(hud): scene tooltip on Tailwind tokens, retire 07-hover-tooltip.css"`

---

### Task 8: States & first-load — retire `15-states.css`

**Files:**
- Modify: `components/state/StateAtoms.tsx`, `components/BootOverlay.tsx`, plus the state-class *usages* left in `components/topbar/Vitals.tsx`, `components/inspector/cards.tsx`, `components/GeoExplore.tsx`, `components/LiveStrip.tsx`
- Modify: `app/globals.css` — move the states' keyframes (sonar sweep, resolve-in, boot ping/glow, standby halo, star twinkle) into `@layer components` / `@keyframes` beside `breathe`/`ecg-scan`, with `prefers-reduced-motion` guards
- Delete at end: `app/styles/15-states.css` + `@import`

**Interfaces:**
- Consumes: tokens + the existing calm-motion conventions. These are canvas-adjacent bespoke atoms (ACQUIRING sonar, NO SIGNAL, STANDBY halo, boot core) — custom Tailwind, no primitive.
- Produces: `StateAtoms` exports keep their names/props (grep usages first).

- [ ] **Step 1: Read `15-states.css` fully;** inventory which selectors are animations (→ globals keyframes) vs layout (→ utilities).
- [ ] **Step 2: Migrate `StateAtoms.tsx` + `BootOverlay.tsx`,** then sweep the remaining `st-*`/`ns-*`/`boot-*`/`geo-q*`/`anc-acquiring`/`no-signal` usages in the four consumer components.
- [ ] **Step 3: Verify + delete**

```bash
grep -rn "\bboot-\|\bns-\|\bst-peer\|\bst-sonar\|\bst-standby\|\bst-star\|\bst-resolve\|\bno-signal\|\bgeo-q\|anc-acq" components app --include="*.tsx"   # expect: no hits
```

- [ ] **Step 4: Gates** — tsc · vitest. (Reduced-motion guards verified by code review — every keyframe moved to globals gets a `prefers-reduced-motion` guard.)
- [ ] **Step 5: Commit** — `git commit -m "feat(hud): state atoms + boot on Tailwind keyframes, retire 15-states.css"`

---

### Task 9: Responsive shell — retire `16-responsive-shell.css` + `11-responsive.css`

**Files:**
- Modify: `components/RailDock.tsx` (rail tabs, sheets, phone dock), `components/LeftColumn.tsx`/`components/Inspector.tsx` only if their containers carry responsive classes
- Possibly modify: `components/ui/sheet.tsx` (theme the existing primitive to the current sheet look: non-modal, docked, grabber)
- Delete at end: `app/styles/16-responsive-shell.css`, `app/styles/11-responsive.css` + `@import`s

**Interfaces:**
- Consumes: **Sheet** primitive (`components/ui/sheet.tsx` — currently unused; this is where it earns its keep) for the tablet edge-tab sheets + phone dock sheets. Constraints from the shipped design: **non-modal** (scene stays interactive), both tablet sheets can be open at once, phone opens one at a time via `store.phoneDock`, ≥44px tap targets, `sr-only` labels (Tailwind has `sr-only` built in — the custom one dies with the file).
- Produces: same breakpoints (`useBreakpoint()` hook is logic, untouched): desktop ≥1100, tablet 700–1099, phone <700. The `11-responsive.css` rail-width tweaks become responsive utilities on the rail containers.

- [ ] **Step 1: Read both CSS files fully;** grep how `RailDock` composes sheet markup today.
- [ ] **Step 2: Migrate `RailDock.tsx`** onto the themed `Sheet` (or, if Radix Dialog-based Sheet cannot be non-modal + dual-open without fighting it, keep the custom sheet markup on Tailwind utilities and record the decision — parity + behaviour win over primitive adoption; Radix `Dialog modal={false}` is the first thing to try).
- [ ] **Step 3: Move the `11-responsive.css` width tweaks** onto the rail containers as `max-[1100px]:w-[224px]`-style utilities.
- [ ] **Step 4: Verify + delete**

```bash
grep -rn "\brail-tab\|\bsheet-\|\bphone-dock" components app --include="*.tsx"   # expect: no hits
```

- [ ] **Step 5: Gates** — tsc · vitest.
- [ ] **Step 6: Commit** — `git commit -m "feat(hud): responsive shell on themed Sheet/Tailwind, retire 16 + 11 css"`

---

### Task 10: Base retirement, primitive pruning, final gate — retire `00-base.css`, delete `app/styles/`

**Files:**
- Modify: `app/globals.css` — absorb 00-base's still-referenced pieces: the spacing/rail tokens (`--rail-*`, `--detail-w`, `--sel-bg`/`--sel-border`, `--bottom-reserve` default, `--panel-pad-*`, thread-tick vars + their keep-in-sync comment for `RailThread` `TICK_*`), `html`/`body` resets, `.scene-canvas`/`.scene-in`, the `#leftcol` container + scrollbar/mask rules (or move those onto the components as utilities where clean)
- Modify: `app/design/page.tsx` — final styleguide pass: every themed primitive actually used by the app is represented (Command row, Sheet swatch, state atoms section)
- Delete: `app/styles/00-base.css`, then the empty `app/styles/` directory
- Delete: unused primitives — check first: `grep -rln "ui/button\|ui/dialog\|ui/toggle\b" components app` — anything with zero app imports after Task 9 (`button.tsx`? `dialog.tsx`? `toggle.tsx` if only toggle-group survives) is removed along with its `/design` usage. (`sheet.tsx` earned its keep in Task 9 or was consciously dropped there.)

**Interfaces:**
- Consumes: everything prior.
- Produces: `app/globals.css` is the single stylesheet: Tailwind import, tokens (two lanes), keyframes, the small `@layer components` recipes (`ig-panel`, odometer, ecg, and whatever Tasks 7–8 added). Zero `app/styles/` imports.

- [ ] **Step 1: Inventory 00-base consumers** (`grep -rn "scene-canvas\|scene-in\|rail-clip\|rail-dragging\|--rail-\|--detail-w\|--sel-\|--panel-pad\|--thread-tick\|--bottom-reserve" components app src js --include="*.tsx" --include="*.ts" --include="*.js"`), migrate each token/rule into `globals.css` or component utilities.
- [ ] **Step 2: Delete `00-base.css` + the last `@import`; `rmdir app/styles`.**
- [ ] **Step 3: Prune unused primitives + finalize `/design`.**
- [ ] **Step 4: Full gate suite (the ONE visual pass)** — tsc · vitest · re-shoot the **entire Task-1 state list** into `shots/after/`; side-by-side parity review of all ~15 states against `shots/before/`. Fix any drift found, re-shoot the affected state, and fold fixes into this task.
- [ ] **Step 5: Production build check** — **stop the dev server first** (kill by PID), then:

```bash
rm -rf .next && npx next build
# expect: clean; /api/metagraphs stays ○ Static with 10m revalidate; / builds
```
Restart the dev server after.

- [ ] **Step 6: Commit** — `git commit -m "feat(hud): retire app/styles entirely — Tailwind+shadcn migration complete"`

---

## Self-review notes (spec coverage)

- Spec §Token architecture — landed pre-plan (foundation); Task 10 carries the remaining `00-base` tokens into the theme. ✔
- Spec §Component mapping — Command/Avatar/Card/ToggleGroup/Badge/Separator: Tasks 2–5. ScrollArea: Task 5 (conditional, parity-gated). Tooltip: Task 7 **deviates deliberately** (engine-anchored; custom Tailwind) — flagged in-task for review. ✔
- Spec §Stays custom — ECG/heartbeat (done pre-plan), odometer (done), thread (Task 3), LiveStrip caps (Task 6), states/halo/shimmer (Task 8), blueprint (Task 5). ✔
- Spec §/design artifact — updated per-zone implicitly via shared primitives; explicit final pass Task 10. ✔
- Spec §Open items — a11y pass (focus rings/keyboard) is **not** in this plan beyond what Radix primitives bring; noted as follow-up, since the migration bar is visual parity.
