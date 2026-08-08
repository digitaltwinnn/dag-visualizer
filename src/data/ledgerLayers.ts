// The anchoring-stack FLOORS' display COPY — names + level digits, keyed by the same vocabulary
// as the geometry (src/engine/domain/ledgerLayout.ts FLOOR_IDS). UI copy lives HERE (the data/UI
// side), never in the engine. Since the layer-navigation retirement (2026-08-06) only the two
// SNAPSHOT floors carry copy — the node layers render as per-role containers whose labels are the
// role codes (domain/ledgerRails ROLE_CODE), and no layer is a committable subject any more; the
// explorer's groups and the 3D floor labels are the two consumers left.
//
// VOCABULARY (user, 2026-08-01): user-facing copy says the stack ANCHORS state — "settlement" is
// reserved for the DAG a snapshot actually pays (the snapshot card's fee), because this app also
// ships a separate Transactions view about currency moving, and one word for both read as if the
// Snapshots view were where money settles. Internal identifiers keep their existing names.
import type { LedgerFloorId } from "@/src/engine/domain/ledgerLayout";

export interface LedgerLayerCopy {
  id: LedgerFloorId;
  name: string;
  desc: string;
}

// (The stack-level digit — the [1]/[2] badges + the 3D labels' digit box — is retired,
// user 2026-08-07: the names alone carry the two artifacts.)
export const LEDGER_LAYERS: LedgerLayerCopy[] = [
  { id: "msnap", name: "Metagraph snapshots",
    desc: "Each metagraph seals its own state on its own cadence, in its own lane. These are the snapshots waiting to be anchored." },
  { id: "gl0", name: "Global snapshots",
    desc: "The base ledger. Every few seconds one global snapshot anchors the state every metagraph handed up, and its width here is the bytes it carried." },
];

export const ledgerLayerById = (id: string): LedgerLayerCopy | undefined =>
  LEDGER_LAYERS.find((l) => l.id === id);
