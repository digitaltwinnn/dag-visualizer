import { useStore } from "@/src/store/store";
import type { Anchor, GlobalSnapshot, MetaInfo, NodeRow } from "@/src/data/types";
import { NetworkData, shortHash } from "@/src/data/api";
import { METAGRAPHS, COLORS as RAW_COLORS, DEFAULT_META_COLOR as RAW_DEFAULT_META } from "@/src/engine/config";
import { hex } from "@/src/util/format";
import { identityHudNumber } from "@/src/palette/identity";
import { pickNetId } from "@/src/engine/domain/pickActions";

export { shortHash };
export const COLORS = RAW_COLORS;

// The neutral accent as a CSS string (for libraries like Recharts that need a literal),
// and the fallback hub colour for a metagraph the config doesn't know yet.
export const CORE_HEX = hex(COLORS.core);
export const DEFAULT_META_COLOR = RAW_DEFAULT_META as number;

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

  // Activity is scoped to the current filter — a metagraph reads its own snapshot stream,
  // "all"/"dag" the global L0 ledger. Recompute on new snapshots, on anchor-index updates
  // (per-metagraph fees), and whenever the selection changes.
  const refreshActivity = () => setActivity(net!.getActivity(useStore.getState().filter));

  net.on("status", ({ live, lastGoodAt }: { live: boolean; lastGoodAt: number | null }) => setLive(live, lastGoodAt ?? undefined));
  net.on("cluster", ({ l0, l1 }: { l0: unknown[]; l1: unknown[] }) =>
    setNodes(l0.length, l1.length),
  );
  net.on("global", (evt: { latest: GlobalSnapshot | null }) => {
    if (evt.latest) {
      setLatestOrdinal(evt.latest.ordinal);
      setLatestSnapshot(evt.latest);
      refreshActivity();
    }
  });
  net.on("anchor", () => refreshActivity());
  useStore.subscribe((st, prev) => {
    if (st.filter !== prev.filter) refreshActivity();
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

// How long after a tick's identified count last grew we treat it as "settled". Until then its
// breakdown is still filling in (metagraphs anchor over a few seconds + our poll catches up), so
// the UI says "still gathering" rather than committing to a floor/unlisted number. Shared by the
// snapshot card's anchor pills and its fee note so they agree. See CLAUDE.md → "The tick lifecycle".
export const ANCHOR_SETTLE_MS = 7000;

// True while the tick `ts` is still gathering anchors (count below the authoritative total AND it
// grew within the settle window). `total` is the global snapshot's metagraphSnapshotCount.
export function isAnchorSettling(ts: string, total: number | null): boolean {
  const a = net?.getAnchor(ts);
  if (!a || total == null) return false;
  return total > a.count && Date.now() - a.touched < ANCHOR_SETTLE_MS;
}

// A metagraph snapshot's `signers` (decodeChannel.ts's shortSigner — the proof list's node ids,
// truncated to SIGNER_LEN chars server-side to keep the payload small) live in the SAME id space
// as a live node's full `NodeInfo.id` (the cluster-info hash) — but the scene's glow set keys
// metagraph nodes by `nodeId = node.ip` (Globe.ts's MetaNodeRecord construction; validators use
// `node.id` instead, an existing asymmetry — see Engine._pickNodeId). So a truncated signer can
// never be compared directly against the glow key: it has to be resolved to the matching node's
// IP first. This is that resolution, over the live per-metagraph node list the store already
// carries (`store.metaList`) — a prefix match against each candidate's full id.
export function resolveSignerIps(
  metaList: MetaInfo[],
  metaId: string,
  signers: readonly string[] | null,
): string[] | null {
  const prefixes = signers?.filter(Boolean);
  if (!prefixes?.length) return null;
  const meta = metaList.find((m) => m.id === metaId);
  if (!meta) return null;
  const ips: string[] = [];
  for (const n of meta.nodes) {
    if (!n.ip || !n.id) continue;
    if (prefixes.some((p) => n.id!.startsWith(p))) ips.push(n.ip);
  }
  return ips.length ? ips : null;
}

// The card-side twin of resolveSignerIps: given ONE signer's truncated id, find the matching
// live NODE ROW (the same rows the ledger explorer/roster browse — `store.selNodes`) so the
// metagraph-snapshot card can render a clickable/hoverable row per signer instead of a bare
// hash. Scoped to the snapshot's own network first (a truncated prefix could theoretically
// collide across metagraphs; pickNetId keeps the match honest), then prefix-matched like
// resolveSignerIps. Returns the first match or null (not every signer resolves — a node can
// have rotated off the live set since it signed).
export function matchSignerRow(selNodes: NodeRow[], metaId: string, signerPrefix: string): NodeRow | null {
  if (!signerPrefix) return null;
  for (const r of selNodes) {
    if (pickNetId(r.pick) !== metaId) continue;
    if (r.id && r.id.startsWith(signerPrefix)) return r;
  }
  return null;
}

// The DAG modelled as a core, resolvable like a metagraph config (its live nodes come from
// the metaList; this is just its identity for the filter/dossier/top-bar).
// The DAG core carries its own logo (it isn't in the live metaList). Uses the official $DAG mark
// from the same Stargazer asset bucket the metagraph icons come from (monogram is the fallback).
// `color` is the fallback before the identity hue resolves (metagraphById overrides it below) —
// the DAG is itself a metagraph-shaped "core" (it has a logo, a site, its own validator nodes)
// and gets its own brand hue, distinct from "All"/the structural-cyan core sphere.
const DAG_CFG: MetagraphConfig = {
  id: "dag", name: "DAG", ticker: "DAG", color: COLORS.core,
  iconUrl: "https://stargazer-assets.s3.us-east-2.amazonaws.com/logos/dag.png",
  // The DAG isn't in the live metaList's siteUrl lane (Engine publishes it with
  // `siteUrl: undefined`), so its dossier ExternalLink resolves from THIS config fallback.
  siteUrl: "https://constellationnetwork.io",
};

// Config core (id → {color, ticker, name, …}) — a metagraph or the DAG; null for "all".
// The color field is resolved through the identity HUD map so every downstream HUD read
// (filterAccent, the Engine-built metaList[].color, and any hex(cfg.color) sourced from this
// accessor) gets the identity hue at once — the DAG flips through the same lane as any other
// metagraph now (see palette/identity.ts's resolve()); "All" stays structural cyan via
// filterAccent's own fallback below, and the central core sphere reads COLORS.core directly.
export function metagraphById(id: string): MetagraphConfig | null {
  if (id === "dag") return { ...DAG_CFG, color: identityHudNumber(id) };
  const cfg = (METAGRAPHS as MetagraphConfig[]).find((m) => m.id === id);
  return cfg ? { ...cfg, color: identityHudNumber(id) } : null;
}

// The accent colour for the active network filter, as a CSS colour string — the selected
// core's colour (metagraph or the DAG's own brand hue), or the network cyan for "all".
export function filterAccent(filter: string): string {
  const cfg = metagraphById(filter);
  if (cfg) return hex(cfg.color);
  return "var(--primary)";
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
  iconUrl?: string;
  siteUrl?: string; // config-level site (the DAG core; metagraphs get theirs from the live metaList)
}
