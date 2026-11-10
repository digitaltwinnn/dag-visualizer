# src/net — working notes

A metagraph's address lineage and its retirement.

Split out of the root `CLAUDE.md` (2026-08-31) so it loads when you work here rather
than on every session. The root file holds what this is, the twelve rules, run & test,
the architecture map and the dev workflow; **its rules govern this file too**.

The app reads the Constellation MAINNET alone: one host set (`HOSTS`) and one metagraph catalog
(`METAGRAPHS`), both in `src/engine/config.ts`, the catalog's one home. What lives here is how a
catalog row stays one network across a re-registration (`lineage.ts`) and how a network that
stopped keeps its row (`retire.ts`). The shared store's keys embed a fixed `mainnet` segment
(`STORE_NS`, `app/api/trends/keys.ts` — see `app/api/CLAUDE.md`).

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
  walks `lineageIds`, so a fill or a rebuild keeps the retired chains' days.
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

**Retirement normally happens in the brand bake** (`scripts/bake-brand-hues.ts`, user 2026-10-07:
"can it be done when we bake/rebake the network?"). For each catalog network the bake asks two
questions — is it still in the live directory, and when did its chain last anchor — and retires it
only when BOTH say so: gone from the directory AND silent for a week (`src/net/retire.ts`). The date
is the chain's LAST snapshot. It is written to `data/retired.json` (added to, never removed from),
printed, and reviewed in the diff like the colours. Either fact alone is printed under "LOOK AT
THESE" and changes nothing — a flaky directory read can never retire a network. A person can also
retire one by hand with `retiredAt: "YYYY-MM-DD"` on its catalog row; `lineage.retiredAtOf` reads
both. Then:

- it stops being READ: the trends sampler (`lineage.sampledIds`) and the live poll (`activeRows`)
  skip it;
- History keeps its row and its plane; where it measured nothing in the span its figure says
  "retired" instead of a dash, and the row's hover gives the date;
- the raw log under All still pages its chain (the merged log reads the catalog's chains, former
  addresses included), and the search's network picker lists it as "TICKER (retired)";
- `scripts/bake-brand-hues.ts` carries its existing colour pin over even though the live directory
  no longer lists it;
- the live views (filter strip, Hypergraph, Geography) drop it on their own — they show what runs.

`src/net/catalogKeeps.test.ts` lists every address the catalog has ever held and fails if one
disappears. A new network or a re-registration adds its address there in the same change.
