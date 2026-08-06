// The anchoring-stack layers' display COPY — names + descriptions, keyed by the same LedgerLayerId
// vocabulary as the geometry (src/engine/domain/ledgerLayout.ts LAYER_GEOM) and the scene's pick
// descriptors. UI copy lives HERE (the data/UI side), never in the engine: a `layer` pick carries
// only its `layerId`, and every surface that shows words (the Snapshots·Explore panel rows, the
// layer card, the hover tooltip) resolves them through this table. Its ORDER mirrors LAYER_GEOM's
// (a test pins the two together): top→bottom through the chamber, each floor preceded by the rails
// that feed it.
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
  /** STACK LEVEL, counting up from the base ledger. Only the two SNAPSHOT layers are floors now
   *  (global = "1", metagraph = "2"); the four NODE layers ride as rails on the floor they serve
   *  and carry the literal level `"rail"` instead of a digit — they are not a storey of their own.
   *  Shown as the panel rows' badge + the 3D floor labels' digit box — display copy, so it
   *  lives here with the names. */
  level: string;
}

export const LEDGER_LAYERS: LedgerLayerCopy[] = [
  { id: "ml1", level: "rail", name: "Metagraph L1",
    desc: "The machines that take in transactions and data updates for a metagraph and hand them to its L0." },
  { id: "ml0", level: "rail", name: "Metagraph L0",
    desc: "The machines that reach consensus for a metagraph and produce its snapshots." },
  { id: "msnap", level: "2", name: "Metagraph snapshots",
    desc: "Each metagraph seals its own state on its own cadence, in its own lane. These are the snapshots waiting to be anchored." },
  { id: "hypl0", level: "rail", name: "Hypergraph L0",
    desc: "The DAG's validators, reaching global consensus and producing the base ledger." },
  { id: "hypl1", level: "rail", name: "Hypergraph L1",
    desc: "The DAG's own transaction layer — the machines that accept $DAG transfers." },
  { id: "gl0", level: "1", name: "Global snapshots",
    desc: "The base ledger. Every few seconds one global snapshot anchors the state every metagraph handed up, and its width here is the bytes it carried." },
];

export const ledgerLayerById = (id: string): LedgerLayerCopy | undefined =>
  LEDGER_LAYERS.find((l) => l.id === id);
