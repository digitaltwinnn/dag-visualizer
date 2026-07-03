# HUD Refresh — Phase 5: LiveStrip (bottom strip) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the bottom LiveStrip into the Instrument-Glass "crisp-cap / faded-body" bar-chart — quiet bars whose value reads from a crisp accent cap, a fixed **data-model change** so a filtered metagraph plots its *own* per-tick cadence on its *own* scale (not a sub-pixel share-of-total), and a redesigned tooltip (bare ordinal · counts · relative recency / live now · click hint).

**Architecture:** All in `components/LiveStrip.tsx` + `app/styles/*` (the strip's CSS). The bars become a crisp 2px cap in the accent hue over a downward-fading body on a faint baseline; the per-bar value is the tick's total anchors (unfiltered, cyan) or the selected metagraph's own anchors (filtered, its identity hue, on its own max, empty ticks = honest gaps). A small tested `relativeAge` helper formats the tooltip recency (also adopted by the snapshot card for consistency). The existing `setHoverSnapOrd` cross-highlight into the ledger view is preserved.

**Tech Stack:** Next 15 · React 19 · TypeScript · Tailwind v4 + Phase-1 tokens · vitest.

## Global Constraints

- **Node ≥ 18.18.** Branch **`dev`**. Commit as author `digitaltwinnn` (`git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" commit …`), short messages ending with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Crisp cap, faded body, quiet.** Each bar = a **crisp ~2px cap in the accent hue** (the value marker) with the body **fading downward** into the scene (body ≈26% opacity), on a **faint flat baseline hairline** (no glow). The value reads from the **cap**, so the fading bottom never hides data. Ink lives in the cap — a full row stays quiet even in loud identity hues. The **live/latest bar's cap glows**; nothing else animates.
- **Own cadence when filtered (the data-model fix).** **Unfiltered (All):** bars = **total anchors per tick**, **cyan** (structural), scaled to the window max. **Filtered (a metagraph):** bars = **that metagraph's OWN anchors per tick**, in its **identity hue**, scaled to **its own max** (its personal cadence). Empty ticks render as **honest gaps** (no cap). This REPLACES the old "bar = total, fill = share-of-total" stacked encoding (which made a 1-of-50 metagraph a sub-pixel sliver). The tick **total stays available on hover**.
- **Two colour lanes:** cyan (structural) for All; the metagraph **identity hue** (`filterAccent(filter)` = `hex(cfg.color)` — the config source, matching the scene) for a filtered metagraph. The cap + body are the accent hue; no other colour.
- **The strip is quiet chrome** — only the live dot + the live bar's cap glow animate (~1.5 s family); no full-strip animation. Reduced-motion → the live dot holds steady.
- **Scale label switches with the mode:** `anchors / tick` (All) ↔ `‹TICKER› anchors / tick · own scale` (filtered).
- **Tooltip** (the single cursor-following element): **bare ordinal as the head — no `#`**; counts (`anchored N` All · `‹TICKER› N of N total` filtered · `‹TICKER› 0 · none this tick` on a gap); **relative recency** `◷ 12s ago` (coarse, freshness not a clock), or `● live now` (cyan dot) on the live bar; hint `click to open snapshot`. **Gap ticks stay hoverable/clickable** (real global snapshots).
- **Click** selects that snapshot (carries across views, the existing behaviour) — unchanged.
- **Path alias** `@/*` → repo root.
- **Dev server (shared) + verification:** ONE `next dev` at `http://localhost:3000` — do NOT start/kill/restart it, do NOT `rm -rf .next`, do NOT run `npm run build`; use `npx tsc --noEmit` + `npm test`. Verify visuals with the **chrome-devtools MCP** (`mcp__plugin_chrome-devtools-mcp__*`; `ToolSearch` "chrome-devtools navigate screenshot click snapshot evaluate" if not loaded): `navigate_page` to `:3000` (the strip shows in hyper/geo/ledger), filter a metagraph (cmdk rows aren't in the a11y tree — DOM-click via `evaluate_script`), hover a bar; `take_screenshot` + Read + `getComputedStyle` for exact colour checks. Ignore benign console noise.

**Source spec:** `docs/superpowers/specs/2026-07-01-left-rail-bottom-strip-design.md` (the "Bottom strip — the LiveStrip" section). Current code: `components/LiveStrip.tsx`, its CSS (grep `#livestrip`/`.ls-` — in `app/styles/*`), `components/inspector/cards.tsx` (`SnapshotCard` has an inline relative-age to dedupe).

**Out of scope (later):** the **bidirectional ledger-block ↔ cap synced glow's reverse direction** (ledger block hover → strip cap glow) — that's the scene-tie-in spec; this phase keeps the existing strip→ledger `setHoverSnapOrd` and the strip's own cap hover-glow. The left rail / GeoExplore (next plan). Don't flag their absence.

---

## File Structure

- `src/util/relativeAge.ts` — **create** — pure `relativeAge(ms)` → coarse `"12s ago"`/`"3m ago"`/`"2h ago"` (freshness helper).
- `src/util/relativeAge.test.ts` — **create** — its unit test.
- `components/LiveStrip.tsx` — **modify** — the crisp-cap/faded-body bars, the own-cadence-when-filtered data model, the scale label, and the redesigned tooltip.
- `components/inspector/cards.tsx` — **modify** (small) — `SnapshotCard` adopts `relativeAge` for its state-line recency (dedupe its inline version).
- `app/styles/01-snapshot-ribbon.css` — **modify** — the strip's `#livestrip`/`.ls-*` styles: the crisp-cap/faded-body bars + the scale label + tooltip.

---

## Task 1: `relativeAge` helper (TDD) + adopt in SnapshotCard

**Files:**
- Create: `src/util/relativeAge.ts`, `src/util/relativeAge.test.ts`
- Modify: `components/inspector/cards.tsx`

**Interfaces:**
- Produces: `relativeAge(ageMs: number): string` — coarse recency: `< 60s → "Ns ago"` (min 1s), `< 60m → "Nm ago"`, else `"Nh ago"`; `NaN`/negative → `""`.

- [ ] **Step 1: Write the failing test**

Create `src/util/relativeAge.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { relativeAge } from "./relativeAge";

describe("relativeAge", () => {
  it("formats seconds/minutes/hours coarsely", () => {
    expect(relativeAge(5_000)).toBe("5s ago");
    expect(relativeAge(90_000)).toBe("2m ago");     // rounds
    expect(relativeAge(3 * 3_600_000)).toBe("3h ago");
  });
  it("floors sub-second to 1s", () => {
    expect(relativeAge(200)).toBe("1s ago");
  });
  it("returns empty for NaN / negative (unparseable/future)", () => {
    expect(relativeAge(NaN)).toBe("");
    expect(relativeAge(-5)).toBe("");
  });
});
```

- [ ] **Step 2: Run it RED** — `npm test -- relativeAge` → FAIL (`Cannot find module './relativeAge'`).

- [ ] **Step 3: Implement `src/util/relativeAge.ts`**

```ts
// Coarse relative recency — freshness, not a ticking clock. Guarded against NaN/future.
export function relativeAge(ageMs: number): string {
  if (Number.isNaN(ageMs) || ageMs < 0) return "";
  if (ageMs < 60_000) return `${Math.max(1, Math.round(ageMs / 1000))}s ago`;
  if (ageMs < 3_600_000) return `${Math.round(ageMs / 60_000)}m ago`;
  return `${Math.round(ageMs / 3_600_000)}h ago`;
}
```

- [ ] **Step 4: Run it GREEN** — `npm test -- relativeAge` → PASS.

- [ ] **Step 5: Adopt it in `SnapshotCard`**

In `components/inspector/cards.tsx`, `SnapshotCard`: replace the inline `rel` computation with the helper. Add `import { relativeAge } from "@/src/util/relativeAge";`, and change:
```tsx
  const ageMs = Date.now() - Date.parse(d.timestamp);
  const rel = Number.isNaN(ageMs) ? "" : ageMs < 60_000 ? … ;   // OLD inline block
```
to:
```tsx
  const rel = relativeAge(Date.now() - Date.parse(d.timestamp));
```
(Behaviour is identical; this dedupes the recency logic so the card + the strip read the same.)

- [ ] **Step 6: Typecheck + commit**

Run `npx tsc --noEmit` (clean). Then:
```bash
git add src/util/relativeAge.ts src/util/relativeAge.test.ts components/inspector/cards.tsx && \
git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" \
  commit -m "feat(util): relativeAge recency helper (tested); adopt in SnapshotCard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Crisp-cap / faded-body bars + own-cadence-when-filtered data model

**Files:**
- Modify: `components/LiveStrip.tsx`, `app/styles/01-snapshot-ribbon.css`

**Interfaces:**
- Consumes: `useSnapshotFeed`, `store.{snap,filter,setSnap,setHoverSnapOrd,setFollowing}`, `getAnchor`/`metagraphById`/`filterAccent` (`@/src/data/network`), `latestRelevant` (`@/src/data/follow`).
- Produces: the restructured bar rendering (the tooltip stays for Task 3 but is rewritten there).

- [ ] **Step 1: Restructure the bar data + render in `LiveStrip.tsx`**

Replace the `bars`/`maxTotal`/render so the value is the **total** (All) or **mine** (filtered) on the right max, and the bar is a crisp-cap/faded-body element (the fill segment is gone):
```tsx
  // Per bar: the tick's total anchors, and (filtered) this metagraph's own anchors. The plotted
  // VALUE is `mine` when a metagraph is filtered (its own cadence on its own scale), else `total`.
  const bars = snaps.map((d) => {
    const total = typeof d.metagraphSnapshotCount === "number" ? d.metagraphSnapshotCount : 0;
    const mine = isMeta ? getAnchor(d.timestamp)?.metaCounts?.get(filter) ?? 0 : total;
    return { d, total, mine };
  });
  const scaleMax = Math.max(1, ...bars.map((b) => (isMeta ? b.mine : b.total)));
```
Render each bar (replace the current `.ls-bar` block — no `.ls-bar-fill`):
```tsx
        {bars.map(({ d, total, mine }, i) => {
          const live = i === bars.length - 1;
          const active = d.ordinal === activeOrd;
          const value = isMeta ? mine : total;
          const gap = value === 0;                        // honest gap (esp. filtered)
          const cls = "ls-bar" + (gap ? " gap" : "") + (live ? " live" : "") + (active ? " active" : "");
          return (
            <button
              key={d.ordinal}
              className={cls}
              style={{ height: gap ? "0%" : `max(6%, ${Math.round((value / scaleMax) * 100)}%)` }}
              aria-label={`snapshot ${d.ordinal}`}
              onMouseEnter={(e) => { setTip({ ordinal: d.ordinal, total, mine, ts: d.timestamp, live, x: e.clientX, y: e.clientY }); setHoverSnapOrd(d.ordinal); }}
              onMouseMove={moveTip}
              onClick={() => pick(d)}
            />
          );
        })}
```
Update the `tip` state shape to carry `{ ordinal, total, mine, ts, live, x, y }` (Task 3 uses `ts`/`live`); and the `--ls-*` inline style — drop `--ls-outline`, keep a single `--ls-accent`:
```tsx
    <section id="livestrip" style={{ ["--ls-accent"]: accent } as CSSProperties}>
```
Add the **scale label** beside the live indicator:
```tsx
      <span className="ls-live">
        <span className="live-dot" />
        Global L0
        <span className="ls-scale">
          {isMeta ? `${cfg!.ticker || cfg!.name} anchors/tick · own scale` : "anchors/tick"}
        </span>
      </span>
```

- [ ] **Step 2: Rewrite the bar CSS (crisp cap, faded body, baseline)**

In `app/styles/01-snapshot-ribbon.css`, replace the `.ls-bar`/`.ls-bar-fill` rules:
```css
.ls-bars { position: relative; }
/* faint flat baseline hairline the bars sit on */
.ls-bars::after {
  content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 1px;
  background: rgba(160, 175, 205, 0.18); pointer-events: none;
}
.ls-bar {
  position: relative; align-self: flex-end; border: none; cursor: pointer; padding: 0;
  /* body: the accent hue fading downward into the scene (quiet) */
  background: linear-gradient(to bottom, color-mix(in oklch, var(--ls-accent) 26%, transparent), transparent);
  border-radius: 1px 1px 0 0;
}
/* crisp value cap at the top of the bar */
.ls-bar::before {
  content: ""; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: var(--ls-accent); border-radius: 1px;
}
.ls-bar.gap { background: none; }
.ls-bar.gap::before { display: none; }        /* an empty tick reads as a gap on the baseline */
.ls-bar:hover::before, .ls-bar.active::before { box-shadow: 0 0 6px var(--ls-accent); }
.ls-bar.live::before { box-shadow: 0 0 6px var(--ls-accent); }   /* the live cap glows */
@media (prefers-reduced-motion: reduce) { .live-dot { animation: none; } }
```
(Keep the `.ls-bars` flex layout / overflow / mask from the existing rules; only the bar look changes. Add the `.ls-scale` label style: `font-size: 10px; color: var(--muted); margin-left: 8px; letter-spacing: .02em;`.)

- [ ] **Step 3: Typecheck + verify via chrome-devtools MCP**

Run `npx tsc --noEmit` (clean). Then via the MCP: `navigate_page` to `:3000` (hyper). Read the strip: quiet bars, each a **crisp cyan cap** over a **faded body** on a faint baseline; the live (right-most) cap glows; the scale label reads `anchors/tick`. Then filter a metagraph (DOM-click the filter + a row) → the bars re-plot to that metagraph's **own cadence** in its **identity hue** (empty ticks show as **gaps**, not sub-pixel slivers), and the scale label reads `‹TICKER› anchors/tick · own scale`. `getComputedStyle` the `.ls-bar::before` background = the metagraph hue when filtered / cyan for All. Read the PNGs.

- [ ] **Step 4: Commit**

```bash
git add components/LiveStrip.tsx app/styles/01-snapshot-ribbon.css && \
git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" \
  commit -m "feat(livestrip): crisp-cap/faded-body bars + own-cadence-when-filtered (own scale)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Tooltip redesign (bare ordinal · counts · recency · hint)

**Files:**
- Modify: `components/LiveStrip.tsx`, `app/styles/01-snapshot-ribbon.css`

**Interfaces:**
- Consumes: `relativeAge` (Task 1); the `tip` state `{ ordinal, total, mine, ts, live, x, y }` (Task 2).

- [ ] **Step 1: Rewrite the tooltip in `LiveStrip.tsx`**

Add `import { relativeAge } from "@/src/util/relativeAge";`. Replace the `{tip && (…)}` block:
```tsx
      {tip && (
        <div id="ls-tip" ref={tipRef} style={{ left: tip.x, top: tip.y }}>
          {/* Bare ordinal head — no '#'; a big mono number in a snapshot tooltip is obviously the ordinal. */}
          <div className="ls-tip-head">{tip.ordinal.toLocaleString()}</div>
          <div className="ls-tip-line">
            {isMeta ? (
              tip.mine > 0 ? (
                <>
                  <span className="ls-tip-k">
                    <span className="ls-tip-dot" style={{ background: accent }} />
                    {cfg!.ticker || cfg!.name}
                  </span>
                  <span className="ls-tip-v">{tip.mine} of {tip.total} total</span>
                </>
              ) : (
                <>
                  <span className="ls-tip-k">
                    <span className="ls-tip-dot" style={{ background: accent }} />
                    {cfg!.ticker || cfg!.name}
                  </span>
                  <span className="ls-tip-v ls-tip-gap">0 · none this tick ({tip.total} total)</span>
                </>
              )
            ) : (
              <>
                <span className="ls-tip-k">anchored</span>
                <span className="ls-tip-v">{tip.total} metagraph snapshot{tip.total === 1 ? "" : "s"}</span>
              </>
            )}
          </div>
          {/* Recency — relative + coarse; the live bar reads 'live now'. */}
          <div className="ls-tip-rec">
            {tip.live ? (
              <><span className="ls-tip-live" /> live now</>
            ) : (
              <>◷ {relativeAge(Date.now() - Date.parse(tip.ts))}</>
            )}
          </div>
          <div className="ls-tip-hint">click to open snapshot</div>
        </div>
      )}
```

- [ ] **Step 2: Tooltip styles**

Adjust/add the tooltip CSS: keep `#ls-tip`/`.ls-tip-head`/`.ls-tip-line`/`.ls-tip-k`/`.ls-tip-v`/`.ls-tip-dot`; add:
```css
.ls-tip-head { font-family: ui-monospace, monospace; font-weight: 700; font-variant-numeric: tabular-nums; }
.ls-tip-gap { color: var(--muted); }
.ls-tip-rec { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--muted); margin-top: 4px; }
.ls-tip-live { width: 7px; height: 7px; border-radius: 50%; background: var(--primary); box-shadow: 0 0 0 3px color-mix(in oklch, var(--primary) 30%, transparent); }
.ls-tip-hint { font-size: 10px; color: var(--muted); opacity: 0.7; margin-top: 4px; }
```

- [ ] **Step 3: Typecheck + verify via chrome-devtools MCP**

Run `npx tsc --noEmit` (clean). Then via the MCP: hover bars on the strip and Read the tooltip. Confirm: the head is the **bare ordinal (no `#`)**; unfiltered → `anchored N metagraph snapshots` + a recency line (`◷ Xs ago`, or `● live now` on the right-most bar) + `click to open snapshot`. Filtered → `‹TICKER› N of M total` (or `0 · none this tick (M total)` on a gap tick) + recency + hint. Read the PNGs.

- [ ] **Step 4: Commit**

```bash
git add components/LiveStrip.tsx app/styles/01-snapshot-ribbon.css && \
git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" \
  commit -m "feat(livestrip): tooltip — bare ordinal, counts, relative recency, click hint

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Cleanup + final verification

**Files:**
- Modify: `app/styles/01-snapshot-ribbon.css` (prune dead rules), `components/LiveStrip.tsx` (drop unused)

- [ ] **Step 1: Prune dead CSS + unused code**

Grep for the removed classes and prune their now-dead rules:
```bash
cd /home/alexander/Workspace/dag-visualizer
grep -rnE "ls-bar-fill|--ls-outline|ls-tip-line" components | grep -v "app/styles/" || echo "no ls-bar-fill/--ls-outline markup"
```
Remove the now-unused `.ls-bar-fill` and `--ls-outline`-based rules from the LiveStrip CSS (the fill segment + the outline are gone). In `LiveStrip.tsx`, drop any now-unused imports/vars (e.g. the old `maxTotal`; `tsc`/lint will flag).

- [ ] **Step 2: Full typecheck + tests**

Run `npx tsc --noEmit` (clean) and `npm test` (all green — incl. the new `relativeAge` suite).

- [ ] **Step 3: Final regression via chrome-devtools MCP**

Reload `:3000`. Read + confirm across views: (a) **hyper/geo/ledger** all show the crisp-cap/faded-body strip; (b) **unfiltered** = cyan caps scaled to the window max, scale label `anchors/tick`; (c) **filtered** = the metagraph's own cadence in its hue on its own scale, gaps for empty ticks, label `‹TICKER› anchors/tick · own scale`; (d) the live cap glows; (e) hovering a bar shows the redesigned tooltip AND still cross-highlights in the ledger view (the existing `setHoverSnapOrd` — switch to ledger, hover a strip bar, confirm the matching block reacts); (f) clicking a bar still opens the snapshot card. Read the PNGs.

- [ ] **Step 4: Commit**

```bash
git add -A && git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" \
  commit -m "chore(livestrip): prune dead fill/outline CSS + unused vars

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Done-when (Phase 5 acceptance)

- `npx tsc --noEmit` clean; `npm test` passes (incl. `relativeAge`).
- The LiveStrip is **quiet crisp-cap / faded-body bars** on a faint baseline: the value reads from a **crisp accent cap**, the body fades downward (~26%), only the **live cap glows**.
- **Data-model fix:** unfiltered → **total anchors/tick, cyan**, scaled to the window max; filtered → **the metagraph's own anchors/tick, in its identity hue, on its own scale**, with **empty ticks as honest gaps** (no more sub-pixel share slivers). The **scale label switches** (`anchors/tick` ↔ `‹TICKER› anchors/tick · own scale`).
- **Tooltip:** bare ordinal (no `#`) · counts (`anchored N` / `‹TICKER› N of M total` / `0 · none this tick (M total)`) · relative recency `◷ Xs ago` or `● live now` · `click to open snapshot`. Gap ticks stay hoverable/clickable.
- The existing strip→ledger cross-highlight (`setHoverSnapOrd`) and click-to-select-snapshot still work; two-lane discipline holds (cyan for All, identity hue for a filtered metagraph).

## Follow-ups (later)

- The **reverse** cross-highlight (ledger block hover → strip cap glow) — the scene-tie-in spec.
- **GeoExplore + the left-rail tools** (the left-rail half — next plan): the country accordion with `ScrollArea` + matched magnitude bars + inline node rows using the Phase-4 status system; the ledger settlement-stack legend; the hyper about card.
- Fold the strip tokens (cap/body/baseline) into the shared Instrument-Glass token pass.
