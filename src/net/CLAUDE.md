# src/net — working notes

Network selection (?net=).

Split out of the root `CLAUDE.md` (2026-08-31) so it loads when you work here rather
than on every session. The root file holds what this is, the eleven rules, run & test,
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
