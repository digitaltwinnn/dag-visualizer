# About-View Card System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put one consistent, collapse-by-default "About this view" card at the top of the left rail in **every** view (hyper, geo, ledger, status, transactions, staking).

**Architecture:** The existing `PlaceholderPanel` already IS this card (title/eyebrow/lines/caption + `PanelHead` collapse). Rename it to `AboutView`, flip its default `collapsed` state to `true`, replace `LeftColumn`'s placeholder-only `PLACEHOLDERS` map with a six-view `ABOUT` map (adding geo + ledger copy), and render `<AboutView {...ABOUT[mode]} />` at the top of the rail content for every view, above the existing tool cards. No new styling, no responsive changes.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Zustand, plain CSS (existing rail tokens), chrome-devtools MCP for visual verification.

## Global Constraints

- **Collapsed by default in every view:** the `AboutView` card's initial `collapsed` state is `true` (header strip only; expand to read).
- **Header convention:** eyebrow = `<View> · about`; title = the view's name. (Consistent with the `<View> · <role>` eyebrow pattern used across the rail.)
- **Caption:** placeholder views (status/transactions/staking) carry a `SOON` caption; built views (hyper/geo/ledger) carry no caption.
- **Placement:** the About card is the FIRST child of the left-rail `content` for every view; the tool cards (`GeoExplore` for geo, `LedgerPanel` for ledger) render BELOW it.
- **Reuse, don't restyle:** the card uses the existing `panel` + `PanelHead` + `prose-body` shell — no new CSS.
- **No responsive changes:** `LeftColumn`'s desktop/tablet/phone branches already wrap `content`; the About card flows through them unchanged.
- **Copy:** hyper/status/transactions/staking copy moves verbatim from today's `PLACEHOLDERS`; geo + ledger copy is the exact text in the spec (`docs/superpowers/specs/2026-07-03-about-view-card-design.md`).
- **Dev-server discipline:** ONE shared `next dev` at localhost:3000; reuse it, never start/stop it. Verify visually via chrome-devtools MCP.

---

### Task 1: AboutView card on the left rail for every view

**Files:**
- Rename: `components/PlaceholderPanel.tsx` → `components/AboutView.tsx` (flip default `collapsed` to `true`; rename the component)
- Modify: `components/LeftColumn.tsx` (import `AboutView`; replace `PLACEHOLDERS` with the six-view `ABOUT` map; render `<AboutView {...ABOUT[mode]} />` atop `content`)

**Interfaces:**
- Consumes: `Mode` from `@/src/store/store` (the six modes: `hyper`/`geo`/`ledger`/`status`/`transactions`/`staking`); `PanelHead` (unchanged).
- Produces: `AboutView(props: { title: string; eyebrow: string; lines: string[]; caption?: string })` — default export of `components/AboutView.tsx`.

- [ ] **Step 1: Rename the component file and flip the default collapsed state**

`git mv components/PlaceholderPanel.tsx components/AboutView.tsx`, then edit `components/AboutView.tsx` so the whole file reads:

```tsx
"use client";

import { useState } from "react";
import PanelHead from "@/components/PanelHead";

// The left-rail "About this view" orientation card, shown at the top of the rail in every view.
// Same shell as the tool panels so the four-zone HUD stays consistent. Collapsed by default (a
// single PanelHead strip) — the view's scene/tool is the star; expand to read the orientation.
export default function AboutView({
  title,
  eyebrow,
  lines,
  caption = "",
}: {
  title: string;
  eyebrow: string;
  lines: string[];
  caption?: string;
}) {
  const [collapsed, setCollapsed] = useState(true);
  return (
    <aside className={"panel" + (collapsed ? " collapsed" : "")}>
      <PanelHead
        title={title}
        eyebrow={eyebrow}
        caption={caption || undefined}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      />
      <div className="prose-body panel-body">
        {lines.map((l, i) => (
          <p key={i} className={i > 0 ? "prose-dim" : undefined}>
            {l}
          </p>
        ))}
      </div>
    </aside>
  );
}
```

(Only two changes vs the old `PlaceholderPanel`: the component name, and `useState(false)` → `useState(true)`.)

- [ ] **Step 2: Update `LeftColumn.tsx` — import, the six-view ABOUT map, and placement**

In `components/LeftColumn.tsx`:

(a) Change the import line `import PlaceholderPanel from "@/components/PlaceholderPanel";` to:

```tsx
import AboutView from "@/components/AboutView";
```

(b) Replace the entire `PLACEHOLDERS` map (the `const PLACEHOLDERS: Record<string, …> = { … }` block, including its leading comment) with the six-view `ABOUT` map. It keeps the existing hyper/status/transactions/staking copy verbatim and adds geo + ledger:

