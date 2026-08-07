// NODE CONTAINERS (finetune 2026-08-06, replacing the on-floor make-up rails): the machines leave
// the floor surface and line up in framed CONTAINERS hanging under the FRONT edge of the floor
// they serve, facing the camera — one container per ROLE (metagraphs: L0 / cL1 / dL1; the DAG:
// L0 / L1), STACKED below each other, each spanning the full front width of the main floor plane
// (user, 2026-08-07 — replaced the side-by-side row).
//
// A machine appears in EVERY role container it serves (user, 2026-08-06): a hybrid machine shows
// in both the L0 and the L1 containers — the container answers "who serves this role", so the
// duplication is the honest reading (the per-machine dossier counts still dedupe UI-side). An
// empty role's container hides and the row re-centres.
//
// Pure layout math — the scene adapter (objects/NodeRails.ts) draws the frames/labels and Globe
// places the shared node InstancedMesh chips on the same specs, so the two can never disagree.
import * as THREE from "three";
import {
  CONT_X, CONT_TOP_GAP, CONT_CHIP_Z, CONT_ROW_Y, CONT_PAD, CONT_GAP, CONT_Z0, CONT_Z1,
  CONT_LABEL_W, FLOOR_Y, RAIL_GROUP_FLOOR, type RailGroup,
} from "./ledgerLayout";

/** A container's role. Metagraph machines use their cluster roles verbatim; the DAG's native
 *  currency layer (cl1 on a validator) is presented as "l1". */
export type RailRole = "l0" | "cl1" | "dl1" | "l1";

/** Container order along Z, screen-LEFT (+Z) to screen-right — the user's own listing order. */
export const ROLE_ORDER: Record<RailGroup, readonly RailRole[]> = {
  meta: ["l0", "cl1", "dl1"],
  dag: ["l0", "l1"],
};

/** The display code a container's label carries. */
export const ROLE_CODE: Record<RailRole, string> = { l0: "L0", cl1: "cL1", dl1: "dL1", l1: "L1" };

/** Which containers a machine's roles put it in, for a group. Hybrids land in SEVERAL. */
export function railRolesOf(group: RailGroup, roles: readonly string[]): RailRole[] {
  const out: RailRole[] = [];
  for (const r of ROLE_ORDER[group]) {
    if (group === "dag") {
      if (r === "l0" ? roles.includes("l0") : roles.includes("cl1") || roles.includes("dl1")) out.push(r);
    } else if (roles.includes(r)) out.push(r);
  }
  return out;
}

/** The container role ONE node record (a (machine, layer) instance) stands in, or null when the
 *  group doesn't render that layer. Records are per cluster entry, so a hybrid machine's l0 and
 *  cl1 records each land in their own container — the duplication comes from the data. */
export function recordRole(group: RailGroup, layer: string): RailRole | null {
  if (group === "dag") return layer === "l0" ? "l0" : layer === "cl1" || layer === "dl1" ? "l1" : null;
  return layer === "l0" || layer === "cl1" || layer === "dl1" ? (layer as RailRole) : null;
}

export interface ContainerSpec {
  role: RailRole;
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

/** Lay out the non-empty role containers of a group STACKED below each other (user, 2026-08-07 —
 *  replaced the side-by-side row), each spanning the FULL front width of the main floor plane
 *  (CONT_Z0..CONT_Z1), hanging under the group's floor. Event-time (a data rebuild),
 *  allocation is fine here. */
export function containerLayout(group: RailGroup, counts: ReadonlyMap<RailRole, number>): ContainerSpec[] {
  const floorY = FLOOR_Y[RAIL_GROUP_FLOOR[group]];
  const cz = (CONT_Z0 + CONT_Z1) / 2;
  const hz = (CONT_Z1 - CONT_Z0) / 2;
  // The role-code label lives INSIDE the frame's screen-left end — the chip grid starts after it.
  const cols = Math.max(1, Math.floor((CONT_Z1 - CONT_Z0 - 2 * CONT_PAD - CONT_LABEL_W) / CONT_CHIP_Z));
  // Largest group first (user, 2026-08-07) — count desc, ROLE_ORDER as the stable tiebreak.
  const present = [...ROLE_ORDER[group]].filter((r) => (counts.get(r) ?? 0) > 0);
  present.sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || ROLE_ORDER[group].indexOf(a) - ROLE_ORDER[group].indexOf(b));
  const specs: ContainerSpec[] = [];
  let top = floorY - CONT_TOP_GAP; // the current container's frame-top Y
  for (const role of present) {
    const count = counts.get(role)!;
    const rows = Math.ceil(count / cols);
    const h = rows * CONT_ROW_Y + 2 * CONT_PAD;
    specs.push({
      role, count, cols, rows,
      cy: top - h / 2, cz, hy: h / 2, hz,
      chipY0: top - CONT_PAD - CONT_ROW_Y / 2,
      chipZ0: CONT_Z1 - CONT_PAD - CONT_LABEL_W - CONT_CHIP_Z / 2,
    });
    top -= h + CONT_GAP;
  }
  return specs;
}

/** Chip `slot` (0-based within its container) → its position in the local ledger frame. */
export function containerChipPos(spec: ContainerSpec, slot: number, out: THREE.Vector3): THREE.Vector3 {
  const row = Math.floor(slot / spec.cols);
  const col = slot - row * spec.cols;
  out.set(CONT_X, spec.chipY0 - row * CONT_ROW_Y, spec.chipZ0 - col * CONT_CHIP_Z);
  return out;
}
