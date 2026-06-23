import { useStore } from "@/src/store/store";
import type { Anchor, GlobalSnapshot } from "@/src/data/types";
// Existing data layer, reused untouched. Browser-only (fetch/setInterval); imported
// from client code, initialized in an effect. Types come in a later phase.
import { NetworkData, shortHash as rawShortHash } from "../../js/api.js";

export const shortHash = rawShortHash as (h: string) => string;
import { METAGRAPHS, COLORS as RAW_COLORS } from "../../js/config.js";
import { hex, toDag } from "@/src/util/format";

export const COLORS = RAW_COLORS as { core: number; l0: number; l1: number; bg: number };

// The neutral accent as a CSS string (for libraries like Recharts that need a literal),
// and the fallback hub colour for a metagraph the config doesn't know yet.
export const CORE_HEX = hex(COLORS.core);
export const DEFAULT_META_COLOR = 0x8affc1;

let net: NetworkData | null = null;

// Idempotent: NetworkData is a singleton living for the app's lifetime. The guard
// makes React StrictMode's double-mount (dev) a no-op rather than a second poller.
export function initNetwork(): NetworkData | null {
  if (typeof window === "undefined") return net;
  if (net) return net;

  net = new NetworkData();
  const { setLive, setNodes, setMetagraphs, setLatestOrdinal, setLatestSnapshot, setActivity } =
    useStore.getState();

  setMetagraphs(METAGRAPHS.length); // publicly listed metagraphs we track

  net.on("status", ({ live }: { live: boolean }) => setLive(live));
  net.on("cluster", ({ l0, l1 }: { l0: unknown[]; l1: unknown[] }) =>
    setNodes(l0.length, l1.length),
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

// Live economic/activity summary for one metagraph, derived from its rolling
// snapshot buffer (`metaSnaps`) + the shared `anchorIndex`. This is the Hypergraph
// analogue of the snapshot card's "what it settled / cost": where geo answers
// *where* a metagraph runs and the ledger answers *when* it snapshots, this answers
// *how active / how economically weighty* it is. Factual: null until we've polled
// snapshots for it — never synthesized.
export interface MetaActivity {
  snapsPerMin: number | null; // snapshot cadence over the buffered window
  avgFeeDag: number; // mean DAG fee per snapshot (∝ size)
  sharePct: number | null; // its share of the anchored snapshots we track
  samples: number; // buffered snapshots backing the numbers
}

export function metaActivity(id: string): MetaActivity | null {
  const n = net as unknown as {
    metaSnaps?: Map<string, Array<{ ts: string; fee: number }>>;
    anchorIndex?: Map<string, { count: number; metaCounts: Map<string, number> }>;
  } | null;
  const buf = n?.metaSnaps?.get(id);
  if (!buf || buf.length === 0) return null;

  const samples = buf.length;
  const t0 = Date.parse(buf[0].ts);
  const t1 = Date.parse(buf[buf.length - 1].ts);
  const minutes = (t1 - t0) / 60000;
  const snapsPerMin = minutes > 0 ? (samples - 1) / minutes : null;

  const totalFee = buf.reduce((s, r) => s + (r.fee || 0), 0);
  const avgFeeDag = toDag(totalFee / samples);

  let mine = 0;
  let all = 0;
  n?.anchorIndex?.forEach((a) => {
    all += a.count;
    mine += a.metaCounts.get(id) || 0;
  });
  const sharePct = all > 0 ? (mine / all) * 100 : null;

  return { snapsPerMin, avgFeeDag, sharePct, samples };
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
