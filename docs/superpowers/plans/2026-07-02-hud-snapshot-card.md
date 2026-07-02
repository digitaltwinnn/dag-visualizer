# HUD Refresh — Phase 4b: Snapshot Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the global-L0 snapshot Detail card to its spec — a `◆ <ordinal>` odometer title + live/recency state line, a ranked **share-of-total** anchored breakdown (with a pinned focus row when a metagraph is filtered), and a settlement block (fees + measured KB + rewards) — all under the neutral-number colour rule.

**Architecture:** Add `rewardsDatum` to the exact-read pipeline (`/api/snapshot/[ordinal]` + `SnapshotExact`), verified against a real raw snapshot before trusting it. Rework `AnchoredTags` from the flat colour-pill row into the ranked `dot · ticker · share-bar · count` breakdown + the filtered focus row. Restructure `SnapshotCard` (in `components/inspector/cards.tsx`) to the ◆-marker + odometer ordinal + state line + anchored-header + settlement. Reuses the Phase-2 `Odometer` and the Phase-3 breadcrumb eyebrow.

**Tech Stack:** Next 15 · React 19 · TypeScript · Tailwind v4 + Phase-1 tokens · the Phase-2 `Odometer` · vitest.

## Global Constraints

- **Node ≥ 18.18.** Branch **`dev`**. Commit as author `digitaltwinnn` (`git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" commit …`), short messages ending with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Number-colour rule (applies to every card):** data numbers are **NEUTRAL** — the headline bright white/bold/sized-up (size carries emphasis, not colour), secondary muted grey. **Cyan = live/accent only** — the `◆` marker, the `● live now` dot, links, selection. **Identity hue** only on per-metagraph dots/bars/thread/ticker. **Fees/rewards stay neutral** (never green/gold). A metagraph hue never colours a fee, a total, or a count.
- **Bars = share of the total.** Every metagraph's share-bar length ⇔ its share % of the anchored total (of N), so bar length is comparable across the whole list. All metagraphs listed (**no cap — facts**); `unlisted` is a neutral row.
- **Filtered → pinned focus row:** the filtered metagraph gets a focus row **pinned at the top regardless of rank** (a small anchorer is never buried) with a hue-filled background + accent bar; the rest list under "Other metagraphs", dimmed. The thread/dot/eyebrow re-tint to the metagraph hue (Phase-3 chrome — unchanged). **Totals stay unchanged** (the filter is a lens, not a different snapshot).
- **Exact read is the ONLY source** for the fee + breakdown + rewards (`store.snapshotExact[ordinal]`, from `SnapshotExactBridge`). While it loads → **ACQUIRING** ("reading…"); there is NO polled-floor fallback on this card (every selectable tick is inside the L0 retention window).
- **Factual:** size (KB) is **measured** (`content` byte length), NEVER derived from the fee. Rewards are shown **only if the raw `value.rewards` is present and its magnitude is verified sane** — otherwise omit the Rewards row (never show a fabricated/unverified number).
- **Dropped from the old card:** the `Global L0` text, `height · sub-height`, the block count, and the wrapping colour-pill wall.
- **Path alias** `@/*` → repo root.
- **Dev server (shared) + verification:** ONE `next dev` at `http://localhost:3000` — do NOT start/kill/restart it, do NOT `rm -rf .next`, do NOT run `npm run build` (shared-`.next` corruption); use `npx tsc --noEmit` + `npm test -- <name>`. Verify visuals with the **chrome-devtools MCP** (`mcp__plugin_chrome-devtools-mcp__*`; `ToolSearch` "chrome-devtools navigate screenshot click snapshot evaluate" if not loaded): `navigate_page` to `:3000`, switch to **Snapshots** (the live snapshot auto-follows, giving a card immediately), `click` an older LiveStrip bar for the recency state, filter a metagraph for the focus row; `take_screenshot` + Read + `evaluate_script`/`getComputedStyle` for exact colour/lane checks. NOTE: the cmdk filter rows aren't in the a11y tree — reach a filtered state via a DOM-query click. Ignore benign console noise.

