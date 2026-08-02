// The anchoring-stack layers' display COPY — names + descriptions, keyed by the same LedgerLayerId
// vocabulary as the geometry (src/engine/domain/ledgerLayout.ts LAYER_GEOM) and the scene's pick
// descriptors. UI copy lives HERE (the data/UI side), never in the engine: a `layer` pick carries
// only its `layerId`, and every surface that shows words (the Snapshots·Explore panel rows, the
// layer card, the hover tooltip) resolves them through this table. Ordered top→bottom (the panel
// renders this order).
//
// VOCABULARY (user, 2026-08-01): user-facing copy says the stack ANCHORS state — "settlement" is
// reserved for the DAG a snapshot actually pays (the snapshot card's fee), because this app also
// ships a separate Transactions view about currency moving, and one word for both read as if the
// Snapshots view were where money settles. Internal identifiers keep their existing names.
import type { LedgerLayerId } from "@/src/engine/domain/ledgerLayout";

export interface LedgerLayerCopy {
  id: LedgerLayerId;
  name: string;
  desc: string;
  /** STACK LEVEL, counting up from the base ledger (Global snapshots = 1). The split
   *  hypergraph plane is ONE physical level with SUB-levels: L0 = 2.1, L1 = 2.2 (user scheme).
   *  Shown as the panel rows' badge + the 3D floor labels' digit box — display copy, so it
   *  lives here with the names. */
  level: string;
}

export const LEDGER_LAYERS: LedgerLayerCopy[] = [
  { id: "ml1", level: "5", name: "Metagraph L1", desc: "Currency-L1 (wallet transactions) and data-L1 (producer updates) validate incoming work into blocks." },
  { id: "ml0", level: "4", name: "Metagraph L0", desc: "Collects those L1 blocks into the metagraph's snapshot." },
  { id: "msnap", level: "3", name: "Metagraph snapshots", desc: "Each metagraph's ledger output — they anchor into a global snapshot." },
  { id: "hypl0", level: "2.1", name: "Hypergraph L0", desc: "The Global L0 validators that produce the global snapshot." },
  { id: "hypl1", level: "2.2", name: "Hypergraph L1", desc: "The native $DAG currency — its own lane beside L0." },
  { id: "gl0", level: "1", name: "Global snapshots", desc: "The base ledger: where every metagraph snapshot anchors." },
];

export const ledgerLayerById = (id: string): LedgerLayerCopy | undefined =>
  LEDGER_LAYERS.find((l) => l.id === id);
