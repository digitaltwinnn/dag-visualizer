# Multi-Network (mainnet + integrationnet + testnet) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Constellation network a page parameter — `?net=integrationnet` / `?net=testnet` select a dev network with its own catalog, routes, palette and accent; the bare URL stays mainnet, byte-identical.

**Architecture:** One frozen client resolver (`src/net/current.ts`, evaluated once per page) and one per-request server resolver (`src/net/request.ts`) share one validator. `config.ts` goes plural (`NETWORKS`, `CATALOG`); the catalog import moves to the resolver; every client `/api/` fetch rides `netUrl()`; the accent is a CSS `[data-net]` override stamped on `<html>` before first paint. No store key — a switch is a hard reload through real `<a href>` anchors.

**Tech Stack:** Next.js 16 (App Router, Turbopack), TypeScript, vitest, Tailwind v4, Radix Popover.

**Spec:** `docs/superpowers/specs/2026-08-20-multi-network-design.md` — read it first; it carries the locked decisions, live probe data and measured colour tables (marked "do not re-derive").

## Global Constraints

- **Mainnet stays byte-identical**: bare-URL CSS (no `[data-net]` rule for mainnet), `/api/*` URLs (`netUrl` appends nothing on mainnet), palette `ALLOWED` (derived-for-mainnet must equal the historical literal), chamber geometry.
- **Node (vitest, SSR) always resolves mainnet** — no `location` → fallback. This is what keeps the existing suite green.
- **`?net=` reads the query string ONLY, never the hash** (a hash never reaches the server). Do not copy the dev-flag idiom (`search + hash`, Engine.ts:408).
- **The store gains no network key.**
- **Gates per task:** `npx tsc --noEmit && npm test` clean, then commit with trailer `Co-Authored-By: Claude <noreply@anthropic.com>`.
- **Dev-server discipline:** ONE shared `npm run dev`; any engine/scene CLASS edit needs a full page reload, not HMR. Visual checks via the chrome-devtools MCP (JPEG quality ~50 screenshots; prefer script-clicks over a11y snapshots).
- Vocabulary: user-facing copy says **MainNet / IntegrationNet / TestNet** (rows) and **MAIN / INT / TEST** (faces); internal ids are `mainnet` / `integrationnet` / `testnet`.

---

### Task 1: config.ts goes plural

**Files:**
- Modify: `src/engine/config.ts` (whole file is 109 lines; read it first)

**Interfaces:**
- Produces: `type NetworkId`, `interface NetworkDef { be; l0; l1; directory }`, `NETWORKS: Record<NetworkId, NetworkDef>`, `CATALOG: Record<NetworkId, MetaConfig[]>`. Transitional: `METAGRAPHS`/`API_BASE`/`L0_CLUSTER`/`L1_CLUSTER` stay exported, pointed at mainnet (removed in Task 3). `MetaConfig`, `COLORS`, `POLL`, `DEFAULT_META_COLOR` unchanged.

- [ ] **Step 1: Generate the dev catalogs from the live directory**

```bash
for net in integrationnet testnet; do
  echo "  // --- $net ---"
  curl -s "https://production.dagexplorer-api.constellationnetwork.net/$net/metagraphs" | node -e '
    let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
      const j=JSON.parse(s); const list=j.data??j;
      for (const m of list) console.log(`    { name: ${JSON.stringify(m.name)}, ticker: ${JSON.stringify(m.symbol)}, color: DEFAULT_META_COLOR, id: ${JSON.stringify(m.id)}, blurb: ${JSON.stringify(String(m.description??"").split(/(?<=\.)\s/)[0])} },`);
    });'
done
```

If the response shape differs, mirror the parsing already in `app/api/metagraphs/route.ts` (it consumes this same directory). Cross-check counts against the spec's probe: **18 integrationnet, 5 testnet** (integrationnet includes STATS, DED, BLDR, ACY, SWAP, ACX, HALO, HPMX, UP, BioFi, CMC, AUTO, PACA, LEET, INT, NDT, MGT, DOR; testnet SWAP, ACX, ACY, DOR, CTT).

- [ ] **Step 2: Edit config.ts**

Add after the existing header (keep `COLORS`, `DEFAULT_META_COLOR`, `MetaConfig`, `POLL` exactly as they are):

```ts
export type NetworkId = "mainnet" | "integrationnet" | "testnet";

export interface NetworkDef {
  /** Block-explorer API (snapshot reads, node-params) — was API_BASE. */
  be: string;
  /** Global L0 load balancer — cluster info, raw global snapshots. */
  l0: string;
  /** DAG L1 load balancer — cluster info. */
  l1: string;
  /** The DAG Explorer metagraph directory — the ONE host that takes the network in its PATH. */
  directory: string;
}

export const NETWORKS: Record<NetworkId, NetworkDef> = {
  mainnet: {
    be: "https://be-mainnet.constellationnetwork.io",
    l0: "https://l0-lb-mainnet.constellationnetwork.io",
    l1: "https://l1-lb-mainnet.constellationnetwork.io",
    directory: "https://production.dagexplorer-api.constellationnetwork.net/mainnet",
  },
  integrationnet: {
    be: "https://be-integrationnet.constellationnetwork.io",
    l0: "https://l0-lb-integrationnet.constellationnetwork.io",
    l1: "https://l1-lb-integrationnet.constellationnetwork.io",
    directory: "https://production.dagexplorer-api.constellationnetwork.net/integrationnet",
  },
  testnet: {
    be: "https://be-testnet.constellationnetwork.io",
    l0: "https://l0-lb-testnet.constellationnetwork.io",
    l1: "https://l1-lb-testnet.constellationnetwork.io",
    directory: "https://production.dagexplorer-api.constellationnetwork.net/testnet",
  },
};
```

Then replace `export const METAGRAPHS: MetaConfig[] = [ …11 rows… ]` with:

```ts
// One catalog per network. Ids are globally unique across networks (verified 2026-08-20:
// PacaSwap's mainnet and testnet ids differ), so brand-hues.json stays one flat id-keyed
// file. Dev rows carry DEFAULT_META_COLOR as their seed — the SENTINEL for "no seed":
// configPins() skips it (src/palette/identity.ts), so a dev metagraph's hue comes from its
// baked brand pin or the hash fallback, never from 18 rows sharing one green.
export const CATALOG: Record<NetworkId, MetaConfig[]> = {
  mainnet: [
    // …the existing 11 rows, moved verbatim, order preserved…
  ],
  integrationnet: [
    // …the 18 generated rows from Step 1…
  ],
  testnet: [
    // …the 5 generated rows from Step 1…
  ],
};

// TRANSITIONAL — removed in the import-move task: the single-network exports, pointed at
// mainnet so the tree compiles while consumers migrate to src/net/current.
export const METAGRAPHS: MetaConfig[] = CATALOG.mainnet;
export const API_BASE = NETWORKS.mainnet.be;
export const L0_CLUSTER = NETWORKS.mainnet.l0 + "/cluster/info";
export const L1_CLUSTER = NETWORKS.mainnet.l1 + "/cluster/info";
```

