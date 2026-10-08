"use client";
import { useEffect, useState } from "react";
import { netUrl } from "@/src/net/current";

// The UNLISTED chains' addresses (`/api/network/unlisted` — the explorer's own list less every
// tracked address), read once per session when the anchor log's Unlisted lens first opens. Null
// until it lands; an unreachable route answers an empty list, so the log says "no snapshots"
// rather than waiting forever.
let cache: string[] | null = null;
let inflight: Promise<string[]> | null = null;

export function useUnlistedChains(on: boolean): string[] | null {
  const [chains, setChains] = useState<string[] | null>(cache);
  useEffect(() => {
    if (!on || cache) return;
    inflight ??= fetch(netUrl("/api/network/unlisted"))
      .then((r) => (r.ok ? (r.json() as Promise<{ chains?: string[] }>) : { chains: [] }))
      .then((j) => (cache = j.chains ?? []))
      .catch(() => (cache = []));
    let alive = true;
    inflight.then((c) => alive && setChains(c));
    return () => {
      alive = false;
    };
  }, [on]);
  return chains;
}
