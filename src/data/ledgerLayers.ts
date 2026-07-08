// The settlement-stack layers' display COPY — names + descriptions, keyed by the same LedgerLayerId
// vocabulary as the geometry (src/engine/domain/ledgerLayout.ts LAYER_GEOM) and the scene's pick
// descriptors. UI copy lives HERE (the data/UI side), never in the engine: a `layer` pick carries
// only its `layerId`, and every surface that shows words (the Snapshots·Explore panel rows, the
// layer card, the hover tooltip) resolves them through this table. Ordered top→bottom (the panel
// renders this order).
import type { LedgerLayerId } from "@/src/engine/domain/ledgerLayout";

export interface LedgerLayerCopy {
  id: LedgerLayerId;
  name: string;
  desc: string;
}

export const LEDGER_LAYERS: LedgerLayerCopy[] = [
  { id: "ml1", name: "Metagraph L1", desc: "Currency-L1 (wallet transactions) and data-L1 (producer updates) validate incoming work into blocks." },
  { id: "ml0", name: "Metagraph L0", desc: "Collects those L1 blocks into the metagraph's snapshot." },
  { id: "msnap", name: "Metagraph snapshots", desc: "Each metagraph's ledger output — they anchor into a global snapshot." },
  { id: "hypl0", name: "Hypergraph L0", desc: "The Global L0 validators that produce the global snapshot." },
  { id: "hypl1", name: "Hypergraph L1", desc: "The native $DAG currency — its own lane beside L0." },
  { id: "gl0", name: "Global snapshots", desc: "The base settlement: where every metagraph snapshot anchors." },
];

export const ledgerLayerById = (id: string): LedgerLayerCopy | undefined =>
  LEDGER_LAYERS.find((l) => l.id === id);