Delete the old standalone `API_BASE`/`L0_CLUSTER`/`L1_CLUSTER` literals (lines 11–15). Verify the old `L0_CLUSTER`/`L1_CLUSTER` values ended in `/cluster/info` (they do — config.ts:14-15) so the aliases are value-identical.

- [ ] **Step 3: Gate** — `npx tsc --noEmit && npm test` (everything green: the tree still consumes the transitional aliases).

- [ ] **Step 4: Commit** — `git add src/engine/config.ts && git commit -m "feat(net): plural NETWORKS + CATALOG in config, mainnet aliases transitional"`

---

### Task 2: the resolvers — src/net

**Files:**
- Create: `src/net/parse.ts`, `src/net/current.ts`, `src/net/request.ts`
- Test: `src/net/parse.test.ts`, `src/net/current.test.ts`, `src/net/request.test.ts`

**Interfaces:**
- Consumes: `NetworkId`, `NETWORKS`, `CATALOG`, `MetaConfig`, `NetworkDef` from `@/src/engine/config` (Task 1).
- Produces: `parseNet(search): NetworkId` · `NET: NetworkId` · `NET_DEF: NetworkDef` · `METAGRAPHS: MetaConfig[]` · `netUrlFor(net, path): string` · `netUrl(path): string` · `netOf(req: Request): NetworkId`. Every later task consumes these exact names.

- [ ] **Step 1: Write the failing tests**

`src/net/parse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseNet } from "./parse";

describe("parseNet", () => {
  it("accepts exactly the two dev networks", () => {
    expect(parseNet("?net=integrationnet")).toBe("integrationnet");
    expect(parseNet("?net=testnet")).toBe("testnet");
    expect(parseNet("?stats&net=testnet")).toBe("testnet");
  });
  it("falls back to mainnet on anything else", () => {
    expect(parseNet("")).toBe("mainnet");
    expect(parseNet(null)).toBe("mainnet");
    expect(parseNet("?net=mainnet")).toBe("mainnet");
    expect(parseNet("?net=TESTNET")).toBe("mainnet"); // exact ids only — no case folding
    expect(parseNet("?net=devnet")).toBe("mainnet");
    expect(parseNet("?net=testnetX")).toBe("mainnet");
  });
});
```

`src/net/current.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { NET, NET_DEF, METAGRAPHS, netUrl, netUrlFor } from "./current";
import { CATALOG, NETWORKS } from "@/src/engine/config";

describe("the frozen client resolver under Node", () => {
  it("resolves mainnet (no location) — the invariant the whole test suite leans on", () => {
    expect(NET).toBe("mainnet");
    expect(NET_DEF).toBe(NETWORKS.mainnet);
    expect(METAGRAPHS).toBe(CATALOG.mainnet);
  });
});

describe("netUrl", () => {
  it("appends NOTHING on mainnet — byte-identical URLs preserve CDN and browser cache keys", () => {
    expect(netUrl("/api/metagraphs")).toBe("/api/metagraphs");
    expect(netUrlFor("mainnet", "/api/archive?v=2")).toBe("/api/archive?v=2");
  });
  it("appends ?net= / &net= on dev networks", () => {
    expect(netUrlFor("testnet", "/api/metagraphs")).toBe("/api/metagraphs?net=testnet");
    expect(netUrlFor("integrationnet", "/api/archive?v=2")).toBe("/api/archive?v=2&net=integrationnet");
  });
});
```

