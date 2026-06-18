import { useStore } from "@/src/store/store";
import type { Anchor, GlobalSnapshot } from "@/src/data/types";
// Existing data layer, reused untouched. Browser-only (fetch/setInterval); imported
// from client code, initialized in an effect. Types come in a later phase.
import { NetworkData, shortHash as rawShortHash } from "../../js/api.js";

export const shortHash = rawShortHash as (h: string) => string;
import { METAGRAPHS, COLORS as RAW_COLORS } from "../../js/config.js";

export const COLORS = RAW_COLORS as { core: number; l0: number; l1: number; bg: number };

let net: NetworkData | null = null;

// Idempotent: NetworkData is a singleton living for the app's lifetime. The guard
// makes React StrictMode's double-mount (dev) a no-op rather than a second poller.
export function initNetwork(): NetworkData | null {
  if (typeof window === "undefined") return net;
  if (net) return net;

  net = new NetworkData();
  const { setLive, setNodes, setMetagraphs, setLatestOrdinal, setLatestSnapshot, setActivity, setPriceUsd } =
    useStore.getState();

  setMetagraphs(METAGRAPHS.length); // publicly listed metagraphs we track

  net.on("status", ({ live }: { live: boolean }) => setLive(live));
  net.on("cluster", ({ l0, l1 }: { l0: unknown[]; l1: unknown[] }) =>
    setNodes(l0.length, l1.length),
  );
  net.on("price", (p: { usd?: number } | null) =>
    setPriceUsd(p && typeof p.usd === "number" ? p.usd : null),
  );
  net.on("global", (evt: { latest?: GlobalSnapshot }) => {
    if (evt.latest) {
      setLatestOrdinal(evt.latest.ordinal);
      setLatestSnapshot(evt.latest);
      setActivity(net!.getActivity());
    }
  });

  net.init();
  return net;
}

// Exposed for later phases (engine subscribes for Lane A; panels read the store).
export function getNetwork(): NetworkData | null {
  return net;
}

// Per-tick derived DAG fee + anchored metagraph set (null until polled).
export function getAnchor(ts: string): Anchor | null {
  return net?.getAnchor(ts) ?? null;
}

// Config metagraph (id → {color, ticker, name, …}) or null for all/l0/l1 filters.
export function metagraphById(id: string): MetagraphConfig | null {
  return (METAGRAPHS as MetagraphConfig[]).find((m) => m.id === id) ?? null;
}

// The publicly listed metagraphs (config). Node counts / disabled "(0)" chips return
// when the globe's metaList is ported.
export function allMetagraphs(): MetagraphConfig[] {
  return METAGRAPHS as MetagraphConfig[];
}

export interface MetagraphConfig {
  id: string;
  name: string;
  ticker: string;
  color: number;
}
