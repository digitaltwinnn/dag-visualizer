# Design system — tokens + components (shadcn + Tailwind)

**Date:** 2026-07-01
**Scope:** The connective layer for the whole HUD refresh — a token system + component library, and the migration of the current hand-written custom CSS onto **Tailwind + shadcn**, themed to Instrument-Glass. Consolidates the rules from all the other 2026-07-01 specs.

## Base decision

Adopt **Tailwind + shadcn/Radix** (the project currently has the `shadcn` CLI but no Tailwind — it's hand-written CSS in `app/styles/*.css`). shadcn/Radix provides the **accessible primitives**; we **theme them heavily to Instrument-Glass** and keep the bespoke, canvas-adjacent bits custom. (Alternatives — custom+Radix-only, or pure custom — were considered; the team chose full shadcn+Tailwind for the component library + MCP tooling.)

## Token architecture

- **Structural lane → shadcn CSS variables** (`:root`, oklch): `--background` (bg `#05060e`), `--foreground` (text), `--muted-foreground` (muted), `--primary` / `--ring` (**accent cyan** = the single live/accent signal), `--destructive` (warn), `--border`, `--radius`. **Added beyond shadcn defaults:** `--success` (ready/green), `--core-l0` (blue), `--core-l1` (violet).
- **Identity lane → NOT shadcn.** A **runtime OKLCH generator** (brand-matched, guard-banded — `2026-07-01-identity-hue-generator-design.md`) sets a per-metagraph `--mg` custom property, consumed by badges / dots / thread / ticker. Never a fixed token; never touches the structural variables — the "two lanes never cross" rule enforced at the token level.
- **Number-colour rule** (from the snapshot-card spec): data numbers neutral (headline white/bold, secondary muted); cyan = live/accent only; identity hue only on per-metagraph marks. A documented convention, not a token.
- **Motion** — the ~1.5 s calm tempo, opacity-over-transform, meaningful-only (`2026-07-01-empty-loading-states-design.md`) → Tailwind `animation`/`transition` theme extensions.
- **Space / radius / rail widths** — the existing `00-base.css` tokens (`--radius`, `--rail-*`, `--detail-w`, `--bottom-reserve`, `--sel-bg`/`--sel-border`) carried into the Tailwind theme.
- **Instrument-Glass surface** — Card/Popover backgrounds overridden with the **glass gradient + blur + inner-highlight + left accent spine** (not shadcn's flat card bg).

## Component mapping (shadcn → Instrument-Glass)

- **Command** → the **filter picker** (searchable metagraph list + `All`), rendered **inline in the bar's downward expansion** (one connected surface, per the command-bar spec — not a detached popover).
- **Avatar** → **logo avatar + monogram fallback** (dossier · picker).
- **Card** → the **glass panel frame** (dossier · snapshot · detail · view-default) + the accent spine.
- **Tooltip** → the **scene tie-in + LiveStrip** hover tooltip.
- **ToggleGroup** (single-select) → the **view switch** (segmented; chosen over Tabs — it's a mode switch, not tab-panels).
- **ScrollArea** → rail lists (GeoExplore, breakdown, picker) — themed scrollbars.
- **Badge** → chips / pills / status tags.
- **Separator** → hairline dividers.

## Stays custom (Tailwind, no shadcn equivalent)

ECG logo · heartbeat · halo · constellation shimmer · rail **thread/instrument channel** + node-dots · LiveStrip **caps / chip-stacks / share-bars** · **odometer roll** · blueprint previews. Built as custom React + Tailwind on the tokens; they wrap/adjoin the canvas.

## Migration (incremental)

1. **Init Tailwind + shadcn** alongside the current `app/styles/*.css`.
2. Land the **tokens** (two lanes + rules) in `globals.css :root` + the Tailwind theme.
3. Migrate **primitive-by-primitive** (Card, Tooltip, Command, ToggleGroup, Avatar, Badge, ScrollArea…), **retiring the matching old CSS file** as each lands.
4. Build the **custom bits** as Tailwind components.

## The artifact — `/design` styleguide route

A live styleguide page rendering the **real** tokens + every primitive + the states (ACQUIRING / NO SIGNAL / STANDBY, the focus row, first-load boot). It **is** the documentation *and* the visual-check reference — versioned in Git, never drifts (it's the same components the app ships), and **screenshot-verified** in the headless-Chrome check. Replaces the throwaway brainstorm mockups as the durable design artifact.

## Affected

- `package.json` — add Tailwind, PostCSS, shadcn/Radix deps; `components.json`, `tailwind.config`, PostCSS config.
- `app/globals.css` — the `:root` token layer (two lanes) + Tailwind directives; retire `app/styles/*.css` incrementally.
- `components/ui/*` — the themed shadcn primitives.
- Custom components for the bespoke bits.
- New `app/design/page.tsx` — the styleguide.

## Open / follow-ups

- Implementation plan (writing-plans) — sequence the migration so the app stays shippable throughout.
- Exact oklch values for the structural vars; a11y pass (focus rings, keyboard) once primitives land.