`src/net/request.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { netOf } from "./request";

describe("netOf — the per-request server resolver", () => {
  it("reads the same param through the same validator", () => {
    expect(netOf(new Request("http://x/api/geo?net=testnet"))).toBe("testnet");
    expect(netOf(new Request("http://x/api/geo?net=integrationnet"))).toBe("integrationnet");
    expect(netOf(new Request("http://x/api/geo"))).toBe("mainnet");
    expect(netOf(new Request("http://x/api/geo?net=nonsense"))).toBe("mainnet");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/net` → FAIL (modules don't exist).

- [ ] **Step 3: Implement**

`src/net/parse.ts`:

```ts
import type { NetworkId } from "@/src/engine/config";

// THE one ?net= validator. Both resolvers (current.ts on the client, request.ts on the
// server) route through it, and the inline <head> script in app/layout.tsx mirrors this
// list textually (an inline script cannot import). Query string ONLY, never the hash: a
// hash never reaches the server, so a hash-read here would give a client styled for one
// network talking to another network's routes. Exact ids, no case folding, unknowns fall
// back to mainnet.
export function parseNet(search: string | null | undefined): NetworkId {
  const m = /[?&]net=([^&]*)/.exec(search ?? "");
  const v = m?.[1];
  return v === "integrationnet" || v === "testnet" ? v : "mainnet";
}
```

`src/net/current.ts`:

```ts
import { CATALOG, NETWORKS, type MetaConfig, type NetworkDef, type NetworkId } from "@/src/engine/config";
import { parseNet } from "./parse";

// The CLIENT network resolver — evaluated ONCE at first import, then frozen for the page's
// lifetime. The network is a page parameter, not state (the store carries no key for it);
// a switch is a hard reload through the TopBar's NetworkSwitch anchors. Under Node (vitest,
// SSR) there is no `location`, so this resolves mainnet — which keeps every module-scope
// lane derivation and the whole existing test suite identical to the single-network app.
export const NET: NetworkId = parseNet(typeof location === "undefined" ? "" : location.search);
export const NET_DEF: NetworkDef = NETWORKS[NET];
export const METAGRAPHS: MetaConfig[] = CATALOG[NET];

// Every own-server URL goes through here — src/net/netUrlBoundary.test.ts is the fence.
// On mainnet it appends NOTHING, so mainnet URLs stay byte-identical and existing CDN and
// browser cache keys survive. The pure core is split out so the dev-network behaviour is
// testable under Node, where NET is always mainnet.
export function netUrlFor(net: NetworkId, path: string): string {
  if (net === "mainnet") return path;
  return path + (path.includes("?") ? "&" : "?") + "net=" + net;
}
export function netUrl(path: string): string {
  return netUrlFor(NET, path);
}
```

`src/net/request.ts`:

```ts
import type { NetworkId } from "@/src/engine/config";
import { parseNet } from "./parse";

// The SERVER network resolver: per request, same validator, same fallback as the client.
export function netOf(req: Request): NetworkId {
  return parseNet(new URL(req.url).search);
}
```

- [ ] **Step 4: Run** — `npx vitest run src/net` → PASS. Then the full gate: `npx tsc --noEmit && npm test`.

- [ ] **Step 5: Commit** — `git add src/net && git commit -m "feat(net): client + server network resolvers sharing one validator"`

---

### Task 3: the catalog import moves; the aliases go

**Files:**
- Modify (non-test, `METAGRAPHS` import → `@/src/net/current`): `src/engine/domain/pickActions.ts:19`, `src/engine/domain/ledgerBands.ts:16`, `src/engine/domain/ledgerModel.ts:28`, `src/engine/domain/ledgerLayout.ts:26`, `src/engine/Engine.ts:19`, `src/palette/identity.ts:4`, `src/data/api.ts:5`, `src/data/hoverSubject.ts:3`, `src/engine/scene/views/LedgerView.ts:41`
- Modify (tests, same move): `src/store/followFlow.test.ts:9`, `src/engine/domain/ledgerModel.test.ts:21`, `src/palette/identity.test.ts:3`, `src/engine/domain/ledgerLayout.test.ts:2`, `src/engine/domain/ledgerBands.test.ts:7`, `src/data/unlisted.test.ts:2`, `src/data/ledgerStory.test.ts:3`, `src/engine/domain/pickActions.test.ts:4`
- Modify: `src/engine/config.ts` (delete the four transitional aliases), `src/engine/layerBoundaries.test.ts` (header comment), `src/data/dataExportCoverage.test.ts:52` (comment)

**Interfaces:**
- Consumes: `METAGRAPHS`, `NET_DEF` from `@/src/net/current` (Task 2).
- Produces: `config.ts` no longer exports `METAGRAPHS`/`API_BASE`/`L0_CLUSTER`/`L1_CLUSTER` — every later task reads the catalog and hosts through `src/net`.

- [ ] **Step 1: Move the imports** — mechanical for the pure-`METAGRAPHS` lines:

```bash
grep -rln 'import { METAGRAPHS } from' src components | xargs sed -i \
  -e 's|import { METAGRAPHS } from "@/src/engine/config"|import { METAGRAPHS } from "@/src/net/current"|' \
  -e 's|import { METAGRAPHS } from "../config"|import { METAGRAPHS } from "@/src/net/current"|' \
  -e "s|import { METAGRAPHS } from '../config'|import { METAGRAPHS } from '@/src/net/current'|"
```

Then the combined imports by hand:
- `src/palette/identity.ts:4` and `src/palette/identity.test.ts:3` import `{ METAGRAPHS, COLORS }` together — split: `METAGRAPHS` from `@/src/net/current`, `COLORS` stays from `@/src/engine/config`.
- `src/data/hoverSubject.ts:3` same split (`COLORS` goes entirely in Task 5; leave it for now). Update its line-8 comment "From the plain-constant config, NOT network.ts (browser-only)" to name `src/net/current` — it is equally Node-safe (the `location` read is guarded).
- `src/data/api.ts:5` imports `METAGRAPHS, API_BASE, L0_CLUSTER, L1_CLUSTER, POLL` (and possibly `COLORS`) — becomes `import { METAGRAPHS, NET_DEF } from "@/src/net/current"` plus `import { POLL, COLORS } from "@/src/engine/config"` (keep whatever else it imported from config). Replace the three uses: `API_BASE + path` → `NET_DEF.be + path` (api.ts:144), `L0_CLUSTER` → `NET_DEF.l0 + "/cluster/info"` (:171), `L1_CLUSTER` → `NET_DEF.l1 + "/cluster/info"` (:172).

- [ ] **Step 2: Delete the transitional aliases** from `config.ts`, then hunt stragglers:

```bash
grep -rn "API_BASE\|L0_CLUSTER\|L1_CLUSTER" src components app --include="*.ts" --include="*.tsx" | grep -v "/net/"
grep -rn 'METAGRAPHS } from .*engine/config\|METAGRAPHS } from "../config"' src components app
```

Both must come back empty (config.ts's own definitions aside — which are now gone). If a consumer this plan missed appears, move it the same way.

- [ ] **Step 3: The two comment edits**

`src/engine/layerBoundaries.test.ts` header (lines 5–11) — append one line to the domain description:

```
//              The `Mode` TYPE is allowed via `import type`, and src/net/current is allowed
//              outright: the frozen page-level network resolver is still pure data — the
//              same standing config has (evaluated once, no store, no react, no scene).
```

(No code change: the check is a DENYLIST and `@/src/net/current` matches none of its patterns.)

`src/data/dataExportCoverage.test.ts:52` — the comment mentioning `config.METAGRAPHS` now says "the CATALOG, via src/net/current".

- [ ] **Step 4: Gate** — `npx tsc --noEmit && npm test`. Every existing assertion passes unchanged: under Node `src/net/current` answers mainnet, and every test use is `METAGRAPHS[0].id` ("some listed id") or `METAGRAPHS.length` ("however many lanes").

- [ ] **Step 5: Commit** — `git add -A && git commit -m "refactor(net): catalog + hosts read through src/net/current; config aliases removed"`

---

### Task 4: netUrl through every client fetch, fenced

**Files:**
- Test: Create `src/net/netUrlBoundary.test.ts`
- Modify: `src/engine/Engine.ts:650`, `src/data/geoResolve.ts:13`, `components/datasection/AnchorLogTable.tsx:129,159`, `components/useArchive.ts:176,206,264`, `components/useNodeNames.ts:18`, `components/RawSnapshotBridge.tsx:47,126`

**Interfaces:**
- Consumes: `netUrl(path)` from `@/src/net/current` (Task 2).

- [ ] **Step 1: Write the boundary test** (shape borrowed from `src/data/signerMatchBoundary.test.ts` — walk, strip comments, grep, exempt-with-reason):

```ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// EVERY own-server fetch goes through netUrl() (src/net/current.ts) — the one place the
// ?net= param is appended. A direct fetch("/api/…") behaves identically on mainnet (netUrl
// appends nothing there) and silently talks to MAINNET's routes under ?net=integrationnet /
// ?net=testnet: the page styles itself for one network while plotting another's data. The
// mistake is invisible in every mainnet test and every mainnet browser check, which is why
// it needs a fence rather than a review note.
//
// So: fetch(netUrl("/api/…")), or an exemption here with a reason.
const ROOTS = ["components", "src", "app"];
const EXEMPT: Record<string, string> = {};

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : walk(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("netUrl one-home boundary", () => {
  it("no file fetches an /api/ literal directly — route it through netUrl()", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const rel = file.replace(/\\/g, "/");
        if (rel in EXEMPT) continue;
        if (/fetch\(\s*["'`]\/api\//.test(stripComments(readFileSync(file, "utf8")))) offenders.push(rel);
      }
    }
    expect(
      offenders,
      `call fetch(netUrl("/api/…")) so the ?net= param rides every own-server request — or add an exemption with a reason: ${offenders.join(", ")}`
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/net/netUrlBoundary.test.ts` → FAIL naming the current direct-fetch files (Engine.ts, geoResolve.ts, useArchive.ts, useNodeNames.ts, RawSnapshotBridge.tsx; AnchorLogTable builds its URLs in template literals and may or may not match — convert it regardless in Step 3).

- [ ] **Step 3: Convert the ten sites.** In each file add `import { netUrl } from "@/src/net/current";` and wrap the path:

```ts
fetch(netUrl("/api/metagraphs"))                                        // Engine.ts:650
fetch(netUrl("/api/geo"))                                               // geoResolve.ts:13
fetch(netUrl(`/api/network/${histNet}/snapshots${page === 1 ? "" : `?before=${before}`}`))  // AnchorLogTable:129
fetch(netUrl(`/api/global/at?ts=${encodeURIComponent(r.ts)}`))          // AnchorLogTable:159
fetch(netUrl("/api/archive?v=2"))                                       // useArchive:176
fetch(netUrl(`/api/network/${address}/chain?v=3`))                      // useArchive:206
fetch(netUrl(`/api/network/${metaId}/snapshots/${ordinal}`))            // useArchive:264
fetch(netUrl("/api/node-names"))                                        // useNodeNames:18
fetch(netUrl(`/api/snapshot/${ordinal}`))                               // RawSnapshotBridge:47
fetch(netUrl(`/api/snapshot/${deepSel.globalOrdinal}/channel/${deepSel.metaId}?snap=${deepSel.ordinal}`))  // RawSnapshotBridge:126
```

Preserve each call's existing second argument (signal, options) untouched.

- [ ] **Step 4: Run** — boundary test PASS, then the full gate.

- [ ] **Step 5: Commit** — `git commit -am "feat(net): every client /api fetch rides netUrl, with a boundary test"`

---

### Task 5: Amendment 2 — the accent leaves JS

**Files:**
- Modify: `src/data/hoverSubject.ts:3,9`, `src/data/hoverSubject.test.ts`, `components/RailThread.tsx:5-6,88-95,269,286,291,295,296`, `src/data/network.ts:15` (delete `CORE_HEX`), `src/data/unlisted.ts:39` (delete `UNLISTED_HUD_HEX`), `src/data/signerMatchBoundary.test.ts` (drop the stale exemption), `src/engine/Engine.ts:311-322` (drift-warning gate), plus any test references to the two deleted exports.

- [ ] **Step 1: Edit hoverSubject.test.ts first (TDD).** Replace the `CORE` derivation and its two-line comment:

```ts
// The identity colour for every NON-metagraph subject is the token itself, `var(--primary)` —
// resolved by CSS at render time (Tooltip renders it as a `color` style property), never by
// JS, so there is nothing to keep in sync with the network's accent override.
const CORE = "var(--primary)";
```

Drop the now-unused `COLORS` import. The three `CORE` assertions (DOR ≠ CORE, snapshot, core) stand unchanged; the DOR case's `toMatch(/^#[0-9a-f]{6}$/)` also stands (that value is `identityHudHex`, untouched).

- [ ] **Step 2: Run** — `npx vitest run src/data/hoverSubject.test.ts` → FAIL (module still emits the resolved hex).

- [ ] **Step 3: Edit hoverSubject.ts** — line 9 becomes `const CORE = "var(--primary)";` with the same rewritten comment; drop the `COLORS` import (and the `hex` import if `CORE` was its only use — check with grep inside the file). Run the test → PASS.

- [ ] **Step 4: RailThread goes currentColor.** First make the fence bite: delete the `"components/RailThread.tsx"` entry from `src/data/signerMatchBoundary.test.ts`'s `EXEMPT` (its stated reason — the `var(` prefix sniff — is about to be deleted). Run it → FAIL while the ternary still exists. Then in `components/RailThread.tsx`:
  - Lines 88–95: the sniff collapses to `const accent = filterAccent(filter);` (a `var()` is now fine — CSS resolves it through `currentColor`). Remove the `CORE_HEX` and `UNLISTED_HUD_HEX` imports (lines 5–6 keep `filterAccent` and `UNLISTED_ID` if still used elsewhere in the file — grep inside it).
  - Set the colour once on the SVG element: `style={{ color: accent }}` (on the `<svg>` itself; every SVG presentation attribute below inherits it).
  - The five accent sites — 269, 286, 291 (`stroke`), 295, 296 (`fill`) — become `"currentColor"`.
  - Line 317's `["--spine"]: accent` stays (a custom property resolves `var()` fine).
  - The ruler literals (`TICK_LINE`, `TICK_MINOR`, `TICK_MAJOR`, the `#0c1020` ring) are STRUCTURAL, not accent — untouched, and their rule-3 allowlist entries stay.
  - Run signerMatchBoundary → PASS.

- [ ] **Step 5: Delete the two dead exports.** `CORE_HEX` (`src/data/network.ts:15`) and `UNLISTED_HUD_HEX` (`src/data/unlisted.ts:39`). Then:

```bash
grep -rn "CORE_HEX\|UNLISTED_HUD_HEX" src components app
```

Expected survivors: only `src/palette/identity.ts:28`'s PRIVATE `const CORE_HEX` (a different const — stays). If `src/data/unlisted.test.ts` or `network.test.ts` reference the deleted exports (rule 4 required them to), delete those references too.

- [ ] **Step 6: Gate the Engine drift warning.** At `src/engine/Engine.ts:311-322` the dev warning compares `COLORS` against live tokens. With `--primary` overridden per network it would fire spuriously — skip the `core` comparison unless mainnet (import `NET` from `@/src/net/current`):

```ts
// The mirror mirrors :root — under a dev network the [data-net] override re-points
// --primary ON PURPOSE, so only mainnet checks core. dagCore/bg are never overridden.
if (NET === "mainnet" && /* existing core comparison */) { … }
```

Adapt to the block's actual shape; `dagCore` and `bg` stay checked on every network.

- [ ] **Step 7: Full gate**, then a live look (dev server + chrome-devtools MCP): the left/right rail threads render — spine and dots in cyan at rest on mainnet, in DOR's hue after committing the DOR filter, in the muted gray after committing unlisted. If `currentColor` fails in any attribute (it should not — it is a native SVG keyword, the lucide idiom), the pre-approved fallback is an effect-based token read via RailThread's existing measure effect; do NOT reintroduce resolved-hex exports.

- [ ] **Step 8: Commit** — `git commit -am "refactor(accent): tooltip + rail thread ride var(--primary)/currentColor; resolved-hex exports removed"`

---

### Task 6: the [data-net] accent — CSS + first-paint stamp

**Files:**
- Modify: `app/globals.css` (near `--primary`, line ~474), `app/layout.tsx`

- [ ] **Step 1: globals.css.** Inside `:root`, next to `--primary`:

```css
  /* The three network accents — ONE home (design §2). All three are always defined so the
     NetworkSwitch popover can render every network's dot on any network; the [data-net]
     rules below only re-point --primary/--ring. Mainnet gets NO [data-net] rule, so the
     bare URL's rendered CSS stays byte-identical. Chroma 0.13 on all three (matching
     --primary, deliberately below cyan's 0.150 gamut ceiling); lightness differs per hue
     because each hue's in-gamut chroma peaks at a different brightness. Guard-band kin:
     ACCENT_HUE in src/palette/palette.ts mirrors these hues — keep the two in sync. */
  --net-mainnet: oklch(0.88 0.13 195);
  --net-integrationnet: oklch(0.78 0.13 300);
  --net-testnet: oklch(0.84 0.13 327);
```

Immediately after the block that closes `:root` (same layer context — check where `--primary` is defined and place these beside it):

```css
/* Network accent override — stamped on <html> before first paint by the inline script in
   app/layout.tsx. Mainnet has no rule on purpose. */
:root[data-net="integrationnet"] {
  --primary: var(--net-integrationnet);
  --ring: var(--net-integrationnet);
}
:root[data-net="testnet"] {
  --primary: var(--net-testnet);
  --ring: var(--net-testnet);
}
```

`--accent`/`--accent-foreground` already alias `var(--primary)` (globals.css:480-481) and follow automatically. `--primary-foreground` stays for all three (contrast verified in the spec).

- [ ] **Step 2: layout.tsx.** `<html lang="en" suppressHydrationWarning>` (the script mutates `<html>`'s dataset before hydration), and the FIRST child of `<body>`:

```tsx
        {/* Stamp the network on <html> BEFORE anything paints, so the [data-net] accent
            override applies from the first frame. Inline because a layout cannot read
            searchParams and middleware would make every page dynamic; the regex mirrors
            src/net/parse.ts's validator (an inline script cannot import). CSP already
            allows 'unsafe-inline' (next.config.mjs:27). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              '(function(){var m=/[?&]net=(integrationnet|testnet)(?:&|$)/.exec(location.search);if(m)document.documentElement.dataset.net=m[1];})();',
          }}
        />
```

- [ ] **Step 3: Verify live.** `http://localhost:3000/?net=testnet` → magenta accents (live dots, ECG, selection washes) AND the 3D scene's structural cyan replaced (readSceneColors reads `--primary` off the live DOM at boot — no engine change needed); `?net=integrationnet` → violet; bare URL → cyan, and `document.documentElement.dataset.net` is `undefined`. Check the two `[data-net]` rules exist in the browser's CSSOM — if missing, it is the Turbopack stale-CSS trap: kill the server, `rm -rf .next/dev`, restart.

- [ ] **Step 4: Gate** (`tsc` + `npm test` — the five globals.css-reading tests stay green: no gradient token behind `bg-[var()]`, no `text-*`/`rounded-*`/`tracking-*` utility, no breakpoint arm), then commit — `git commit -am "feat(net): per-network accent tokens + first-paint data-net stamp"`

---

### Task 7: the palette goes per-network

**Files:**
- Modify: `src/palette/palette.ts`, `src/palette/palette.test.ts`, `src/palette/identity.ts` (configPins sentinel), `app/api/metagraphs/route.ts:152-158` deferred to Task 8 — here only make `assignPalette` accept the ranges.

**Interfaces:**
- Produces: `ACCENT_HUE: Record<NetworkId, number>`, `guardsFor(net): number[]`, `allowedFor(net): [number, number][]`, `ALLOWED = allowedFor(NET)`, and `assignPalette(ids, pins, allowed = ALLOWED)` (new optional third parameter — Task 8's route passes `allowedFor(net)`).

- [ ] **Step 1: Rewrite the guard-band test first.** In `src/palette/palette.test.ts`, replace the single-network guard-band `it()` (line 23) and add:

```ts
import { CATALOG } from "@/src/engine/config";
import { allowedFor, guardsFor, ALLOWED, SLOT_STEP } from "./palette";

const NETS = ["mainnet", "integrationnet", "testnet"] as const;
const slotCount = (ranges: [number, number][]) =>
  ranges.reduce((n, [a, b]) => n + Math.floor((b - a) / SLOT_STEP) + 1, 0);

it("mainnet's derived ranges equal the historical literal — mainnet hues are byte-identical", () => {
  expect(allowedFor("mainnet")).toEqual([[41, 74], [106, 149], [211, 249], [316, 369]]);
  expect(ALLOWED).toEqual(allowedFor("mainnet")); // Node resolves mainnet
});

it("keeps every slot out of that network's OWN guard bands", () => {
  for (const net of NETS)
    for (const [a, b] of allowedFor(net))
      for (let h = a; h <= b; h += SLOT_STEP)
        for (const g of guardsFor(net)) {
          const hue = h % 360;
          const d = Math.min(Math.abs(hue - g), 360 - Math.abs(hue - g));
          expect(d, `${net}: slot ${h} inside guard ${g}±16`).toBeGreaterThanOrEqual(16);
        }
});

it("slot capacity covers every network's catalog plus the DAG core", () => {
  expect(slotCount(allowedFor("mainnet"))).toBe(23);        // unchanged
  expect(slotCount(allowedFor("integrationnet"))).toBe(27); // violet band pre-existed: pure +4
  expect(slotCount(allowedFor("testnet"))).toBe(24);        // +9 from freeing cyan, −4 to the 327 guard… net +1
  for (const net of NETS)
    expect(slotCount(allowedFor(net))).toBeGreaterThanOrEqual(CATALOG[net].length + 1);
});
```

Keep every other existing `it()` untouched. Run → FAIL (`allowedFor` not exported).

- [ ] **Step 2: Implement in palette.ts.** Replace the `ALLOWED` literal (and its guard-band comment at lines 16–24) with the derivation. `IDENTITY_L/C`, `SLOT_STEP`, `SLOTS` (still computed from `ALLOWED`), `hash32`, `oklchToHex` all stay:

```ts
import { NET } from "@/src/net/current";
import type { NetworkId } from "@/src/engine/config";

// The reserved structural hue centres, ±16° each. Five are guarded on EVERY network
// (red warn 25 · amber 90 · green ready 165 · --core blue 265 · violet 300); the sixth is
// the network's OWN accent — cyan 195 on mainnet, violet 300 on integrationnet (already in
// the base five, so its guard list is just shorter), magenta 327 on testnet. ACCENT_HUE
// mirrors the --net-* tokens in app/globals.css (§2 of the multi-network design): this
// module is Node-safe and cannot read CSS, so keep the two in sync by hand.
const GUARD = 16;
const BASE_GUARDS = [25, 90, 165, 265, 300];
export const ACCENT_HUE: Record<NetworkId, number> = { mainnet: 195, integrationnet: 300, testnet: 327 };

export function guardsFor(net: NetworkId): number[] {
  return [...new Set([...BASE_GUARDS, ACCENT_HUE[net]])].sort((a, b) => a - b);
}

// The allowed identity ranges are DERIVED: the gaps between consecutive guard bands (the
// last one wrapping past 360), dropping any gap narrower than one slot step. Derived-for-
// mainnet is pinned equal to the historical literal by palette.test.ts, so mainnet's hue
// assignments are byte-identical to the single-network app.
export function allowedFor(net: NetworkId): [number, number][] {
  const g = guardsFor(net);
  const out: [number, number][] = [];
  for (let i = 0; i < g.length; i++) {
    const a = g[i] + GUARD;
    const b = (i === g.length - 1 ? g[0] + 360 : g[i + 1]) - GUARD;
    if (b - a >= SLOT_STEP) out.push([a, b]);
  }
  return out;
}
export const ALLOWED: [number, number][] = allowedFor(NET);
```

Then give `assignPalette` an optional ranges parameter, defaulting to the module `ALLOWED`, and use it wherever the function body read `ALLOWED` — signature `assignPalette(ids: string[], pins: …, allowed: [number, number][] = ALLOWED)`. (Task 8's metagraphs route needs it: the route runs server-side where `NET` is always mainnet, so it must pass the REQUEST's ranges or server and client would assign different hues to the same unpinned dev id.)

- [ ] **Step 3: The configPins sentinel.** In `src/palette/identity.ts`, `configPins()` seeds pins from each catalog row's `color`. Dev rows all carry `DEFAULT_META_COLOR` (Task 1's sentinel — 18 rows sharing one pin would collapse integrationnet's identity space onto a single green). Skip it:

```ts
// DEFAULT_META_COLOR is the "no seed" sentinel (dev-network catalog rows carry it): skip,
// so those metagraphs resolve through their baked brand pin or the hash fallback. No
// mainnet row uses it, so mainnet pins are unchanged.
if (m.color === DEFAULT_META_COLOR) continue;
```

(import `DEFAULT_META_COLOR` from config; adapt to the loop's actual shape.)

- [ ] **Step 4: Gate.** `npx vitest run src/palette` → PASS (identity.test.ts's configPins test iterates mainnet rows, none carry the sentinel), then the full gate.

- [ ] **Step 5: Commit** — `git commit -am "feat(palette): per-network guard bands and derived ALLOWED, mainnet pinned byte-identical"`

---

### Task 8: the server routes go per-request

**Files:**
- Modify: `app/api/metagraphs/route.ts`, `app/api/geo/route.ts`, `app/api/node-names/route.ts`, `app/api/snapshot/ordinalWindow.ts`, `app/api/snapshot/fetchGlobal.ts`, `app/api/snapshot/[ordinal]/route.ts`, `app/api/snapshot/[ordinal]/channel/[address]/route.ts`, `app/api/global/at/route.ts`, `app/api/archive/probe.ts`, `app/api/archive/route.ts`, `app/api/network/[address]/snapshots/route.ts`, `app/api/network/[address]/snapshots/[ordinal]/route.ts`, `app/api/network/[address]/chain/route.ts`, existing tests `app/api/snapshot/ordinalWindow.test.ts` + `app/api/archive/probe.test.ts` (signatures gain `net`), `CLAUDE.md` (one line)

**Interfaces:**
- Consumes: `netOf(req)` from `@/src/net/request`, `NETWORKS`, `CATALOG` from config, `allowedFor` + `identityPins` from the palette (Task 7).
- Produces: helpers threaded with `net: NetworkId` as their FIRST parameter — `fetchGlobal(net, ordinal)`, the ordinalWindow entry points gain `(net, …)`, the probe's cached getter gains `(net)`. Tests call them with `"mainnet"`.

- [ ] **Step 1: The pattern, applied per file.** In each route's `GET` (or handler): `const net = netOf(req);` then replace the mainnet host literal with the matching `NETWORKS[net]` field — hostname prefix decides the field: `be-` → `.be`, `l0-lb-` → `.l0`, `l1-lb-` → `.l1`; `app/api/metagraphs/route.ts:23`'s directory URL → `NETWORKS[net].directory`. Helpers that hold a host but no request (`fetchGlobal.ts`, `ordinalWindow.ts`, `probe.ts`) take `net: NetworkId` as their first parameter, passed down from the route's `netOf(req)`; update their existing tests to pass `"mainnet"` and expect identical behaviour.

- [ ] **Step 2: Every `unstable_cache` key gains `net`.** Twelve sites (all listed in the spec §3): append `net` to each key array — e.g. `["snapshot-exact-v3", String(ordinal)]` → `["snapshot-exact-v3", net, String(ordinal)]`; where the cache call has no explicit key array (`metagraphs/route.ts:142`, `node-names/route.ts:23`, `geo/route.ts:30`, `ordinalWindow.ts:35`), give it one that includes `net`. Because `unstable_cache` closes over its function, per-request `net` means building the cached function per net — the clean shape is a module-level `Record<NetworkId, ReturnType<typeof unstable_cache>>` built once (three entries), or a keyed factory with a module-level cache; do NOT call `unstable_cache` inside the handler per request. Revalidate values all stay as they are. Mainnet's keys change too — accepted (one cache re-warm on deploy).

- [ ] **Step 3: Catalog reads.** Any route reading `METAGRAPHS` reads `CATALOG[net]` instead (grep `app/api` for `METAGRAPHS`). In `metagraphs/route.ts`, `withHues` passes the request's ranges: `assignPalette(list.map((m) => m.id), identityPins(), allowedFor(net))`.

- [ ] **Step 4: The three flipped routes get CDN caching.** Reading a search param makes them dynamic (`ƒ`); move caching one layer out with response headers on the success path (503s stay uncached):
  - `metagraphs/route.ts`: `"Cache-Control": "public, s-maxage=300, stale-while-revalidate=600"`
  - `geo/route.ts`: `"Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200"`
  - `node-names/route.ts`: replace its `public, max-age=3600` with `"public, s-maxage=3600, stale-while-revalidate=7200"`
  The CDN caches per URL, so mainnet's hit behaviour is preserved; `unstable_cache` stays underneath. Failure semantics unchanged everywhere: honest 503, transient upstream failures throw and retry, deterministic misses cached like successes.

- [ ] **Step 5: CLAUDE.md.** The phase-boundary line "…`/api/metagraphs` should stay `○` (Static) with `5m` revalidate" becomes: "…`/api/metagraphs` is `ƒ` (Dynamic — it reads `?net=`) and must answer with `Cache-Control: public, s-maxage=300` so the CDN still caches it per URL."

- [ ] **Step 6: Gate + live check.** Full gate; then `curl -s "http://localhost:3000/api/metagraphs?net=testnet" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.metagraphs.length)})'` → 5, and without the param → 11. `npm run build` alongside the dev server (build outputs to `.next`, dev to `.next/dev`): clean, the three routes `ƒ`.

- [ ] **Step 7: Commit** — `git commit -am "feat(net): server routes resolve the network per request; CDN caching per URL"`

---

### Task 9: the bakes go per-network

**Files:**
- Modify: `scripts/bake-brand-hues.ts`, `scripts/bake-ledger-scale.ts:16`, `src/engine/domain/ledgerLayout.ts:191`, `data/brand-hues.json` (regenerated)

**Interfaces:**
- Produces: `BYTE_SCALE_KB_BY_NET: Record<NetworkId, number>` and `BYTE_SCALE_KB = BYTE_SCALE_KB_BY_NET[NET]` from `ledgerLayout.ts` — same export name, so no consumer changes.

- [ ] **Step 1: bake-brand-hues loops the networks.** Its directory fetch (it reads the same explorer directory) iterates all three `NETWORKS[net].directory` URLs and merges results into the ONE flat id-keyed `data/brand-hues.json` (ids are globally unique — no network key). `brand-hue-overrides.json` untouched. Run `npx tsx scripts/bake-brand-hues.ts`; inspect the diff — the 12 existing entries must be UNCHANGED (byte-identical mainnet), with ~20 dev entries added; a dev metagraph without a usable icon simply stays absent (hash fallback).

- [ ] **Step 2: bake-ledger-scale takes the network.** Replace the host literal at :16 with `NETWORKS[net].be` where `net` comes from `process.argv[2]` validated through `parseNet("?net=" + (process.argv[2] ?? ""))`. Run it for both dev networks:

```bash
npx tsx scripts/bake-ledger-scale.ts integrationnet
npx tsx scripts/bake-ledger-scale.ts testnet
```

Each prints its ~p70 anchored-KB/tick. Mind the script header's complete-window sampling trap. If a dev network's window is too sparse to give a stable p70 (testnet may be), fall back to mainnet's 150 and say so in the comment — a floor-ish reference is honest; a fabricated precision is not.

- [ ] **Step 3: ledgerLayout.ts.** Replace line 191:

```ts
// One baked reference per network — scripts/bake-ledger-scale.ts <net>. Mainnet rebaked
// 2026-08-16 at ~p70 of anchored KB/tick (median fills ~57%, ~30% of ticks clip) — the p99
// bake made the median bar a sliver, and the user prefers "more often too filled than too
// small". Dev values baked 2026-08-21 the same way.
export const BYTE_SCALE_KB_BY_NET: Record<NetworkId, number> = {
  mainnet: 150,
  integrationnet: 0, // ← the Step-2 measurement
  testnet: 0,        // ← the Step-2 measurement
};
export const BYTE_SCALE_KB = BYTE_SCALE_KB_BY_NET[NET];
```

(`NET` import already available — ledgerLayout imports from `@/src/net/current` since Task 3; add `NetworkId` type import.) Insert the two measured numbers — never commit the `0` placeholders.

- [ ] **Step 4: Gate** (ledger tests read `BYTE_SCALE_KB` under Node → mainnet's 150, unchanged), commit — `git commit -am "feat(net): brand hues + byte-bar scale baked per network"`

---

### Task 10: TopBar centering — the grid promotion

**Files:**
- Modify: `components/TopBar.tsx:132,137,233,285,289`

- [ ] **Step 1: Promote the phone grid to all widths.** Read the file around each anchor first; the summary-verified class strings:
  - Row (line 132): `"flex items-center gap-3 py-2 px-3.5"` + responsive lines → becomes `"grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-2 px-3.5"`; delete `max-[700px]:grid max-[700px]:grid-cols-[1fr_auto_1fr]` from the phone line (now base); keep every gap/padding step.
  - LEFT zone wrapper (137): `"contents max-[700px]:flex max-[700px]:items-center max-[700px]:gap-1 max-[700px]:min-w-0"` → `"flex items-center gap-3 max-[1260px]:gap-2.5 max-[940px]:gap-2 max-[700px]:gap-1 min-w-0"` (the in-zone gaps move from the row onto the zone — mirror the row's own gap steps).
  - RIGHT zone wrapper (289): `"contents max-[700px]:flex max-[700px]:items-center max-[700px]:gap-1.5 max-[700px]:justify-self-end"` → `"flex items-center gap-3 max-[1260px]:gap-2.5 max-[940px]:gap-2 max-[700px]:gap-1.5 justify-self-end"`.
  - Delete BOTH flex spacers (lines 233 and 285) and their "Flex spacers (tablet/desktop only)" comment; update the phone-grid comments at 131/137/288 — the grid is now the base layout at every width, `1fr` columns own the spacing, and the switch is truly centred while both zones fit (`1fr` is `minmax(auto,1fr)`, so an overgrown zone still pushes it — the dev overflow alarm arbitrates, same as before).

- [ ] **Step 2: Verify live** at 1600 / 1300 / 900 / 700 / 390 px (chrome-devtools MCP, `resize_page` + screenshot): the view switch's centre sits on the bar's centre at every width; the filter strip still opens/closes; the dev console shows no `[TopBar] the command bar overflows` warning.

- [ ] **Step 3: Gate + commit** — `git commit -am "fix(topbar): promote the phone grid to all widths — the switch is centred, not flex-balanced"`

---

### Task 11: the NetworkSwitch control

**Files:**
- Create: `components/topbar/NetworkSwitch.tsx`, `components/NetLink.tsx`
- Modify: `components/TopBar.tsx` (mount + brand link + breakpoints), `components/topbar/PresentationToggle.tsx` (header comment), `app/about/page.tsx` + `app/design/page.tsx` (internal links)

**Interfaces:**
- Consumes: `NET`, `netUrl` from `@/src/net/current`; `Popover`/`PopoverTrigger`/`PopoverContent` from `@/components/ui/popover`; `SELECTED_ROW` (grep for its home first: `grep -rn "SELECTED_ROW" components lib | head`) and `cn` from `@/lib/utils`.

- [ ] **Step 1: NetworkSwitch.**

```tsx
"use client";

import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { NET } from "@/src/net/current";
import type { NetworkId } from "@/src/engine/config";

// The network switch — RIGHTMOST in the command bar: the right edge escalates in scope
// (…vitals → presentation → network), so the bar reads as a valley with the broadest
// framing at both outer edges (brand = what this app is, network = which chain). The face
// is a fixed-width short code (the filter face's own ticker grammar) with NO identity dot —
// each network's accent IS --primary, and the filter's "all" face already renders a dot at
// var(--primary) two zones left; colour rides the word instead (muted on mainnet, the live
// accent on a dev network). A switch is a REAL <a href> hard navigation: the page reloads
// and the boot sequence replays in the new network's accent — that IS the transient switch
// signal. This control never hides at any width — "which chain am I looking at" must not go
// missing; if the bar ever needs another rung, drop the chevron before the word.
const ROWS: { id: NetworkId; code: string; name: string; href: string }[] = [
  { id: "mainnet", code: "MAIN", name: "MainNet", href: "/" },
  { id: "integrationnet", code: "INT", name: "IntegrationNet", href: "/?net=integrationnet" },
  { id: "testnet", code: "TEST", name: "TestNet", href: "/?net=testnet" },
];

export default function NetworkSwitch() {
  const cur = ROWS.find((r) => r.id === NET)!;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Network: ${cur.name} — switch network`}
          className={cn(
            "group flex items-center gap-1.5 h-9 py-1.5 px-2.5 rounded-btn! flex-none",
            "bg-transparent border-0 hover:bg-wash-soft pointer-coarse:min-h-11",
            NET === "mainnet" ? "text-muted-foreground hover:text-foreground" : "text-[var(--primary)]"
          )}
        >
          <span className="text-micro tracking-caps uppercase">{cur.code}</span>
          <ChevronDown className="size-3.5 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-56 p-1.5">
        {ROWS.map((r) => (
          <a
            key={r.id}
            href={r.href}
            aria-current={r.id === NET ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-label",
              "text-muted-foreground hover:text-foreground hover:bg-wash-soft",
              r.id === NET && SELECTED_ROW
            )}
          >
            {/* Each network's own accent token — defined in :root ALWAYS, exactly so this
                popover can name all three on any network. */}
            <span aria-hidden className="size-2 rounded-full flex-none" style={{ background: `var(--net-${r.id})` }} />
            <span className="flex-1">{r.name}</span>
            <span className="text-micro tracking-caps uppercase opacity-60">{r.code}</span>
          </a>
        ))}
      </PopoverContent>
    </Popover>
  );
}
```

Adapt the trigger/row class recipes to what PresentationToggle and `SELECTED_ROW` actually use (read both before writing); the row keeps `SELECTED_ROW`'s reserved trailing-check discipline if the constant carries one. Popover stays spineless at rest (no edge recipe).

- [ ] **Step 2: Mount it.** In TopBar's RIGHT zone, after `<PresentationToggle />`: a divider `<span className="w-px self-stretch bg-border my-1 max-[820px]:hidden" />` then `<NetworkSwitch />`. Update PresentationToggle's header sentence "sitting LAST in the bar because it acts on everything to its left" → "sitting last-but-one: the NetworkSwitch to its right acts on everything INCLUDING this toggle — the right edge escalates in scope."

- [ ] **Step 3: Raise the measured breakpoints.** ~93px face + ~9px divider landed in the bar; starting values (then measure with the dev overflow alarm by resizing across each boundary): wordmark `max-[1439px]` → `max-[1530px]`, view labels `max-[1299px]` → `max-[1390px]`, dividers + `soon` views `max-[820px]` → `max-[915px]` (every arm of a boundary moves together — trap 8: same number on both arms; PresentationToggle's label threshold `max-[1559px]` may also need raising — measure). If the alarm still warns anywhere, raise the offending threshold to the measured width plus slack.

- [ ] **Step 4: Phone.** Verify at 360 / 390 / 430: the right zone (PresentationToggle + NetworkSwitch) fits beside the centred 3-view switch, no overflow warning, both controls ≥44px tap targets (`pointer-coarse:min-h-11`). If crowded, the pre-approved fallback is the repo's own move: chevron `max-[700px]:hidden`, code alone. Only if that still overflows: move NetworkSwitch into the filter strip's phone second row beside `<VitalsCluster align="center" />`.

- [ ] **Step 5: Param propagation.** TopBar's brand link `href="/about"` → `href={netUrl("/about")}` (TopBar is a client component). For server-component pages, create `components/NetLink.tsx`:

```tsx
"use client";

import { netUrl } from "@/src/net/current";

// An internal link that carries ?net= through, so navigating to /about or /design on a dev
// network doesn't snap the accent back to mainnet cyan. suppressHydrationWarning: the server
// renders the mainnet href (no location during SSR) and the client corrects it on hydration.
export default function NetLink({ href, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a suppressHydrationWarning {...rest} href={netUrl(href)} />;
}
```

Then `grep -n 'href="/' app/about/page.tsx app/design/page.tsx components/SiteFooter.tsx` and convert every INTERNAL link (to `/`, `/about`, `/design`) to `<NetLink>`; external links untouched.

- [ ] **Step 6: Verify live.** On `?net=integrationnet`: face INT in violet; popover names all three with their own hue dots; the IntegrationNet row wears SELECTED_ROW + `aria-current`; clicking TestNet hard-navigates to `/?net=testnet` and the boot sequence replays in magenta (decision 3(b) — no new chrome); brand → About keeps the violet accent; middle-click a row opens a tab. On the bare URL: face MAIN, muted.

- [ ] **Step 7: Gate + commit** — `git commit -am "feat(net): NetworkSwitch in the command bar; ?net= carried through internal links"`

---

### Task 12: whole-feature verification

**Files:** none created — this task is the final gate. Fix-forward anything it finds (small fixes inline; anything structural goes back to its task).

- [ ] **Step 1: Suites.** `npx tsc --noEmit && npm test` — all green.
- [ ] **Step 2: Prod build.** `npm run build` — clean; `/api/metagraphs`, `/api/geo`, `/api/node-names` are `ƒ`; spot-check `curl -sI` on a started prod build (or trust the route code) for the `s-maxage` headers.
- [ ] **Step 3: Mainnet regression sweep** (bare URL, dev server, chrome-devtools MCP): cyan accent everywhere, no `data-net` attribute, `document.querySelector('#topbar')` shows MAIN muted, hyper/geo/ledger all render, filter → DOR commits, tooltip subject colours correct (cyan core, DOR hue), rail threads correct at rest/filtered.
- [ ] **Step 4: integrationnet** (`?net=integrationnet`): violet boot + accents; 18 hubs in hyper; **the 19-lane chamber at the resting pose** — the one spec-named live check: `lanePlaneHalf` 0.458 is arithmetic, readability is a judgment; screenshot and LOOK (lanes discrete? tickers legible? trays not colliding?). If it reads as mush, report it as a finding — do not silently retune geometry; that is a user decision.
- [ ] **Step 5: testnet** (`?net=testnet`): magenta boot + accents; 5 hubs; geo plots the ~18 nodes; PacaSwap's pink identity dot reads apart from the magenta accent (spec: separation 0.061 > the 0.018 between adjacent chips — verify by eye once).
- [ ] **Step 6: Cross-cutting**: `?net=testnet&slowmo=2` (param coexistence with dev flags), `/about?net=testnet` direct load (accent magenta), the raw layer on a dev network (anchor log pages that network's history through `?net=`-carrying fetches — check the Network tab shows `net=` on every `/api/` request), phone 360/390/430 on all three networks.
- [ ] **Step 7: Docs.** Add a short multi-network paragraph to CLAUDE.md's data section: the `?net=` parameter, `src/net/` as the one resolver home, the netUrl boundary test, mainnet-byte-identical as the standing invariant. Append the outcome to `.superpowers/sdd/progress.md`.
- [ ] **Step 8: Commit** — `git commit -am "docs: multi-network invariants in CLAUDE.md; verification pass complete"`

---

## Self-review notes (already applied)

- **Spec coverage:** §1 → Tasks 1–5; §2 → Tasks 6–7; §3 → Task 8; §4 → Tasks 1, 9; §5 → Tasks 10–11; §6 → Tasks 2, 4, 5, 7 (tests) + 12 (live). The cut `COLORS` mirror test stays cut — no task builds it.
- **Server/client hue drift** (found while planning): `app/api/metagraphs/route.ts` assigns hues server-side where `NET` is always mainnet — hence `assignPalette`'s new `allowed` parameter (Task 7) passed per request (Task 8), or server and client would colour the same unpinned dev id differently.
- **The configPins sentinel** (found while planning): dev catalog rows all seed `DEFAULT_META_COLOR`; without the Task-7 skip, `configPins()` would pin 18 integrationnet metagraphs to one green.
- **The stale signerMatch exemption** (found while planning): RailThread's `EXEMPT` entry describes the `startsWith("var(")` sniff Task 5 deletes — the entry goes with it, and the boundary test becomes Task 5's executable gate.