```tsx
// Per-view "About this view" copy — one orientation card at the top of the left rail in every
// view (collapsed by default). Built views carry no caption; the scaffolded (SOON) views do.
const ABOUT: Record<string, { title: string; eyebrow: string; lines: string[]; caption?: string }> = {
  hyper: {
    title: "Hypergraph",
    eyebrow: "Hypergraph · about",
    lines: [
      "Constellation is a Hypergraph, not a blockchain — activity is organized as a DAG, so many parts of the network validate in parallel: horizontally scalable and feeless for users.",
      "The glowing core is the Global L0 (security + settlement); the validator shells around it bundle activity into the global snapshots streaming along the bottom. The orbiting clusters are metagraphs — independent networks that anchor their state into L0 for shared trust.",
    ],
  },
  geo: {
    title: "Geographic footprint",
    eyebrow: "Geography · about",
    lines: [
      "Where the network runs — every validator plotted at its real geolocation, with a density heatmap and travelling-packet connection arcs between them.",
      "Drill into a country to see its nodes; filtering a metagraph narrows the map to that network's footprint.",
    ],
  },
  ledger: {
    title: "Snapshots",
    eyebrow: "Snapshots · about",
    lines: [
      "When the network settles — Global L0 produces a snapshot every few seconds, anchoring the metagraphs' own snapshots into shared trust. The 3D chamber stacks the validation layers top-to-bottom, and each global snapshot forms as its layer settles.",
      "The live snapshot sits centre-stage and trails off to the left as it ages; click any snapshot (here or in the strip below) to inspect its fee, size and per-metagraph breakdown.",
    ],
  },
  status: {
    title: "Network status",
    eyebrow: "Status · about",
    caption: "SOON",
    lines: [
      "Live health of the network — validator uptime, node states (Ready / waiting / offline), and software-version spread across the Global L0 and the metagraphs.",
      "A single at-a-glance read of whether the network is healthy, and where any trouble is.",
    ],
  },
  transactions: {
    title: "Transactions",
    eyebrow: "Transactions · about",
    caption: "SOON",
    lines: [
      "The money flow across the network — $DAG and the metagraphs' own currencies moving between addresses, visualized as it happens.",
      "Look up and trace individual transactions (à la the DAG explorer), and read the network's economic statistics — value moved, active addresses, and more (t.b.d.).",
    ],
  },
  staking: {
    title: "Delegated staking",
    eyebrow: "Staking · about",
    caption: "SOON",
    lines: [
      "Delegated staking across the network — who is staked to which validators, total $DAG delegated, and the rewards flowing back.",
      "How stake (and therefore consensus weight) is distributed, and how that shifts over time.",
    ],
  },
};
```

(c) Replace the `content` definition so the About card is first for every view, with the tool cards below:

```tsx
  const content = (
    <>
      <AboutView {...ABOUT[mode]} />
      {mode === "geo" && <GeoExplore />}
      {mode === "ledger" && <LedgerPanel />}
    </>
  );
```

(This removes the old `const placeholder = PLACEHOLDERS[mode];` line and the `{placeholder && <PlaceholderPanel {...placeholder} />}` render — delete both.)

(d) Update the two now-stale comments in the file: the block comment above the map (already replaced in (b)) and the rail-summary comment near `export default function LeftColumn()` that says "the scaffolded views → a 'coming soon' PlaceholderPanel" — change it to note that every view now leads with an `AboutView` card above its tool (if any).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean (no dangling `PlaceholderPanel` / `PLACEHOLDERS` references; `ABOUT[mode]` is indexed by the store `mode` string).

- [ ] **Step 4: Visual verification (all six views, desktop)**

With the shared dev server running, drive the chrome-devtools MCP at `http://localhost:3000`:
- **hyper**: left rail shows a single collapsed **About** strip (eyebrow "Hypergraph · about", title "Hypergraph"), no tool card. Expand it → the two-paragraph Hypergraph copy appears. Collapse again.
- **geo**: a collapsed **About** strip ("Geography · about") sits ABOVE `GeoExplore` ("Nodes by country"). Expand → geo copy.
- **ledger** (Snapshots): a collapsed **About** strip ("Snapshots · about") ABOVE `LedgerPanel`.
- **status / transactions / staking**: a collapsed **About** strip with a `SOON` caption, above the center blueprint (unchanged), LiveStrip present.
Confirm each About card is collapsed on first load and expands/collapses via its caret.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(hud): About this view card on the left rail for every view"
```

(Author `digitaltwinnn`; the repo's trailer convention applies.)

---

## Self-Review

- **Spec coverage:** reusable `AboutView` (rename) → Step 1; collapsed-by-default → Step 1 (`useState(true)`); `<View> · about` eyebrow + view-name title → the ABOUT map; caption SOON on placeholders only → the ABOUT map; single ABOUT copy source incl. geo+ledger → Step 2b; placement atop content above tools → Step 2c; no responsive/CSS changes → nothing touches `LeftColumn`'s bp branches or CSS. All spec sections covered.
- **Placeholder scan:** no TBD/TODO; all copy is literal; the one "update the stale comment" step names the exact comment to change.
- **Type consistency:** `AboutView` props `{title, eyebrow, lines, caption?}` match the old `PlaceholderPanel` props and the `ABOUT` map's value shape; `ABOUT` is keyed by `string` (indexed by store `mode`), same pattern as the old `PLACEHOLDERS`.
- **Note for the executor:** this is a single coherent task (the rename breaks the `LeftColumn` import until Step 2 lands, so Steps 1–2 must land together in one commit). No unit tests apply — it's a component/copy change verified visually, per repo convention.
