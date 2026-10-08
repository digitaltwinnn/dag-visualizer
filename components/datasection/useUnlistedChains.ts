"use client";
import { useEffect, useState } from "react";
import { netUrl } from "@/src/net/current";

// The UNLISTED chains' addresses (`/api/network/unlisted` — the explorer's own list less every
// tracked address), read when the anchor log's Unlisted lens first opens.
//
// `chains` is null until it lands. `failed` says the list could not be read (the explorer's
// `/currency` has been seen down on integrationnet and testnet) — then the log falls back to the
// live window of unlisted rows rather than merging nothing and waiting forever (the branch
// review, 2026-10-08). A failure is NOT cached: the next opening asks again.
let cache: string[] | null = null;
let inflight: Promise<string[] | null> | null = null;

export function useUnlistedChains(on: boolean): { chains: string[] | null; failed: boolean } {
  const [chains, setChains] = useState<string[] | null>(cache);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!on) return;
    // A list that landed while this lens was away still has to reach this component's state.
    if (cache) { setChains(cache); return; }
    inflight ??= fetch(netUrl("/api/network/unlisted"))
      .then((r) => (r.ok ? (r.json() as Promise<{ chains?: string[] }>) : null))
      .then((j) => (j?.chains ? (cache = j.chains) : null))
      .catch(() => null)
      .finally(() => { inflight = null; });
    let alive = true;
    inflight.then((c) => {
      if (!alive) return;
      if (c) { setChains(c); setFailed(false); } else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [on]);
  return { chains, failed };
}
