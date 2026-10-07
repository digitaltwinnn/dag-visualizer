# src/net — working notes

Network selection (?net=).

Split out of the root `CLAUDE.md` (2026-08-31) so it loads when you work here rather
than on every session. The root file holds what this is, the twelve rules, run & test,
the architecture map and the dev workflow; **its rules govern this file too**.

## The three networks

**The Constellation network is a PAGE PARAMETER, not state** — `?net=integrationnet` /
`?net=testnet` select a dev network; the bare URL is mainnet, byte-identical in CSS, `/api/*`
URLs and palette to the single-network app. `src/net/` is the one resolver home: `parse.ts` the
validator (query string ONLY, never the hash), `current.ts` the client side (frozen at first
import; Node/vitest/SSR always resolve mainnet, which is what keeps the suite green),
`request.ts` the per-request server side. `config.ts` carries `NETWORKS` (hosts) and `CATALOG`
(one metagraph list per network); `METAGRAPHS` is imported from `src/net/current`, never config.
Every client `/api/` fetch rides `netUrl()` — `src/net/netUrlBoundary.test.ts` is the fence —
and every server route resolves `netOf(req)` and keys its `unstable_cache` entries with the net.
The accent is CSS alone: `--net-*` tokens in `:root`, two `[data-net]` overrides re-pointing
`--primary`/`--ring`, stamped on `<html>` before first paint by layout.tsx's inline script
(mainnet gets no rule). The NetworkSwitch is the bar's rightmost control (the strip's second
row on phone). ⚠️ Anything network-dependent that SSR renders must start as mainnet and swap
in a mount effect (NetLink, NetworkSwitch): a hydration mismatch makes React 19 regenerate the
tree, which strips the `data-net` stamp — and `suppressHydrationWarning` is not the tool, it
KEEPS the server value.

## A network can change its address — the lineage

A metagraph's id IS its state-channel address, and a metagraph can be RE-REGISTERED under a new
one (BioFi: first chain 2026-07-17 → 08-16, new chain from 2026-09-18). The catalog row carries
the current `id` and lists the earlier addresses in `formerIds`; **`src/net/lineage.ts` is the one
home** that turns that into answers, and its test is the specification:

- **Lookup** — `metagraphById`, `LISTED_IDS` and the click table's `netKeyOf` resolve a former
  address to its network, so an old-chain row is never "unlisted".
- **History** — the trends store keeps each chain under the address it was measured at;
  `foldLineage` merges the former addresses' series into the current one's ON THE READ PATH
  (`app/api/trends/assemble.ts`), so every chart shows the network's whole life. The 15-minute
  sampler tracks current ids only (a retired chain produces nothing); `scripts/rebuild-trends.ts`
  walks `lineageIds`, so a rebuild keeps the retired chains' days.
- **Server routes** — the exact-read decode and the per-chain snapshot route accept former
  addresses.

When the live directory lists an id the catalog lacks, the Engine warns once in dev. If that id
is an existing network re-registered: move the old id into `formerIds`, set the new `id`, and
re-key `data/brand-hues.json`.

**The raw anchor log pages every chain of the lineage** (`components/datasection/AnchorLogTable.tsx`,
2026-10-02). Ordinals are PER CHAIN — a re-registered network starts again at 1 — so the chains are
never spliced into one list: under a committed filter with former addresses the toolbar carries a
chain picker ("Current chain · from …" / "Earlier chain · from …") and the table pages ONE address
at a time (`histAddr`). The search crosses chains by itself where the criterion can say which
chain: a DATE picks the chain whose genesis precedes it, a GLOBAL snapshot the chain whose address
anchored into it. A metagraph ORDINAL cannot (both chains have a #2), so it searches the chain on
screen. ⚠️ A chain switch re-reads the tip, and a pending seek must wait for it (`walkReady`) —
run against the previous chain's `latest` it pages to the wrong place.

## A network is retired, never deleted (2026-10-07)

User: "inactive networks like SWAP and PACA will be removed … how can we ensure that we can still
view these networks in trend view history etc and keep their colors". The catalog row is what gives
a network its name, ticker, colour and History row, and the trends store keeps its measured past
forever — delete the row and that past becomes a raw address nothing shows.

**To retire a network, add `retiredAt: "YYYY-MM-DD"` to its catalog row — nothing else.** Then:

- it stops being READ: the trends sampler (`lineage.sampledIds`) and the live poll (`activeRows`)
  skip it;
- History keeps its row and its plane; where it measured nothing in the span its figure says
  "retired" instead of a dash, and the row's hover gives the date;
- the raw log under All still pages its chain (the merged log reads the CATALOG's chains, former
  addresses included), and the search's network picker lists it as "TICKER (retired)";
- `scripts/bake-brand-hues.ts` carries its existing colour pin over even though the live directory
  no longer lists it;
- the live views (filter strip, Hypergraph, Geography) drop it on their own — they show what runs.

`src/net/catalogKeeps.test.ts` lists every address the catalog has ever held and fails if one
disappears. A new network or a re-registration adds its address there in the same change.
