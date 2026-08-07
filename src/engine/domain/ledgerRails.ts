// NODE TRAYS (redesign 2026-08-07, replacing the per-role containers): every snapshot plane
// carries ONE glass tray of the machines that produce it, hanging under the plane's front edge
// and facing the camera. Each METAGRAPH has its own plane now, so each has its own tray — the
// machines are deduped (a hybrid appears ONCE; the role split belongs to other views, user) —
// and the global floor keeps a single full-width tray with the whole validator fleet.
//
// Pure layout math — the scene adapter (objects/NodeRails.ts) draws the tray glass and Globe
// places the shared node InstancedMesh chips on the same specs, so the two can never disagree.
import * as THREE from "three";
import {
  CONT_X, CONT_TOP_GAP, CONT_CHIP_Z, CONT_ROW_Y, CONT_PAD, CONT_Z0, CONT_Z1,
  FLOOR_Y, lanePlaneHalf, ledgerSite,
} from "./ledgerLayout";

export interface ContainerSpec {
  /** What the tray holds: a METAGRAPH id for the per-plane trays, "dag" for the validator tray. */
  key: string;
  count: number;
  cols: number;
  rows: number;
  /** Frame centre + half extents (local Y/Z; X is the shared CONT_X plane). */
  cy: number;
  cz: number;
  hy: number;
  hz: number;
  /** First chip's centre (top row, screen-left column). */
  chipY0: number;
  chipZ0: number;
}

function traySpec(key: string, count: number, cz: number, hz: number, floorY: number): ContainerSpec {
  const cols = Math.max(1, Math.floor((2 * hz - 2 * CONT_PAD) / CONT_CHIP_Z));
  const rows = Math.ceil(count / cols);
  const h = rows * CONT_ROW_Y + 2 * CONT_PAD;
  const top = floorY - CONT_TOP_GAP;
  return {
    key, count, cols, rows,
    cy: top - h / 2, cz, hy: h / 2, hz,
    chipY0: top - CONT_PAD - CONT_ROW_Y / 2,
    chipZ0: cz + hz - CONT_PAD - CONT_CHIP_Z / 2,
  };
}

/** The PER-METAGRAPH trays: one tray per metagraph with located machines, under ITS OWN plane
 *  and spanning that plane's width. `laneIds` is the shared roster (ledgerModel.LANE_IDS) — the
 *  tray rides its lane's z; a laneless count (or the unknown lane, machine-less by nature)
 *  simply gets no tray. */
export function metaTrayLayout(
  countsById: ReadonlyMap<string, number>,
  laneIds: readonly string[],
): Map<string, ContainerSpec> {
  const n = laneIds.length;
  const hz = lanePlaneHalf(n);
  const specs = new Map<string, ContainerSpec>();
  for (let i = 0; i < n; i++) {
    const id = laneIds[i];
    const count = countsById.get(id) ?? 0;
    if (count <= 0) continue;
    specs.set(id, traySpec(id, count, ledgerSite(i, n).z, hz, FLOOR_Y.msnap));
  }
  return specs;
}

/** The DAG's single validator tray: full front width of the global floor, every machine once. */
export function dagTrayLayout(count: number): ContainerSpec[] {
  if (count <= 0) return [];
  return [traySpec("dag", count, (CONT_Z0 + CONT_Z1) / 2, (CONT_Z1 - CONT_Z0) / 2, FLOOR_Y.gl0)];
}

/** Chip `slot`'s world-ish (pre-group-transform) position inside a tray — row-major from the
 *  top-left, screen-left → right (−Z direction is screen-right in the ledger frame). */
export function containerChipPos(spec: ContainerSpec, slot: number, out: THREE.Vector3): THREE.Vector3 {
  const row = Math.floor(slot / spec.cols);
  const col = slot % spec.cols;
  return out.set(CONT_X, spec.chipY0 - row * CONT_ROW_Y, spec.chipZ0 - col * CONT_CHIP_Z);
}
