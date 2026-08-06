// NODE RAILS (redesign 2026-08-04, spec §4.4): the validators leave the floors and line up on the
// FRONT edge of the floor they belong to, partitioned by MAKE-UP — each machine on exactly one
// rail, so the hybrid machines that run both layers are counted once instead of twice.
//
// The layer rungs deliberately OVERLAP the rails: committing `ml1` lights the L1-only rail AND the
// hybrid rail; `ml0` lights L0-only and hybrid. The hybrid rail answering to both rungs is the
// visual statement that they are the same machines — what the old two-floor layout got wrong.
//
// An EMPTY rail hides and the remaining rails collapse up (the explorer's composition groups only
// ever emit groups that exist). Applied to the DAG's own validators the same rule yields two rails
// and hides the empty hybrid one.
import * as THREE from "three";
import { railX, railY, RAIL_CAP, RAIL_CHIP_PITCH_Z, LANE_HALF_Z, type RailGroup } from "./ledgerLayout";

export type RailKind = "l1only" | "hybrid" | "l0only";

/** Fixed rail order, nearest the floor's tile boundary first (railX's index 0): L1 work arrives
 *  at the boundary, hybrids sit between, L0 seals furthest toward the camera. */
export const RAIL_ORDER: readonly RailKind[] = ["l1only", "hybrid", "l0only"];

/** A machine's rail from its roles. `null` = it runs nothing this chamber renders. */
export function railKindOf(roles: readonly string[]): RailKind | null {
  const l0 = roles.includes("l0");
  const l1 = roles.includes("cl1") || roles.includes("dl1");
  if (l0 && l1) return "hybrid";
  if (l1) return "l1only";
  if (l0) return "l0only";
  return null;
}

/** The rails that actually have machines, in RAIL_ORDER — the visible index is the X step. */
export function visibleRails(counts: ReadonlyMap<RailKind, number>): RailKind[] {
  return RAIL_ORDER.filter((k) => (counts.get(k) ?? 0) > 0);
}

/** Chip `slot` (0-based, within its rail) → its position in the local ledger frame. */
export function railChipPos(group: RailGroup, visibleIndex: number, slot: number, out: THREE.Vector3): THREE.Vector3 {
  const row = Math.floor(slot / RAIL_CAP);
  const col = slot - row * RAIL_CAP;
  out.set(railX(visibleIndex), railY(group, row), -LANE_HALF_Z + col * RAIL_CHIP_PITCH_Z);
  return out;
}

/** The layer id a rail's own pick commits. Hybrid sides with the L0 that produces the floor it
 *  stands on — the machines are the same, and the L0 rung is the one the snapshot floor is about. */
export function railLayerId(group: RailGroup, kind: RailKind): "ml0" | "ml1" | "hypl0" | "hypl1" {
  if (group === "meta") return kind === "l1only" ? "ml1" : "ml0";
  return kind === "l1only" ? "hypl1" : "hypl0";
}

/** Does a committed layer rung light this rail? The overlap rule above. */
export function railLit(layerId: string, group: RailGroup, kind: RailKind): boolean {
  const l1 = group === "meta" ? "ml1" : "hypl1";
  const l0 = group === "meta" ? "ml0" : "hypl0";
  if (layerId === l1) return kind === "l1only" || kind === "hybrid";
  if (layerId === l0) return kind === "l0only" || kind === "hybrid";
  return false;
}
