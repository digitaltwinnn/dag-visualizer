# HUD Refresh — Phase 2: Command Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the top command bar in the Instrument-Glass language — an ECG-heartbeat brand mark, a de-nested/toned filter with a searchable logo picker, a structural view switch, and odometer-rolling neutral vitals — fixing the colour-lane leak where the whole bar (incl. navigation) tinted to the selected metagraph.

**Architecture:** Build the new pieces as focused components on the `/design` styleguide first (app's live `TopBar` keeps working), then swap the `#topbar` shell to the Instrument-Glass surface and wire them in, then retire the replaced CSS. Reuses the Phase-1 token layer (`.ig-panel`, structural tokens, `breathe`) and adds shadcn `Command`/`Avatar`/`ToggleGroup`. The bespoke ECG mark and odometer are custom React + Tailwind on the tokens.

**Tech Stack:** Next 15 (App Router) · React 19 · TypeScript · Tailwind v4 · shadcn/Radix (`Command`, `Avatar`, `ToggleGroup`) · Zustand (existing store) · vitest (odometer logic).

## Global Constraints

- **Node ≥ 18.18.** Branch **`dev`**. Commit as author `digitaltwinnn` (`git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" commit …`), short messages ending with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Two colour lanes, never cross — this is the core fix.** Navigation chrome (accent spine, view-switch active state, vitals) is **structural cyan/blue only**. The **filter dot is the ONLY identity colour in the bar**. Remove the whole-bar `--tb-accent` metagraph tint entirely.
- **Identity-hue SOURCE stays `config.METAGRAPHS` this phase** (via the existing `hex(m.color)` / `filterAccent(filter)` / `metagraphById`). The filter dot, picker ticker, and avatar ring must use the SAME colour the metagraph's hub + globe nodes use in the 3D scene (a hard invariant — see CLAUDE.md "a metagraph's hub color, its globe nodes, and its filter chip must stay the same color"). Do NOT switch to the Phase-1 generator (`--mg`/API `hue`) here — that swap is the deferred **engine token-bridge** phase and must happen atomically across the dot AND the scene. Using the generator only in the bar would split the dot from the nodes.
- **Number-colour rule:** vitals values are **neutral** (`--text` bold headline / `--muted` secondary). Cyan = live/accent only (the ECG, the spine, the view-switch active state, and the ledger sparkline's latest bar). Never colour a data number with an identity hue.
- **Calm, meaningful motion:** the ECG beats **once per snapshot tick** (~0.9–1.5 s family); vitals **odometer-roll only on a real value change**; **`prefers-reduced-motion` → static** (flat ECG trace, instant value swap). No idle animation.
- **Factual, never fabricated:** 0-located / unlocatable metagraphs appear in the picker **greyed with their real count** (never hidden). No invented metrics.
- **App stays shippable throughout:** the live `TopBar` keeps working until the shell swap (Task 5); primitives accrue on `/design` first.
- **Path alias** `@/*` → repo root. **Monochrome view glyphs only — never emoji.**
- **Dev-server hygiene (learned in Phase 1):** only ONE `next dev` may run or `.next` corrupts (`ENOENT … _document.js`). `pkill -f "next dev"` returns exit 144 here and is unreliable — **kill by PID** (`pgrep -af "next dev"` then `kill <pid>`), or launch with `setsid nohup npm run dev >/tmp/nextdev.log 2>&1 </dev/null & disown`. After edits: kill strays, `rm -rf .next`, start one, wait for `curl -sf localhost:3000/api/metagraphs`, warm the route with a couple curls, then screenshot.
- **Headless screenshot flags** (visual verification; ignore benign `mojo … rejected` / `PHONE_REGISTRATION_ERROR` / `BackForwardCache` noise):
  ```bash
  google-chrome-stable --headless=new --no-sandbox --use-gl=angle --use-angle=swiftshader \
    --enable-unsafe-swiftshader --window-size=1400,900 --hide-scrollbars \
    --virtual-time-budget=9000 --screenshot=/tmp/shot.png "http://localhost:3000/<route>"
  ```
  To screenshot a specific view/filter state, temporarily seed the store default in `src/store/store.ts` (e.g. `mode: "ledger"`, `filter: "<id>"`), screenshot, then revert — the standard trick (no deep links in headless).

**Source spec:** `docs/superpowers/specs/2026-07-01-command-bar-design.md` (+ the vitals cluster + filter-picker notes in `2026-07-01-00-overview.md`). Current code: `components/TopBar.tsx`, `components/topbar/Vitals.tsx`, `components/topbar/FilterChips.tsx`, `app/styles/14-top-bar.css`, `app/styles/06-snapshot-live-heartbeat.css`.

**Out of scope (later phases):** swapping the identity-hue source to the generator + feeding `--mg`/hex to the THREE engine (token-bridge); the right/left rails, cards, LiveStrip; responsive/tablet condensing (the spec's narrow-screen behaviour is a follow-up). Don't flag their absence.

---

## File Structure

- `components/ui/command.tsx`, `components/ui/avatar.tsx`, `components/ui/toggle-group.tsx`, `components/ui/toggle.tsx` — **create** (shadcn CLI); themed minimally to Instrument-Glass.
- `components/topbar/EcgMark.tsx` — **create** — the ECG heartbeat brand mark (live sweep / flatline), reads `store.live` + the latest snapshot ordinal.
- `components/Odometer.tsx` — **create** — headline numeric that roll-animates on change (reduced-motion instant). Reused by Vitals (and later panels).
- `src/util/odometer.ts` + `src/util/odometer.test.ts` — **create** — the pure display-formatting helper the Odometer uses (TDD).
- `components/topbar/FilterPicker.tsx` — **create** — the searchable logo-list picker (replaces `FilterChips.tsx`).
- `components/topbar/Vitals.tsx` — **modify** — odometer roll on headline values; remove the scope dot; em-dash absent layers; ledger sparkline → muted history + cyan latest.
- `components/TopBar.tsx` — **modify** — Instrument-Glass shell, brand lockup (EcgMark + wordmark), remove `--tb-accent`, de-nested filter, structural ToggleGroup view switch, expand-to-picker.
- `src/engine/Engine.ts` — **modify** (one line) — add `iconUrl` to the published metaList.
- `src/data/types.ts` — **modify** — add `iconUrl?: string` to `MetaInfo`.
- `app/styles/14-top-bar.css` — **rewrite** to the Instrument-Glass bar; **delete** `app/styles/02-filter-panel.css`, `app/styles/04-disabled-filter-chip.css` (retire, with their `@import`s removed from `app/globals.css`). NOTE: `06-snapshot-live-heartbeat.css` is NOT retired — its `.snap-pulse` is still used by `components/LiveHeart.tsx` (the snapshot-card heartbeat), a different element from the top-bar ECG. Keep it.
- `components/topbar/FilterChips.tsx` — **delete** (replaced by FilterPicker).
- `app/design/page.tsx` — **modify** — showcase the new bar primitives.

---

## Task 1: Add shadcn Command, Avatar, ToggleGroup primitives

**Files:**
- Create (CLI): `components/ui/command.tsx`, `components/ui/avatar.tsx`, `components/ui/toggle-group.tsx`, `components/ui/toggle.tsx`
- Modify: `app/design/page.tsx`

**Interfaces:**
- Consumes: Phase-1 tokens + `cn` (`@/lib/utils`).
- Produces: `Command`/`CommandInput`/`CommandList`/`CommandItem`/`CommandEmpty`/`CommandGroup` , `Avatar`/`AvatarImage`/`AvatarFallback`, `ToggleGroup`/`ToggleGroupItem` from `@/components/ui/*`.

- [ ] **Step 1: Add the primitives via the shadcn CLI**

Run: `npx shadcn@latest add command avatar toggle-group --yes`
Expected: creates the four files (`toggle-group` pulls in `toggle`), installs `cmdk` + the radix deps. Non-interactive (`components.json` exists from Phase 1).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. If `cmdk`'s types complain under React 19, confirm the generated `command.tsx` matches the current CLI output (do not hand-edit beyond what later tasks specify).

- [ ] **Step 3: Smoke-render on `/design` to confirm they mount**

In `app/design/page.tsx`, add imports:
```tsx
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
```
Add before `</main>`:
```tsx
      <section className="mb-10">
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-3">
          Command-bar primitives
        </h2>
        <div className="flex items-center gap-6">
          <ToggleGroup type="single" defaultValue="a" variant="outline">
            <ToggleGroupItem value="a">◆</ToggleGroupItem>
            <ToggleGroupItem value="b">◍</ToggleGroupItem>
            <ToggleGroupItem value="c">▦</ToggleGroupItem>
          </ToggleGroup>
          <Avatar className="size-8">
            <AvatarFallback>DED</AvatarFallback>
          </Avatar>
        </div>
      </section>
```
(The `Command` picker is exercised in Task 4; this step only proves the three primitives compile + mount.)

- [ ] **Step 4: Screenshot `/design` and verify**

Restart clean (per the dev-server hygiene note), then screenshot `/design` (flags above) and Read the PNG.
Expected: a 3-item toggle group + a monogram avatar render on the dark bg without breaking the existing sections. If `cmdk` throws at import time, resolve before proceeding.

- [ ] **Step 5: Commit**

```bash
git add -A && git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" \
  commit -m "feat(ui): add shadcn Command, Avatar, ToggleGroup primitives

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Odometer formatter (TDD) + Odometer component

**Files:**
- Create: `src/util/odometer.ts`, `src/util/odometer.test.ts`, `components/Odometer.tsx`
- Modify: `app/design/page.tsx`

**Interfaces:**
- Produces:
  - `formatVital(v: number | null | undefined): string` — the vitals number format: `null/undefined → "—"`, `v < 10 → one decimal` (`"9.4"`), else rounded with thousands separators (`"1,203"`). (Matches the existing `fmt` in `Vitals.tsx`, extracted + tested.)
  - `<Odometer value={number|null|undefined} className? />` — renders `formatVital(value)` and, when the formatted string changes, roll-animates (old string slides up/out, new slides in), `prefers-reduced-motion` → instant swap.

- [ ] **Step 1: Write the failing formatter test**

Create `src/util/odometer.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { formatVital } from "./odometer";

describe("formatVital", () => {
  it("renders an em-dash for nullish", () => {
    expect(formatVital(null)).toBe("—");
    expect(formatVital(undefined)).toBe("—");
  });
  it("keeps one decimal below 10", () => {
    expect(formatVital(9.42)).toBe("9.4");
    expect(formatVital(0)).toBe("0.0");
  });
  it("rounds and groups at/above 10", () => {
    expect(formatVital(10)).toBe("10");
    expect(formatVital(1203.7)).toBe("1,204");
  });
});
```

- [ ] **Step 2: Run it RED**

Run: `npm test -- odometer`
Expected: FAIL — `Cannot find module './odometer'`.

- [ ] **Step 3: Implement the formatter**

Create `src/util/odometer.ts`:
```ts
// The vitals number format (extracted from the old TopBar `fmt`, now shared + tested):
// nullish → em-dash; small values keep one decimal; larger values round + group.
export function formatVital(v: number | null | undefined): string {
  if (v == null) return "—";
  return v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString();
}
```

- [ ] **Step 4: Run it GREEN**

Run: `npm test -- odometer`
Expected: PASS (3/3).

- [ ] **Step 5: Build the Odometer component**

Create `components/Odometer.tsx`:
```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { formatVital } from "@/src/util/odometer";

// A headline numeric that roll-animates when its value changes: the old text slides up and
// out while the new slides in from below. Reduced-motion (or first paint) swaps instantly.
export default function Odometer({
  value,
  className,
}: {
  value: number | null | undefined;
  className?: string;
}) {
  const next = formatVital(value);
  const [shown, setShown] = useState(next);
  const [prev, setPrev] = useState<string | null>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      setShown(next);
      return;
    }
    if (next === shown) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(next);
      return;
    }
    setPrev(shown);
    setShown(next);
    const t = setTimeout(() => setPrev(null), 420); // matches the roll keyframe
    return () => clearTimeout(t);
  }, [next, shown]);

  return (
    <span className={cn("odometer", className)} aria-label={next}>
      {prev !== null && <span className="odometer-out" aria-hidden>{prev}</span>}
      <span className={prev !== null ? "odometer-in" : undefined}>{shown}</span>
    </span>
  );
}
```
Add the roll keyframes to `app/globals.css` (after the `breathe` keyframe):
```css
@keyframes odo-in  { from { transform: translateY(60%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes odo-out { from { transform: translateY(0);   opacity: 1; } to { transform: translateY(-60%); opacity: 0; } }
@layer components {
  .odometer { position: relative; display: inline-grid; overflow: hidden; line-height: 1.1; }
  .odometer > span { grid-area: 1 / 1; }
  .odometer-in  { animation: odo-in  0.4s ease-out; }
  .odometer-out { animation: odo-out 0.4s ease-out forwards; }
}
@media (prefers-reduced-motion: reduce) {
  .odometer-in, .odometer-out { animation: none; }
}
```

- [ ] **Step 6: Showcase on `/design` and screenshot**

In `app/design/page.tsx` add a client demo island — create `app/design/OdometerDemo.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";
import Odometer from "@/components/Odometer";
export default function OdometerDemo() {
  const [n, setN] = useState(1203);
  useEffect(() => {
    const t = setInterval(() => setN((x) => x + Math.floor(Math.random() * 40)), 1500);
    return () => clearInterval(t);
  }, []);
  return <Odometer value={n} className="text-2xl font-mono font-bold" />;
}
```
Import + render it in the "Command-bar primitives" section of `app/design/page.tsx`:
```tsx
import OdometerDemo from "./OdometerDemo";
// …inside the flex row:
          <OdometerDemo />
```
Restart clean, screenshot `/design`, Read the PNG. Expected: a bold mono number renders (mid-roll it briefly shows two stacked values). The formatter test already proves the value logic; the screenshot proves it mounts + rolls.

- [ ] **Step 7: Commit**

```bash
git add -A && git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" \
  commit -m "feat(vitals): odometer formatter (tested) + roll component

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: ECG heartbeat brand mark

**Files:**
- Create: `components/topbar/EcgMark.tsx`
- Modify: `app/globals.css` (ECG keyframes), `app/design/page.tsx`

**Interfaces:**
- Consumes: `store.live`, and the latest snapshot ordinal via `useSnapshotFeed` (`@/components/useSnapshotFeed`, returns `{ snaps }` where each snap has `.data.ordinal`).
- Produces: `<EcgMark />` — an inline SVG ECG trace in structural cyan that pulses a beat when the latest ordinal changes; flatlines + greys when `!store.live`; static under reduced-motion.

- [ ] **Step 1: Build the component**

Create `components/topbar/EcgMark.tsx`:
```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/src/store/store";
import { useSnapshotFeed } from "@/components/useSnapshotFeed";

// The brand mark = an ECG trace carrying liveness. It sweeps one beat on each new snapshot
// tick (meaningful motion), and flattens to a flatline + greys when the feed is down
// (NO SIGNAL) — the flatline is the offline state, no text tag. Reduced-motion: static trace.
const BEAT = "M0 12 H10 L13 12 L15 4 L18 20 L21 9 L24 12 H34"; // spike
const FLAT = "M0 12 H34";

export default function EcgMark() {
  const live = useStore((s) => s.live);
  const { snaps } = useSnapshotFeed(8); // small window; take the max ordinal (order-agnostic)
  // NOTE: useSnapshotFeed returns GlobalSnapshot[] with `.ordinal` directly (NOT `.data.ordinal`
  // — that wrapper is the store's pick descriptor, a different type). Verify against LiveStrip.tsx.
  const latest = snaps.length ? Math.max(...snaps.map((s) => s.ordinal)) : null;
  const [beat, setBeat] = useState(false);
  const prevOrd = useRef<number | null>(null);

  useEffect(() => {
    if (latest == null) return;
    if (prevOrd.current !== null && latest !== prevOrd.current) {
      setBeat(true);
      const t = setTimeout(() => setBeat(false), 900);
      prevOrd.current = latest;
      return () => clearTimeout(t);
    }
    prevOrd.current = latest;
  }, [latest]);

  return (
    <span className={"ecg" + (live ? "" : " ecg--off") + (beat ? " ecg--beat" : "")} aria-hidden>
      <svg width="34" height="24" viewBox="0 0 34 24" fill="none">
        <path className="ecg-trace" d={live ? BEAT : FLAT} stroke="currentColor" strokeWidth="1.6"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
```

- [ ] **Step 2: Add the ECG styles + keyframes to `app/globals.css`**

```css
@layer components {
  .ecg { display: inline-flex; color: var(--primary); }
  .ecg--off { color: var(--muted-foreground); }
  .ecg-trace {
    filter: drop-shadow(0 0 3px color-mix(in oklch, var(--primary) 60%, transparent));
  }
  .ecg--off .ecg-trace { filter: none; }
  .ecg--beat .ecg-trace { animation: ecg-beat 0.9s ease-out 1; }
}
@keyframes ecg-beat {
  0% { opacity: 0.55; }
  20% { opacity: 1; filter: drop-shadow(0 0 6px color-mix(in oklch, var(--primary) 90%, transparent)); }
  100% { opacity: 0.85; }
}
@media (prefers-reduced-motion: reduce) {
  .ecg--beat .ecg-trace { animation: none; }
}
```

- [ ] **Step 3: Showcase on `/design` and screenshot**

In `app/design/page.tsx` "Command-bar primitives" section add `import EcgMark from "@/components/topbar/EcgMark";` and render a brand-lockup preview:
```tsx
          <span className="flex items-center gap-2">
            <EcgMark />
            <span className="font-semibold tracking-tight">
              <span className="text-foreground">DAG</span>{" "}
              <span className="text-muted-foreground">Visualizer</span>
            </span>
          </span>
```
Restart clean, screenshot `/design`, Read the PNG. Expected: a cyan ECG spike trace beside the `DAG Visualizer` wordmark (DAG bright, Visualizer muted). `store.live` is `false` on a cold `/design` (no engine), so the trace may render as the greyed **flatline** — that's correct and proves the NO SIGNAL state; note it in the report.

- [ ] **Step 4: Commit**

```bash
git add -A && git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" \
  commit -m "feat(topbar): ECG heartbeat brand mark (beat-per-tick / flatline offline)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Filter picker (logo list + search)

**Files:**
- Create: `components/topbar/FilterPicker.tsx`
- Modify: `src/data/types.ts` (`MetaInfo.iconUrl`), `src/engine/Engine.ts` (publish `iconUrl`), `components/TopBar.tsx` (swap `FilterChips` → `FilterPicker` in the existing expand)
- Delete: `components/topbar/FilterChips.tsx`

**Interfaces:**
- Consumes: `store.metaList` (`MetaInfo[]`, now with `iconUrl?`), `store.filter`, `store.setFilter`, `store.setHoverFilter`; `hex` (`@/src/util/format`); shadcn `Command`, `Avatar`.
- Produces: `<FilterPicker onPick={() => void} />` — the searchable identity-selection menu shown in the bar's downward expansion.

- [ ] **Step 1: Add `iconUrl` to the metaList data flow**

In `src/data/types.ts`, add to `interface MetaInfo` (after `siteUrl?`):
```ts
  iconUrl?: string;
```
In `src/engine/Engine.ts`, in `_publishMetaList`, add `iconUrl` to the mapped metas object (the `data.map((m) => { … return { id: m.id, name: m.name, symbol: m.symbol, description: m.description, siteUrl: m.siteUrl, … } })`):
```ts
        id: m.id, name: m.name, symbol: m.symbol, description: m.description,
        siteUrl: m.siteUrl, iconUrl: m.iconUrl,
        color: metagraphById(m.id)?.color ?? DEFAULT_META_COLOR,
```
(The DAG entry has no logo; leave its `iconUrl` unset — the monogram fallback covers it.)

- [ ] **Step 2: Build the picker**

Create `components/topbar/FilterPicker.tsx`:
```tsx
"use client";
import { useMemo } from "react";
import { useStore } from "@/src/store/store";
import { hex } from "@/src/util/format";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

// The expanded filter body: a searchable identity-selection menu. `All · whole network`
// pinned on top (the clear/default), then one row per core — logo avatar (ringed in its
// identity hue; monogram fallback) + name + ticker + node count — SORTED by located-node
// count desc, so 0-located metagraphs sink to the bottom (shown greyed with their real
// count, never hidden). Current pick highlighted; hovering a row PREVIEWS its dim in the
// scene (setHoverFilter); leaving the list clears the preview.
export default function FilterPicker({ onPick }: { onPick?: () => void }) {
  const filter = useStore((s) => s.filter);
  const setFilter = useStore((s) => s.setFilter);
  const setHoverFilter = useStore((s) => s.setHoverFilter);
  const metaList = useStore((s) => s.metaList);

  // Sort by located desc; keep the DAG root first among the "active" block if it has nodes.
  const rows = useMemo(
    () => [...metaList].sort((a, b) => (b.located ?? 0) - (a.located ?? 0)),
    [metaList],
  );
  const totalNodes = useMemo(() => rows.reduce((s, m) => s + (m.located ?? 0), 0), [rows]);

  const pick = (id: string) => {
    setFilter(id);
    onPick?.();
  };
  const monogram = (m: { symbol?: string; name: string }) =>
    (m.symbol || m.name).slice(0, 3).toUpperCase();

  return (
    <Command className="fp" onMouseLeave={() => setHoverFilter(null)}>
      <CommandInput placeholder="Search metagraphs…" />
      <CommandList>
        <CommandEmpty>No metagraph found.</CommandEmpty>
        <CommandGroup>
          <CommandItem
            value="all whole network"
            onSelect={() => pick("all")}
            className={filter === "all" ? "fp-row fp-active" : "fp-row"}
            onMouseEnter={() => setHoverFilter("all")}
          >
            <span className="fp-dot" style={{ background: "var(--primary)" }} />
            <span className="fp-name">All</span>
            <span className="fp-sub">whole network</span>
            <span className="fp-count">{rows.length} · {totalNodes} nodes</span>
          </CommandItem>
        </CommandGroup>
        <CommandGroup>
          {rows.map((m) => {
            const off = (m.located ?? 0) === 0;
            const hue = hex(m.color);
            return (
              <CommandItem
                key={m.id}
                value={`${m.name} ${m.symbol ?? ""} ${m.id}`}
                onSelect={() => pick(m.id)}
                className={
                  "fp-row" + (filter === m.id ? " fp-active" : "") + (off ? " fp-off" : "")
                }
                onMouseEnter={() => setHoverFilter(m.id)}
              >
                <Avatar className="fp-logo" style={{ ["--ring" as string]: hue }}>
                  {m.iconUrl && <AvatarImage src={m.iconUrl} alt="" />}
                  <AvatarFallback style={{ color: hue }}>{monogram(m)}</AvatarFallback>
                </Avatar>
                <span className="fp-name">{m.name}</span>
                <span className="fp-ticker" style={{ color: hue }}>{m.symbol}</span>
                <span className="fp-count">{off ? "0 · located" : m.located}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
```

- [ ] **Step 3: Add the picker styles to `app/styles/14-top-bar.css`**

(Temporary home — Task 7 folds bar tokens together. Add at the end of the file:)
```css
/* Filter picker (logo list + search) — shown in the bar's downward expansion */
.fp { background: transparent; }
.fp [data-slot="command-input-wrapper"] { border-bottom: 1px solid var(--panel-border); }
.fp-row { display: grid; grid-template-columns: auto 1fr auto auto; align-items: center; gap: 10px; }
.fp-row .fp-sub { grid-column: 2; color: var(--muted); font-size: 11px; }
.fp-name { font-size: 13px; color: var(--text); }
.fp-ticker { font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums; }
.fp-count { font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; text-align: right; }
.fp-dot { width: 9px; height: 9px; border-radius: 50%; }
.fp-logo { width: 22px; height: 22px; border-radius: 6px; box-shadow: 0 0 0 1.5px var(--ring, var(--panel-border)); }
.fp-active { background: var(--sel-bg) !important; box-shadow: inset 2px 0 0 var(--sel-border); }
.fp-off { opacity: 0.45; }
```

- [ ] **Step 4: Swap `FilterChips` → `FilterPicker` in the bar**

In `components/TopBar.tsx`: change the import `import FilterChips from "@/components/topbar/FilterChips";` → `import FilterPicker from "@/components/topbar/FilterPicker";`, and in the `.tb-expand` block replace `<FilterChips onPick={() => setOpen(false)} />` with `<FilterPicker onPick={() => setOpen(false)} />`. Delete `components/topbar/FilterChips.tsx`.

- [ ] **Step 5: Typecheck + screenshot the open picker**

Run `npx tsc --noEmit` (expect clean). The picker is populated from `store.metaList`, which only the running engine fills — so screenshot it via the live bar on `/`, not `/design` (which has no engine and an empty metaList). Headless can't click, so **temporarily** change the `open` state initializer in `components/TopBar.tsx` from `useState(false)` to `useState(true)` so the bar renders expanded on load. Restart clean, wait for the engine to populate metaList (give the route a few seconds — warm with a curl to `/api/metagraphs` first), screenshot `/`, Read the PNG. Expected: the expanded picker shows the search field, `All · whole network` on top with the metagraph/total-node counts, then metagraph rows with monogram avatars + name + identity-hue ticker + node count, **sorted by node count desc**, with any 0-located rows **greyed at the bottom** showing `0 · located`; the current pick highlighted. **Revert `useState(true)` back to `useState(false)`** before committing.

- [ ] **Step 6: Commit**

```bash
git add -A && git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" \
  commit -m "feat(topbar): searchable logo filter picker (replaces chip grid); publish iconUrl

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: TopBar shell → Instrument-Glass + brand lockup + structural view switch + de-nested filter

**Files:**
- Modify: `components/TopBar.tsx`, `app/styles/14-top-bar.css`

**Interfaces:**
- Consumes: `EcgMark`, `FilterPicker` (Tasks 3–4), shadcn `ToggleGroup`, `store.{live,filter,mode,setMode}`, `filterAccent`/`metagraphById` (`@/src/data/network`), `hex`.
- Produces: the restructured `#topbar` — Instrument-Glass surface with a structural cyan→blue spine, hairline region dividers, `EcgMark`+wordmark brand, toned filter control, structural `ToggleGroup` view switch, vitals. No `--tb-accent`.

- [ ] **Step 1: Restructure `components/TopBar.tsx`**

Replace the file body with (keep the outside-click/Escape effect):
```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/src/store/store";
import { metagraphById } from "@/src/data/network";
import { hex } from "@/src/util/format";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import Vitals from "@/components/topbar/Vitals";
import FilterPicker from "@/components/topbar/FilterPicker";
import EcgMark from "@/components/topbar/EcgMark";
import type { Mode } from "@/src/store/store";

const VIEWS = [
  { id: "hyper", label: "◆", name: "Hypergraph" },
  { id: "geo", label: "◍", name: "Geography" },
  { id: "ledger", label: "▦", name: "Snapshots" },
  { id: "status", label: "◉", name: "Network", soon: true },
  { id: "transactions", label: "⇄", name: "Transactions", soon: true },
  { id: "staking", label: "⬢", name: "Staking", soon: true },
] as const;

// Collapsed filter face: a small identity dot + the network name in neutral text (no filled
// chip). All → a neutral cyan dot. Identity is the ONLY colour the filter carries.
function filterFace(filter: string): { label: string; dot: string } {
  const cfg = metagraphById(filter);
  if (cfg) return { label: cfg.ticker || cfg.name, dot: hex(cfg.color) };
  return { label: "All", dot: "var(--primary)" };
}

export default function TopBar() {
  const live = useStore((s) => s.live);
  const filter = useStore((s) => s.filter);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const face = filterFace(filter);

  return (
    <div id="topbar" ref={ref} className={open ? "open" : ""}>
      <div className="tb-row">
        {/* Brand */}
        <div className={"tb-brand" + (live ? "" : " off")}>
          <EcgMark />
          <span className="tb-word">
            <span className="tb-word-dag">DAG</span>{" "}
            <span className="tb-word-vis">Visualizer</span>
          </span>
        </div>
        <span className="tb-div" />

        {/* Filter (toned, de-nested) */}
        <button className={"tb-filter" + (open ? " active" : "")} aria-expanded={open}
          onClick={() => setOpen((o) => !o)}>
          <span className="tb-filter-k">Filter</span>
          <span className="tb-filter-dot" style={{ background: face.dot }} />
          <span className="tb-filter-name">{face.label}</span>
          <span className="tb-caret">{open ? "▴" : "▾"}</span>
        </button>

        <div className="tb-spacer" />

        {/* View switch — structural */}
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => { if (v) setMode(v as Mode); }}
          className="tb-views"
        >
          {VIEWS.map((v) => (
            <ToggleGroupItem key={v.id} value={v.id} title={v.name}
              className={"tb-view" + (v.soon ? " soon" : "")}>
              <span className="tb-view-icon">{v.label}</span>
              <span className="tb-view-name">{v.name}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <div className="tb-spacer" />
        <span className="tb-div" />

        {/* Vitals */}
        <Vitals />
      </div>

      {open && (
        <div className="tb-expand">
          <FilterPicker onPick={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
```
(Confirm `Mode` is exported from `src/store/store.ts` — it is, per CLAUDE.md; if the import path differs, import from where the `Mode` union lives.)

- [ ] **Step 2: Rewrite `app/styles/14-top-bar.css` to the Instrument-Glass bar**

Replace the file with a version that: (a) styles `#topbar` as an `.ig-panel`-style glass surface with a **structural** left spine (cyan→blue gradient) and NO `--tb-accent`; (b) `.tb-div` hairline dividers; (c) the brand lockup (`.tb-brand`, `.tb-word`, `.tb-word-dag` bright, `.tb-word-vis` muted; `.tb-brand.off .tb-word-*` greyed); (d) the toned filter (`.tb-filter`, `.tb-filter-k` micro-label, `.tb-filter-dot` 9px, `.tb-filter-name` neutral text, `.tb-caret`); (e) the structural view switch — `.tb-views` wrapper, `.tb-view` buttons with the active state `[data-state="on"]` = structural cyan (inset ring + cyan icon + brighter label) via the tokens, `.tb-view.soon` dimmed; (f) keep `.tb-vitals`, `.tb-vital*` as-is except the scope-dot removal handled in Task 6; (g) `.tb-expand` opens the connected picker surface. Reference the Phase-1 tokens (`--primary`, `--core-l0`, `--panel-border`, `--sel-bg/--sel-border`, `--radius`) — do not reintroduce `--tb-accent`. Concretely:
```css
#topbar {
  position: fixed; top: 46px; left: 50%; transform: translateX(-50%);
  z-index: 40; display: flex; flex-direction: column;
  background: linear-gradient(180deg, rgba(20,26,46,.82), rgba(10,14,28,.76));
  border: 1px solid var(--panel-border); border-radius: var(--radius);
  backdrop-filter: blur(12px);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.05), 0 8px 30px rgba(0,0,0,.35);
  overflow: hidden;
}
#topbar::before { /* structural spine, cyan→blue */
  content: ""; position: absolute; left: 0; top: 10px; bottom: 10px; width: 2px; border-radius: 2px;
  background: linear-gradient(180deg, var(--primary), var(--core-l0)); opacity: .85;
}
.tb-row { display: flex; align-items: center; gap: 12px; padding: 8px 14px; }
.tb-div { width: 1px; align-self: stretch; background: var(--panel-border); margin: 4px 0; }
.tb-spacer { flex: 1; }
.tb-brand { display: flex; align-items: center; gap: 8px; }
.tb-word { font-weight: 600; letter-spacing: -0.01em; font-size: 14px; }
.tb-word-dag { color: var(--text); }
.tb-word-vis { color: var(--muted); }
.tb-brand.off .tb-word-dag, .tb-brand.off .tb-word-vis { color: var(--muted); opacity: .7; }
.tb-filter { display: flex; align-items: center; gap: 7px; background: none; border: none;
  cursor: pointer; padding: 6px 8px; border-radius: 8px; }
.tb-filter:hover, .tb-filter.active { background: rgba(90,140,255,.10); }
.tb-filter-k { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
.tb-filter-dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
.tb-filter-name { font-size: 13px; color: var(--text); }
.tb-caret { font-size: 9px; color: var(--muted); }
.tb-views { display: flex; gap: 2px; }
.tb-view { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 8px;
  color: var(--muted); background: none; border: none; cursor: pointer; }
.tb-view:hover { color: var(--text); background: rgba(90,140,255,.10); }
.tb-view[data-state="on"] { color: var(--text); background: var(--sel-bg);
  box-shadow: inset 0 0 0 1px var(--sel-border); }
.tb-view[data-state="on"] .tb-view-icon { color: var(--primary); }
.tb-view.soon { opacity: .45; }
.tb-view-icon { font-size: 13px; line-height: 1; }
.tb-view-name { font-size: 12px; }
.tb-vitals { display: flex; align-items: center; gap: 14px; }
.tb-vital { display: flex; flex-direction: column; gap: 2px; }
.tb-vital-k { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
.tb-vital-row { display: flex; align-items: center; gap: 7px; }
.tb-vital-v { font-family: ui-monospace, monospace; font-weight: 700; color: var(--text);
  font-variant-numeric: tabular-nums; }
.tb-vital-ph { color: var(--muted); font-style: italic; opacity: .6; }
.tb-expand { border-top: 1px solid var(--panel-border); padding: 6px; }
```
(Adjust `top`/width to match the previous bar's placement so the rails still clear it — the old `--rail-top` is 103px, tuned to clear this bar; keep the bar's height similar.)

- [ ] **Step 3: Screenshot every 3D view + a filtered state**

Restart clean. Screenshot `/` (hyper, `filter: "all"`), then temporarily seed `src/store/store.ts` `mode: "geo"` then `mode: "ledger"` then `filter: "<a metagraph id, e.g. DOR's>"` (revert after each), screenshotting each. Read each PNG. Verify:
- The glass bar with the structural cyan→blue spine, brand lockup (ECG + `DAG Visualizer`), toned filter (dot + neutral name, no filled chip), structural view switch (active = cyan, NOT metagraph-tinted), the three `soon` views dimmed, vitals on the right.
- **Filtered:** the active view button stays **cyan** (not tinted to the metagraph) — the lane fix; only the filter dot carries the identity hue.
Revert all store seeds.

- [ ] **Step 4: Commit**

```bash
git add -A && git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" \
  commit -m "feat(topbar): Instrument-Glass shell + ECG brand + structural view switch + de-nested filter

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Vitals — odometer roll, neutral scope, ledger sparkline lane-fix

**Files:**
- Modify: `components/topbar/Vitals.tsx`

**Interfaces:**
- Consumes: `Odometer` (Task 2), the store vitals fields, `Sparkline`.
- Produces: the restructured `Vitals` — headline values via `<Odometer>`; the scope dot removed; hyper filtered layers show an **em-dash** when absent; ledger sparklines use muted history + a cyan latest bar.

- [ ] **Step 1: Rewrite `components/topbar/Vitals.tsx`**

Key changes from the current file: (1) the `Vital` value uses `<Odometer>` when it's a plain number; (2) remove the `Vitals` wrapper's `tb-vitals-dot` scope dot entirely (the filter pill is the sole scope cue); (3) in `HyperVitals`, when a metagraph is filtered, render an em-dash for a layer it doesn't run (keeps 3 stable columns); (4) `LedgerVitals` sparkline colour is **structural cyan** (`var(--primary)` via a hex), NOT the filter colour — the number-colour rule (cyan = the live accent on these live-activity charts). Concretely:
```tsx
"use client";

import { useStore } from "@/src/store/store";
import { metagraphById } from "@/src/data/network";
import { ccToFlag } from "@/src/util/format";
import Sparkline from "@/components/Sparkline";
import Odometer from "@/components/Odometer";
import { rolesOf } from "@/components/inspector/parts";
import type { NodeInfo } from "@/src/data/types";

// Structural cyan for the live-activity sparklines (lane-correct: cyan = the live accent).
const CYAN = "#2af5ff";

function Vital({ label, value, spark }: { label: string; value: React.ReactNode; spark?: number[] }) {
  return (
    <div className="tb-vital">
      <span className="tb-vital-k">{label}</span>
      <span className="tb-vital-row">
        <span className="tb-vital-v">{value}</span>
        {spark && <Sparkline data={spark} color={CYAN} />}
      </span>
    </div>
  );
}

function HyperVitals() {
  const filter = useStore((s) => s.filter);
  const metaList = useStore((s) => s.metaList);
  const cfg = metagraphById(filter);

  const c = { l0: 0, cl1: 0, dl1: 0 };
  const runs = { l0: false, cl1: false, dl1: false };
  const add = (nodes: NodeInfo[]) => {
    for (const n of nodes) {
      const roles = rolesOf(n);
      if (roles.includes("l0")) { c.l0++; runs.l0 = true; }
      if (roles.includes("cl1")) { c.cl1++; runs.cl1 = true; }
      if (roles.includes("dl1")) { c.dl1++; runs.dl1 = true; }
    }
  };
  const cores = cfg ? metaList.filter((m) => m.id === cfg.id) : metaList;
  for (const mg of cores) add(mg.nodes);

  // Filtered: an em-dash for a layer this metagraph doesn't run (stable 3 columns, no reflow).
  const cell = (n: number, runsLayer: boolean) =>
    cfg && !runsLayer ? <span className="tb-vital-ph">—</span> : <Odometer value={n} />;

  return (
    <>
      <Vital label="L0" value={cell(c.l0, runs.l0)} />
      <Vital label="cL1" value={cell(c.cl1, runs.cl1)} />
      <Vital label="dL1" value={cell(c.dl1, runs.dl1)} />
    </>
  );
}

function GeoVitals() {
  const lb = useStore((s) => s.leaderboard);
  const countries = lb?.countries ?? [];
  const top = countries[0] ?? null;
  // "Nodes" = total machines on the map = the sum of the per-country counts (the leaderboard
  // is the authoritative per-country breakdown; each row has `.count`). Derive it rather than
  // depend on a separate total field.
  const nodes = countries.length ? countries.reduce((s, c) => s + c.count, 0) : null;
  return (
    <>
      <Vital label="Nodes" value={<Odometer value={nodes} />} />
      <Vital label="Countries" value={<Odometer value={countries.length || null} />} />
      <Vital label="Densest" value={top ? <>{ccToFlag(top.cc)} {top.count}</> : "—"} />
    </>
  );
}

function LedgerVitals() {
  const activity = useStore((s) => s.activity);
  return (
    <>
      <Vital label="Snaps/hr" value={<Odometer value={activity?.snapsPerHour} />} spark={activity?.cadenceSeries} />
      <Vital label="Anchors/hr" value={<Odometer value={activity?.anchorsPerHour} />} spark={activity?.anchoredSeries} />
      <Vital label="—" value={<span className="tb-vital-ph">soon</span>} />
    </>
  );
}

export default function Vitals() {
  const mode = useStore((s) => s.mode);
  const body =
    mode === "geo" ? <GeoVitals /> : mode === "ledger" ? <LedgerVitals /> : mode === "hyper" ? <HyperVitals /> : null;
  return <div className="tb-vitals">{body}</div>;
}
```
Notes for the implementer: verify the store field names against `src/store/store.ts` / the `LeaderboardData` + `Activity` types — the spec's geo "Nodes" total is `leaderboard.total` (the count of mapped machines); if that field is named differently, use the correct one and note it. The old `GeoVitals` "Distribution" score is intentionally dropped from the bar (it moved to the GeoExplore header per the spec) — do not re-add it.

- [ ] **Step 2: Typecheck + screenshot each view**

Run `npx tsc --noEmit`. Restart clean. Screenshot hyper / geo / ledger (seed `mode` in the store, revert after) and a filtered hyper (seed `filter`), Read each. Verify: neutral mono values (no leading scope dot); geo shows `Nodes · Countries · Densest`; ledger sparklines are muted-history + cyan; filtered hyper shows em-dashes for absent layers with stable columns. Revert seeds.

- [ ] **Step 3: Commit**

```bash
git add -A && git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" \
  commit -m "feat(vitals): odometer roll, drop scope dot, em-dash absent layers, cyan ledger sparkline

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Retire the replaced CSS + final verification

**Files:**
- Modify: `app/globals.css` (remove retired `@import`s), `app/design/page.tsx` (trim temporary demos if desired)
- Delete: `app/styles/02-filter-panel.css`, `app/styles/04-disabled-filter-chip.css` (NOT `06-snapshot-live-heartbeat.css` — still used by `LiveHeart.tsx`)

**Interfaces:** none new — cleanup + confirmation that nothing still references the deleted rules.

- [ ] **Step 1: Confirm the retired CSS is dead**

Run:
```bash
cd /home/alexander/Workspace/dag-visualizer
grep -rnE "snap-pulse|mf-chip|mf-dot|mf-ghost|mf-count|mf-chips" app components src js | grep -v "app/styles/" || echo "no live references"
```
Expected: `no live references` (the old `FilterChips`/heartbeat markup is gone). If any reference remains (e.g. another component used `.snap-pulse`), STOP and report — do not delete a still-referenced stylesheet.

- [ ] **Step 2: Delete the retired stylesheets + their imports**

Delete `app/styles/02-filter-panel.css`, `app/styles/04-disabled-filter-chip.css`. In `app/globals.css` remove their two `@import "./styles/…";` lines. **Do NOT delete `06-snapshot-live-heartbeat.css`** — the dead-reference grep will show `.snap-pulse` is still used by `components/LiveHeart.tsx` (the snapshot-card heartbeat), so keep it and its `@import`.

- [ ] **Step 3: Build + full typecheck**

Run `npm run build`.
Expected: clean; `/api/metagraphs` still `○` (Static, 10m). If the build flags an unused import or a missing class, fix it.

- [ ] **Step 4: Final regression screenshots**

Restart clean. Screenshot `/` in hyper (all), plus seed + shoot geo, ledger, and a filtered metagraph state; Read each. Confirm the full command bar reads correctly in every view, the filter picker opens (screenshot `/design` if it still hosts a picker instance, or verify via `/` interaction path), and nothing from the old bar/heartbeat/chip CSS lingers (no broken/unstyled elements). Revert store seeds.

- [ ] **Step 5: Commit**

```bash
git add -A && git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" \
  commit -m "chore(topbar): retire heartbeat + filter-panel + disabled-chip CSS (replaced)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Done-when (Phase 2 acceptance)

- `npm run build` clean; `/api/metagraphs` stays `○` Static; `npm test` passes (odometer formatter).
- The command bar is one Instrument-Glass surface with a **structural** cyan→blue spine and hairline dividers; brand = the **ECG mark + `DAG Visualizer`** wordmark (DAG bright, Visualizer muted); the ECG **beats per snapshot tick** and **flatlines + greys** when the feed is down.
- The **filter is de-nested + toned** (micro-label + identity dot + neutral name + caret, no filled chip); clicking expands into the **searchable logo picker** (All on top, rows sorted by located desc, 0-located greyed with real count, current highlighted, monogram/logo avatars ringed in the identity hue).
- The **view switch is structural** (active = cyan, never metagraph-tinted; the three placeholders dimmed); **`--tb-accent` is gone** — a filtered metagraph no longer tints navigation chrome. The **only identity colour in the bar is the filter dot**.
- **Vitals** are neutral mono values that **odometer-roll** on change, with **no scope dot**; hyper filtered shows em-dashes for absent layers; the ledger sparklines are muted-history + a cyan latest bar.
- The old `FilterChips`, `02-filter-panel.css`, `04-disabled-filter-chip.css` are deleted. (`06-snapshot-live-heartbeat.css` stays — still used by `LiveHeart.tsx`.)

## Follow-ups (later phases)

- **Engine token-bridge:** swap the identity-hue source from `config.METAGRAPHS` to the Phase-1 generator (`--mg`/API `hue`) **atomically** across the filter dot, picker, hubs, and globe nodes so the dot always matches the scene; mount `MetagraphVars` app-wide.
- Narrow-screen bar condensing (wordmark → mark + `DAG`; vitals collapse) — the responsive spec.
- Fold the bar tokens (spine, dividers, region paddings, picker rows) into the shared Instrument-Glass token pass.
- The third ledger vital (a fully-factual per-hour fee) once a non-floor source is settled.
