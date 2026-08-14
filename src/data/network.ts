import { useStore } from "@/src/store/store";
import type { Anchor, GlobalSnapshot, MetaInfo, NodeRow } from "@/src/data/types";
import { NetworkData, shortHash } from "@/src/data/api";
import { METAGRAPHS, COLORS as RAW_COLORS, DEFAULT_META_COLOR as RAW_DEFAULT_META } from "@/src/engine/config";
import { hex } from "@/src/util/format";
import { identityHudNumber } from "@/src/palette/identity";
import { UNLISTED_ID, UNLISTED_HUE } from "@/src/data/unlisted";
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
  const { setLive, setNodes, setMetagraphs, setLatestSnapshot, setActivity } =
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
// as a live node's `NodeInfo.id` (the cluster-info hash) — but the scene's glow set keys
// metagraph nodes by `nodeId = node.ip` (Globe.ts's MetaNodeRecord construction; validators use
// `node.id` instead, an existing asymmetry — see Engine._pickNodeId). So a truncated signer can
// never be compared directly against the glow key: it has to be resolved to the matching node's
// IP first. This is that resolution, over the live per-metagraph node list the store already
// carries (`store.metaList`) — a prefix match against each candidate's ids.
//
// ⚠️ Against EVERY layer id, not just `id`: a hybrid machine runs one process per layer, each
// with its own keypair, so its dL1 id differs from its l0 id (verified live 2026-08-09). Snapshot
// proofs are signed by the l0 cluster and data blocks by the dL1 cluster, so matching `id` alone
// silently failed for every data-block signer on a hybrid machine.
const idsOfNode = (n: { id?: string | null; ids?: string[] }): string[] =>
  n.ids?.length ? n.ids : n.id ? [n.id] : [];
const carriesSigner = (n: { id?: string | null; ids?: string[] }, prefix: string): boolean =>
  idsOfNode(n).some((full) => full.startsWith(prefix));

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
    if (!n.ip) continue;
    if (prefixes.some((p) => carriesSigner(n, p))) ips.push(n.ip);
  }
  return ips.length ? ips : null;
}

// The card-side twin of resolveSignerIps: given ONE signer's truncated id, find the matching
// live NODE ROW (the same rows the ledger explorer/roster browse — `store.selNodes`) so the
// metagraph-snapshot card can render a clickable/hoverable row per signer instead of a bare
// hash. Scoped to the snapshot's own network first (a truncated prefix could theoretically
// collide across metagraphs; pickNetId keeps the match honest), then prefix-matched like
// resolveSignerIps — across every layer id, per the ⚠️ above. Returns the first match or null
// (not every signer resolves — a node can have rotated off the live set since it signed).
export function matchSignerRow(selNodes: NodeRow[], metaId: string, signerPrefix: string): NodeRow | null {
  if (!signerPrefix) return null;
  for (const r of selNodes) {
    if (pickNetId(r.pick) !== metaId) continue;
    if (carriesSigner(r, signerPrefix)) return r;
  }
  return null;
}

/** Whether a snapshot's signer names a machine this app can show — and if not, WHY.
 *
 *  Every proof id names a real machine: a metagraph seals its snapshots with its own L0 cluster.
 *  But the app only knows the machines the CATALOG publishes, so a signer can fail to resolve, and
 *  for an `unlisted` channel every one of them does (user, 2026-08-09 — "the unlisted metagraph has
 *  also nodes that signed the snapshot that we don't know about"). This is the ONE place that
 *  decides which, so every route that lists signers — the ledger explorer's signer depth, the
 *  metagraph-snapshot card's rows, any future one — says the same thing about the same id.
 *
 *  **It is keyed on the DATA, never on the network id.** The unlisted case is simply the branch
 *  every network takes when nothing about its cluster is known, which is why this is a general rule
 *  and not an unlisted special case (and why it needs no second home in `src/data/unlisted.ts`).
 *
 *  The answer to "should an unknown signer get a node card?" is NO. It has no IP, no geolocation,
 *  no roles and no status — a card would be a card of ghosts, and rule 10 forbids inventing them.
 *  So an unresolved signer stays a SIGNATURE that states what it is: no card, and no click
 *  affordance either (affordance follows the data). Only the resolved arm carries a node. */
export type SignerResolution =
  | { known: true; row: NodeRow }
  /** `network`: no row for this network is here at all — nothing about its machines is knowable
   *  (always the unlisted case; also a network this view hasn't published).
   *  `node`: the network's rows ARE here, but none carries this signer's prefix. */
  | { known: false; reason: "network" | "node" };

