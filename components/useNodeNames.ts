"use client";

import { netUrl } from "@/src/net/current";
import { useEffect, useState } from "react";

// The validator-name registry, client side (user, 2026-08-16 — identity enrichment): one fetch
// per page load shared by every consumer via a module cache (the useArchive pattern). Names come
// from the Global L0's delegated-staking registry (/api/node-names), keyed by peerId.
//
// ⚠️ A peer id belongs to a LAYER, not a machine (CLAUDE.md): the registry keys on the L0
// layer's id, so `nodeName` matches against EVERY layer id a node carries (`ids`), the same
// per-layer discipline as the signer matchers — matching the primary alone would miss a hybrid
// whose primary record is another layer.
let cached: Record<string, string> | null = null;
let inflight: Promise<Record<string, string> | null> | null = null;

async function load(): Promise<Record<string, string> | null> {
  try {
    const r = await fetch(netUrl("/api/node-names"));
    if (!r.ok) return null;
    const j = (await r.json()) as { names: Record<string, string> };
    cached = j.names;
    return cached;
  } catch {
    return null;
  } finally {
    if (!cached) inflight = null; // a failure must not pin null — the next mount asks again
  }
}

export interface NodeNamesState {
  names: Record<string, string> | null;
  settled: boolean; // resolved, success OR failure — the acquiring/give-up distinction
}
export function useNodeNames(): NodeNamesState {
  const [state, setState] = useState<NodeNamesState>(() => ({ names: cached, settled: cached != null }));
  useEffect(() => {
    if (cached) return;
    let dead = false;
    (inflight ??= load()).then((v) => {
      if (!dead) setState({ names: v, settled: true });
    });
    return () => {
      dead = true;
    };
  }, []);
  return state;
}

/** The registered operator name for a node, matched across every LAYER id it carries.
 *  Empty-string entries (registered but unnamed) yield null — the name and the opt-in are
 *  separate facts, and this answers only the name. */
export function nodeName(
  names: Record<string, string> | null,
  node: { id?: string | null; ids?: string[] } | null | undefined,
): string | null {
  if (!names || !node) return null;
  for (const id of node.ids?.length ? node.ids : node.id ? [node.id] : []) {
    const n = names[id];
    if (n) return n;
  }
  return null;
}

/** Whether any of the node's layer ids has a registry ENTRY — the delegated-staking opt-in
 *  (user, 2026-08-16: an entry means the operator registered as a candidate; the whitelist
 *  that admits a validator to the cluster is a separate, independent gate). Presence-keyed,
 *  not name-keyed, so a nameless registration still answers Yes. */
export function nodeRegistered(
  names: Record<string, string> | null,
  node: { id?: string | null; ids?: string[] } | null | undefined,
): boolean {
  if (!names || !node) return false;
  for (const id of node.ids?.length ? node.ids : node.id ? [node.id] : []) {
    if (id in names) return true;
  }
  return false;
}