**Source spec:** `docs/superpowers/specs/2026-07-01-snapshot-card-design.md`. Current code: `components/inspector/cards.tsx` (`SnapshotCard`), `components/inspector/AnchoredTags.tsx`, `app/api/snapshot/[ordinal]/route.ts`, `src/data/types.ts` (`SnapshotExact`, `GlobalSnapshot`).

**Out of scope (later):** the metagraph-snapshot type-marker (a per-metagraph mini-logo replacing the ◆ — lands when metagraph snapshots become clickable); the scene tie-in synced-glow (card ↔ ledger block — its own spec); the constellation-shimmer ACQUIRING treatment (a simple "reading…" is enough here — the shimmer is the empty-states spec's own follow-up). Don't flag their absence.

---

## File Structure

- `src/data/types.ts` — **modify** — add `rewardsDatum: number` to `SnapshotExact`.
- `app/api/snapshot/[ordinal]/route.ts` — **modify** — parse `value.rewards` from the raw snapshot → sum → `rewardsDatum` (fail-safe to 0), after verifying the shape against a real snapshot.
- `components/inspector/AnchoredTags.tsx` — **rewrite** — the ranked `dot · ticker · share-bar · count` breakdown (sorted desc, all listed + unlisted, bars = share of total) + the filtered **focus row** (pinned; name, full-width share-bar, `N snapshots · X%`, `fees paid`) + "Other metagraphs".
- `components/inspector/cards.tsx` — **modify** — `SnapshotCard`: `◆ <ordinal>` odometer title, state line (`● live now` / `◷ Xm ago`), the anchored-block header (`N snapshots anchored / from M metagraphs`), the settlement block (fees + KB sub-note + rewards). Drop height/sub-height/blocks.
- `app/styles/05-inspector-metagraph-context-pane.css` — **modify** — the new breakdown rows/bars, focus row, title row, state line, settlement rows; retire the old `.mg-tag*` pill styles once unreferenced.

---

## Task 1: Rewards in the exact read (verify shape, fail-safe)

**Files:**
- Modify: `src/data/types.ts`, `app/api/snapshot/[ordinal]/route.ts`

**Interfaces:**
- Produces: `SnapshotExact.rewardsDatum: number` — the total rewards this snapshot distributes, in **datum** (1 DAG = 1e8 datum), like `totalFee`; `0` when absent/unverified.

- [ ] **Step 1: Inspect a REAL raw snapshot to find `value.rewards`**

The route fetches the raw L0 global snapshot. Find its URL in `app/api/snapshot/[ordinal]/route.ts` (the `fetch(...)` inside `fetchExact` — it hits the L0 load-balancer's `global-snapshots/{ordinal}`). Pick a **recent** ordinal (the L0 node prunes after ~30 min): get one from the running app — `curl -s http://localhost:3000/api/metagraphs >/dev/null` isn't it; instead read the latest ordinal from the app (`curl -s http://localhost:3000/api/snapshot/<recentOrdinal>` returns the *processed* `SnapshotExact`, not the raw). To see the RAW shape, curl the L0 endpoint directly (copy the exact URL the route builds) for a recent ordinal and inspect `.value.rewards`:
```bash
# From route.ts, the raw URL is like: https://l0-lb-mainnet.constellationnetwork.io/global-snapshots/<ord>
# Get a recent ordinal from the dev server's data, then:
curl -s "<the-raw-L0-global-snapshots-URL>/<recentOrdinal>" | python3 -c "import sys,json; d=json.load(sys.stdin); v=d.get('value',d); r=v.get('rewards'); print('type:', type(r).__name__); print(json.dumps(r, indent=2)[:800])"
```
Record in the report: the `rewards` type (array? object?), each element's shape (e.g. `{destination, amount}`), and the magnitude of a summed total (is it a sane DAG amount, e.g. thousands of DAG, not 1e18?). **If `rewards` is absent, empty, or the magnitude is implausible, note it — Task 3 will then omit the Rewards row and this field stays 0.**

- [ ] **Step 2: Add `rewardsDatum` to `SnapshotExact`**

In `src/data/types.ts`, add to the `SnapshotExact` interface (after `totalSizeKB`):
```ts
  rewardsDatum: number; // total rewards distributed by this snapshot, in datum (0 if absent/unverified)
```

- [ ] **Step 3: Parse rewards in the route (defensive, based on Step 1's finding)**

In `app/api/snapshot/[ordinal]/route.ts`, locate the variable in `fetchExact` that holds the **fetched raw global-snapshot body** (the same object `stateChannelSnapshots` are read from — the global snapshot wraps its fields under `value`, exactly like the state-channel snaps, so rewards live at `<body>.value.rewards`; match whatever access path Step 1 confirmed). Compute the rewards sum defensively and include it in the returned object. The canonical Constellation shape is an array of reward transactions each with an `amount` (datum). Defensive version (replace `rawBody` with the actual variable name; adjust the `.value.rewards` path to Step 1's finding):
```ts
  // Rewards the snapshot distributes (each reward carries an `amount` in datum). Defensive: only
  // sum if it's an array of {amount}; anything else → 0 (never fabricate). Verified shape: <Step 1>.
  const rawRewards = (rawBody as { value?: { rewards?: unknown } } | undefined)?.value?.rewards;
  const rewardsDatum = Array.isArray(rawRewards)
    ? rawRewards.reduce((s: number, r) => s + (typeof (r as { amount?: number })?.amount === "number" ? (r as { amount: number }).amount : 0), 0)
    : 0;
```
(If Step 1 found a different shape — e.g. rewards nested under `value.rewards.rewards` or a Set serialised as an object — adjust the access to match what you actually saw, keeping the `typeof … === "number"` guard and the `0` fallback.) Add `rewardsDatum,` to the returned `SnapshotExact` object literal.

- [ ] **Step 4: Verify**

Run `npx tsc --noEmit` (clean). Restart nothing. Confirm the route serves the field:
```bash
curl -s "http://localhost:3000/api/snapshot/<recentOrdinal>" | python3 -c "import sys,json; d=json.load(sys.stdin); print('rewardsDatum:', d.get('rewardsDatum'), '=> DAG:', (d.get('rewardsDatum') or 0)/1e8)"
```
Expected: a numeric `rewardsDatum` and a sane DAG figure (per Step 1). If it's 0 because rewards were absent/unverified, that's the fail-safe — record it.

- [ ] **Step 5: Commit**

```bash
git add src/data/types.ts "app/api/snapshot/[ordinal]/route.ts" && \
git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" \
  commit -m "feat(api): parse snapshot rewards → SnapshotExact.rewardsDatum (verified shape, fail-safe)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: AnchoredTags → ranked share-of-total breakdown + focus row

**Files:**
- Rewrite: `components/inspector/AnchoredTags.tsx`
- Modify: `app/styles/05-inspector-metagraph-context-pane.css`

**Interfaces:**
- Consumes: `store.snapshotExact[ordinal]` (`SnapshotExact` — `perMeta`, `anchored`, `channels`, `unlistedCount`), `store.filter`, `metagraphById`, `hex`.
- Produces: `<AnchoredTags ordinal={number} anchored={number|null} awaiting={boolean} />` — the anchored-block body: header (`N snapshots anchored / from M metagraphs`) + the ranked breakdown + the filtered focus row.

- [ ] **Step 1: Rewrite `AnchoredTags.tsx`**

```tsx
"use client";

import { useStore } from "@/src/store/store";
import { metagraphById } from "@/src/data/network";
import { hex, fmtDag } from "@/src/util/format";

// The anchored block on the snapshot card: a ranked share-of-total breakdown of the metagraph
// snapshots this global tick anchored — `dot · ticker · share-bar · count`, sorted desc, ALL of
// them (no cap; facts), unlisted as a neutral row. Bars = share of the total, so length is
// comparable across the whole list. Source = the EXACT raw-L0 read only (no polled floor); while
// it loads we show the header + "reading…". When a metagraph is filtered, it gets a focus row
// pinned at the top (regardless of rank) and the rest list under "Other metagraphs", dimmed.
export default function AnchoredTags({
  ordinal,
  anchored,
  awaiting,
}: {
  ordinal: number;
  anchored: number | null;
  awaiting?: boolean;
}) {
  const filter = useStore((s) => s.filter);
  const exact = useStore((s) => s.snapshotExact[ordinal]);
  const cfg = metagraphById(filter);

  const total = anchored ?? exact?.anchored ?? 0;
  const channels = exact?.channels ?? null;

  // Header (always, even while acquiring): "N snapshots anchored from M metagraphs".
  const header = (
    <div className="anc-head">
      <span className="anc-head-total"><b>{total}</b> snapshot{total === 1 ? "" : "s"} anchored</span>
      {channels != null && <span className="anc-head-sub">from {channels} metagraph{channels === 1 ? "" : "s"}</span>}
    </div>
  );

  if (!exact) {
    return (
      <div className="anc">
        {header}
        {awaiting && <div className="anc-reading">reading…</div>}
      </div>
    );
  }

  // Rows from the exact per-metagraph breakdown: listed (named/hued) + one aggregate unlisted row.
  type Row = { id: string; label: string; hue: string | null; n: number };
  const listed: Row[] = [];
  for (const [addr, { count }] of Object.entries(exact.perMeta)) {
    const c = metagraphById(addr);
    if (c) listed.push({ id: addr, label: c.ticker || c.name, hue: hex(c.color), n: count });
  }
  listed.sort((a, b) => b.n - a.n);
  const rows: Row[] = [...listed];
  if (exact.unlistedCount > 0)
    rows.push({ id: "unlisted", label: "unlisted", hue: null, n: exact.unlistedCount });

  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  const bar = (n: number, hue: string | null) => (
    <span className="anc-bar">
      <span
        className="anc-bar-fill"
        style={{ width: `${Math.max(pct(n), n > 0 ? 4 : 0)}%`, background: hue ?? "var(--muted)" }}
      />
    </span>
  );

  const focusId = cfg?.id ?? null;
  const focus = focusId ? rows.find((r) => r.id === focusId) : undefined;
  const rest = focus ? rows.filter((r) => r.id !== focusId) : rows;

  return (
    <div className="anc">
      {header}

      {/* Filtered → the focus row pinned at the top (regardless of rank). */}
      {focus && (
        <div className="anc-focus" style={{ ["--mg" as string]: focus.hue ?? "var(--primary)" }}>
          <div className="anc-focus-top">
            <span className="anc-focus-name">
              <span className="anc-dot" style={{ background: focus.hue ?? "var(--primary)" }} />
              {focus.label}
            </span>
            <span className="anc-focus-fee">
              <b>{fmtDag(exact.perMeta[focus.id]?.fee ?? 0)}</b> DAG
              <span className="anc-sub">fees paid</span>
            </span>
          </div>
          <div className="anc-focus-bar">
            {bar(focus.n, focus.hue)}
            <span className="anc-focus-meta">{focus.n} snapshot{focus.n === 1 ? "" : "s"} · {pct(focus.n).toFixed(pct(focus.n) < 10 ? 1 : 0)}%</span>
          </div>
        </div>
      )}

      {/* The ranked list (dimmed under "Other metagraphs" when a focus row is present). */}
      {focus && rest.length > 0 && <div className="anc-other-label">Other metagraphs</div>}
      <div className={"anc-list" + (focus ? " anc-list--dim" : "")}>
        {rest.map((r) => (
          <div className={"anc-row" + (r.hue ? "" : " anc-row--unlisted")} key={r.id}>
            <span className="anc-dot" style={{ background: r.hue ?? "var(--muted)" }} />
            <span className="anc-label">{r.label}</span>
            {bar(r.n, r.hue)}
            <span className="anc-count">{r.n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the breakdown styles**

`app/styles/05-inspector-metagraph-context-pane.css`:
```css
/* Anchored block — header + ranked share-of-total breakdown + filtered focus row */
.anc { margin-top: 4px; }
.anc-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.anc-head-total { font-size: 15px; color: var(--text); }
.anc-head-total b { font-weight: 700; }
.anc-head-sub { font-size: 12px; color: var(--muted); }
.anc-reading { font-size: 12px; color: var(--muted); font-style: italic; opacity: 0.7; }

.anc-list { display: flex; flex-direction: column; gap: 6px; }
.anc-list--dim { opacity: 0.6; }
.anc-row { display: grid; grid-template-columns: auto auto 1fr auto; align-items: center; gap: 8px; }
.anc-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.anc-label { font-size: 12.5px; color: var(--text); }
.anc-row--unlisted .anc-label { color: var(--muted); font-style: italic; }
.anc-count { font-size: 12.5px; color: var(--text); font-variant-numeric: tabular-nums; min-width: 2em; text-align: right; }
.anc-bar { display: block; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.06); overflow: hidden; }
.anc-bar-fill { display: block; height: 100%; border-radius: 3px; min-width: 2px; }

/* Focus row (pinned, hue-filled) */
.anc-focus {
  border-radius: 8px; padding: 8px 10px; margin-bottom: 10px;
  background: color-mix(in oklch, var(--mg) 12%, transparent);
  box-shadow: inset 2px 0 0 var(--mg);
}
.anc-focus-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.anc-focus-name { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; color: var(--text); }
.anc-focus-fee { display: flex; flex-direction: column; align-items: flex-end; font-size: 13px; color: var(--text); }
.anc-focus-fee b { font-weight: 700; }
.anc-sub { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.anc-focus-bar { display: flex; align-items: center; gap: 8px; margin-top: 7px; }
.anc-focus-bar .anc-bar { flex: 1; }
.anc-focus-meta { font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.anc-other-label { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); margin: 4px 0 6px; }
```
(Note: the bar fill uses the metagraph **identity hue** — a per-metagraph mark, lane-correct; the count/total/fee stay neutral `--text`.)

- [ ] **Step 3: Typecheck + verify via chrome-devtools MCP**

Run `npx tsc --noEmit` — clean. Then via the MCP: switch to **Snapshots** (auto-follows the live tick → a snapshot card appears). Read: the anchored block shows the header (`N snapshots anchored from M metagraphs`) + a ranked list of `dot · ticker · share-bar · count` sorted desc, bars proportional to share. Then filter a metagraph that anchored into a visible tick (DOM-click the filter + a row) → confirm the **focus row** pins at the top (hue-filled bg, name + `fees paid`, full-width bar + `N snapshots · X%`) and the rest dim under "Other metagraphs". `getComputedStyle`: the count/total are neutral (`--text`); only the dots/bars carry the identity hue. Read the PNGs.

- [ ] **Step 4: Commit**

```bash
git add components/inspector/AnchoredTags.tsx app/styles/05-inspector-metagraph-context-pane.css && \
git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" \
  commit -m "feat(snapshot): ranked share-of-total anchored breakdown + filtered focus row

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: SnapshotCard restructure (◆ · odometer · state · settlement)

**Files:**
- Modify: `components/inspector/cards.tsx` (`SnapshotCard`), `app/styles/05-inspector-metagraph-context-pane.css`

**Interfaces:**
- Consumes: `Odometer` (`@/components/Odometer`), `AnchoredTags` (Task 2), `store.{snapshotExact, latestSnapshot}`, `toDag`/`fmtDag`/`fmtKB` (`@/src/util/format`), `GlobalSnapshot`.
- Produces: the restructured `SnapshotCard`.

- [ ] **Step 1: Restructure `SnapshotCard`**

Replace the `SnapshotCard` function in `cards.tsx`. Add imports at the top of the file: `import Odometer from "@/components/Odometer";` and ensure `fmtDag` is imported from `@/src/util/format` (alongside `toDag`/`hex`/`fmtKB`). New body:
```tsx
export function SnapshotCard({ data: d }: { data: GlobalSnapshot }) {
  const exact = useStore((s) => s.snapshotExact[d.ordinal]);
  const latest = useStore((s) => s.latestSnapshot);
  const awaitingExact = exact == null;
  const anchored = typeof d.metagraphSnapshotCount === "number" ? d.metagraphSnapshotCount : null;
  const isLive = latest != null && d.ordinal === latest.ordinal;

  // Relative recency for an older pick — coarse (freshness, not a ticking clock). Guarded
  // against an unparseable timestamp (→ no age suffix rather than "NaN").
  const ageMs = Date.now() - Date.parse(d.timestamp);
  const rel = Number.isNaN(ageMs)
    ? ""
    : ageMs < 60_000 ? `${Math.max(1, Math.round(ageMs / 1000))}s ago`
    : ageMs < 3_600_000 ? `${Math.round(ageMs / 60_000)}m ago`
    : `${Math.round(ageMs / 3_600_000)}h ago`;

  return (
    <div className="insp-snap">
      {/* Title: ◆ type-marker (cyan = a GLOBAL snapshot) + the ordinal (odometer-rolls live). */}
      <div className="snap-titlerow">
        <span className="snap-title">
          <span className="snap-diamond" aria-hidden>◆</span>
          <Odometer value={d.ordinal} className="snap-ord" />
        </span>
        <span className="snap-state">
          {isLive ? (
            <><span className="snap-live-dot" /> live now</>
          ) : (
            <>◷ {rel}</>
          )}
        </span>
      </div>

      {/* Anchored block (exact share breakdown, or "reading…" until it lands). */}
      <div className="insp-div" />
      <AnchoredTags ordinal={d.ordinal} anchored={anchored} awaiting={awaitingExact} />

      {/* Settlement — the exact fee + measured size + rewards (each an independent fact). */}
      {exact != null && (
        <>
          <div className="insp-div" />
          <div className="snap-settle">
            {exact.totalFee > 0 && (
              <div className="snap-settle-row">
                <span className="snap-settle-label">Fees paid</span>
                <span className="snap-settle-val">
                  <b>{fmtDag(exact.totalFee)}</b> DAG
                  <span className="snap-settle-sub">{fmtKB(exact.totalSizeKB)} settled</span>
                </span>
              </div>
            )}
            {exact.rewardsDatum > 0 && (
              <div className="snap-settle-row">
                <span className="snap-settle-label">Rewards out</span>
                <span className="snap-settle-val"><b>{fmtDag(exact.rewardsDatum)}</b> DAG</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
```
(The `Snapshot ‹ <ticker>` breadcrumb eyebrow is already supplied by the Phase-3 `Inspector`; the old `Height · sub-height` / `Blocks` rows and the `Global L0` text are dropped per the spec.)

- [ ] **Step 2: Add the snapshot-card styles**

```css
.snap-titlerow { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding-right: 22px; }
.snap-title { display: inline-flex; align-items: baseline; gap: 8px; }
.snap-diamond { color: var(--primary); font-size: 12px; }
.snap-ord { font-size: 20px; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }
.snap-state { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); white-space: nowrap; }
.snap-live-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--primary); box-shadow: 0 0 0 3px color-mix(in oklch, var(--primary) 30%, transparent); animation: breathe 1.5s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .snap-live-dot { animation: none; } }
.snap-settle { display: flex; flex-direction: column; gap: 8px; }
.snap-settle-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.snap-settle-label { font-size: 12.5px; color: var(--muted); }
.snap-settle-val { display: flex; flex-direction: column; align-items: flex-end; font-size: 13px; color: var(--text); font-variant-numeric: tabular-nums; }
.snap-settle-val b { font-weight: 700; }
.snap-settle-sub { font-size: 10.5px; color: var(--muted); }
```

- [ ] **Step 3: Typecheck + verify via chrome-devtools MCP**

Run `npx tsc --noEmit` — clean. Then via the MCP: switch to **Snapshots**. Read the live card: `◆ <ordinal>` (big neutral mono, the ◆ cyan) + `● live now` (pulsing cyan dot) on the title row; the anchored block; the settlement (`Fees paid <n> DAG` + `<n> KB settled` sub-note; `Rewards out <n> DAG` **only if** rewardsDatum > 0). `click` an older LiveStrip bar → the state line becomes `◷ Xm ago` and the ordinal is static. `getComputedStyle`: the ordinal + fees are neutral (`--text`); only the ◆ + live dot are cyan (`--primary`); no fee/number is green/gold. Confirm no `Global L0` / `Height` text remains. Read the PNGs.

- [ ] **Step 4: Commit**

```bash
git add components/inspector/cards.tsx app/styles/05-inspector-metagraph-context-pane.css && \
git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" \
  commit -m "feat(snapshot): ◆-marker + odometer ordinal + state line + settlement (fees/KB/rewards)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Cleanup + final verification

**Files:**
- Modify: `app/styles/05-inspector-metagraph-context-pane.css`, `components/inspector/cards.tsx` (drop unused imports)

- [ ] **Step 1: Confirm the old snapshot-pill + dropped-row markup is gone**

Run:
```bash
cd /home/alexander/Workspace/dag-visualizer
grep -rnE "mg-tag|insp-mgs" components src | grep -v "app/styles/" || echo "no mg-tag/insp-mgs markup"
grep -rnE "Height · sub-height|Global L0" components | grep -v "js/" || echo "no dropped rows in the card"
```
Expected: `no mg-tag/insp-mgs markup` (the old `AnchoredTags` pills are gone) and no `Height · sub-height` in the SnapshotCard. If any remain, resolve.

- [ ] **Step 2: Prune the dead CSS + unused imports**

Remove the now-unused `.mg-tag`, `.mg-tag--sel`, `.mg-tag--dim`, `.mg-tag--other`, `.mg-tag--settling`, `.insp-mgs`, `.insp-mgs-label`, `.insp-mgs-count`, `.insp-mgs-tags` rules from `05-inspector-metagraph-context-pane.css` (their markup is gone). Keep anything still referenced (grep to confirm). In `cards.tsx`, drop any imports the restructured `SnapshotCard` no longer uses (e.g. `shortHash`/`CORE_HEX` if now unused — `tsc`/lint will flag; note `GeoLiveNode`/`MetaCard` still use `hex`, `shortHash`, `CORE_HEX`).

- [ ] **Step 3: Full typecheck + tests**

Run `npx tsc --noEmit` (clean) and `npm test` (all green — no new tests this phase, but the suite must still pass).

- [ ] **Step 4: Final regression via chrome-devtools MCP**

Reload `:3000`, switch to Snapshots. Read: (a) the **live** card (◆ + ordinal + `live now` + anchored breakdown + settlement), (b) an **older** pick (`◷ Xm ago`), (c) a **filtered** state (the focus row pinned + "Other metagraphs" dimmed; thread/eyebrow re-tinted). Confirm the **number-colour rule** (ordinal/fees/counts neutral; cyan only on ◆/live dot; identity hue only on the per-metagraph dots/bars) and that nothing looks unstyled after the pill CSS prune. Read the PNGs.

- [ ] **Step 5: Commit**

```bash
git add -A && git -c user.name="digitaltwinnn" -c user.email="digitaltwinnn@users.noreply.github.com" \
  commit -m "chore(snapshot): prune old anchored-pill CSS + unused imports

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Done-when (Phase 4b acceptance)

- `npx tsc --noEmit` clean; `npm test` passes.
- The **snapshot card** shows: a `◆ <ordinal>` title (◆ cyan type-marker, ordinal neutral mono that **odometer-rolls** live) + a state line (`● live now` pulsing cyan for the live tick / `◷ Xm ago` for an older pick); a **ranked share-of-total** anchored breakdown (header `N snapshots anchored from M metagraphs`; `dot · ticker · share-bar · count` rows sorted desc, all listed + a neutral `unlisted` row; bars = share); and a **settlement** block (`Fees paid <n> DAG` + `<n> KB settled` sub-note; `Rewards out <n> DAG` only when verified > 0).
- **Filtered → a focus row** pins at the top (hue-filled, name + `fees paid`, full-width bar + `N snapshots · X%`), the rest dimmed under "Other metagraphs"; totals unchanged.
- **Number-colour rule holds:** ordinal/fees/rewards/counts neutral; cyan only on the ◆ + live dot; identity hue only on the per-metagraph dots/bars. The old `Global L0` text, `Height · sub-height`, block count, and colour-pill wall are gone; the old `.mg-tag*`/`.insp-mgs*` CSS is pruned.
- Rewards are shown **only when the raw `value.rewards` was verified present + sane** (else the row is omitted, `rewardsDatum` 0 — never a fabricated number).

## Follow-ups (later)

- The metagraph-snapshot **type-marker** (a per-metagraph mini-logo replacing ◆) when metagraph snapshots become clickable.
- The **constellation-shimmer** ACQUIRING treatment (from the empty-states spec) in place of the plain "reading…".
- The **scene tie-in** synced-glow (card ↔ ledger block) — its own spec.
- Fold the snapshot-card tokens (bars, focus row, settlement rows) into the shared Instrument-Glass token pass.
- (Phase-4 carryover) fold the dossier token-string decision into `metaToken`; the double node-pass per dossier render.