export function resolveSigner(selNodes: NodeRow[], metaId: string, signerPrefix: string): SignerResolution {
  const row = matchSignerRow(selNodes, metaId, signerPrefix);
  if (row) return { known: true, row };
  return { known: false, reason: selNodes.some((r) => pickNetId(r.pick) === metaId) ? "node" : "network" };
}

/** The words for an unresolved signer — one home, so the two render sites can't describe the same
 *  id differently. Both phrase what WE know, never what the network DID: we cannot tell a
 *  rotated-out node from an id-space miss, and a network's rows can be absent merely because this
 *  view didn't publish them. */
export const SIGNER_UNKNOWN: Record<"network" | "node", { label: string; title: string }> = {
  network: {
    label: "unknown node",
    title: "This network's nodes aren't known here — the signature is all we have.",
  },
  node: {
    label: "not in live set",
    title: "No node in the live set carries this signer id.",
  },
};

/** WHICH LAYER produced a group of signatures — one home, so the surfaces that count or list signers
 *  (the raw layer's SIGNERS lane, the two snapshot cards, the ledger explorer's signer depth) name
 *  the same layer in the same words.
 *
 *  ⚠️ **A VALIDATOR IS A LAYER, NEVER A MACHINE.** The app's vocabulary has three levels and one word
 *  each: a **node** is the host (one machine, one IP, one city, one status); a **layer** is a process
 *  it runs (L0 / cL1 / dL1, each with its own keypair and therefore its own peer id — which is why
 *  `signerMatchesNode` matches against `ids`, not `id`); a node's **composition** is the set of layers
 *  it runs. A layer ACTING is a **validator**, and the word is always layer-qualified — "L0 validator",
 *  "dL1 validator". So there is no such thing as a "hybrid validator": a hybrid is a NODE that runs an
 *  L0 validator and a dL1 validator. Anything counting signatures is counting validators; anything
 *  counting machines is counting nodes. Use `who` rather than writing either word inline.
 *
 *  This exists because the counts are confusing without it (user, 2026-08-09 — DOR's "signed by" is
 *  always 3 while DOR runs 20 machines). Both facts are verified live: a metagraph's snapshot proof
 *  is sealed by its **L0** cluster, which for DOR *is* exactly its 3 hybrid nodes, so the count is
 *  constant by construction; its data blocks are produced by the **dL1** cluster, each block by a
 *  rotating subset of that fleet, so that count varies per snapshot (3 and 6 both observed) and can
 *  be 0 on an idle snapshot. Naming the layer is what turns a constant 3 from a suspicious number
 *  into a structural one. */
export const SIGNER_GROUPS = {
  proof: {
    /** The group's noun (the raw lane's group header) — the THING signed, always singular, and
        it references the pane's own TABS (user, 2026-08-14, twice: the header names what got
        signed, the chip says who; and the groups should speak the tab names — the seal covers
        both payload tabs, which the parenthetical states). */
    label: "snapshot (state & data)",
    /** The producing cluster, terse enough for an instrument note. */
    layer: "L0 cluster",
    /** What the counted things ARE, read after a number ("3 L0 validators"). */
    who: "L0 validators",
    title:
      "A metagraph seals every snapshot with its own L0 cluster, so this list IS that cluster — a 3-node L0 signs all three, every time.",
  },
  dataBlocks: {
    /** Matches the DATA tab's name 1:1 (user, 2026-08-14 — consistency in the tabs' direction);
        the BLOCKS nuance lives in the title, where the union across them is already explained. */
    label: "data",
    layer: "dL1, rotating",
    who: "dL1 validators",
    title:
      "Data blocks are produced by the metagraph's dL1 cluster, EACH BLOCK by a rotating subset of that fleet — this list is the union: every validator that signed at least one of this snapshot's blocks (the per-block split lives on chain, not here). A hybrid node signs under its dL1 id rather than its L0 one.",
  },
  /** The GLOBAL snapshot's own seal. The DAG is a metagraph-shaped core under the unified node model,
   *  so its proof group is the same shape as a metagraph's — its own L0 cluster — and reads with the
   *  same words. Its own title, because the metagraph one explains a 3-of-20 that has no analogue at
   *  network scale. */
  globalProof: {
    label: "snapshot proof",
    layer: "L0 cluster",
    who: "L0 validators",
    title:
      "The global snapshot is sealed by the DAG's own L0 cluster — one validator per participating node, so this is how much of the network signed this tick.",
  },
} as const;

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
// core's colour (metagraph or the DAG's own brand hue), the unlisted set's neutral gray, or
// the network cyan for "all". (The unlisted import is a deferred-call cycle with unlisted.ts's
// own metagraphById import — both only dereference inside function bodies, so module init is
// safe; the id-literal boundary test requires importing rather than re-stating the string.)
export function filterAccent(filter: string): string {
  if (filter === UNLISTED_ID) return UNLISTED_HUE;
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
