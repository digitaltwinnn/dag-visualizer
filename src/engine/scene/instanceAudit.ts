// THE INSTANCE BUFFER AUDIT — a dev-only runtime check over what the render loop actually wrote.
//
// WHY THIS LAYER AND NOT A TEST. `src/engine/scene/` is 8,400 lines at a ~0.03 test ratio with a
// HIGHER branch density than the pure `domain/` layer beside it (6.6 vs 5.4 decisions per 100
// lines, measured 2026-08-31). That is not neglect — these modules write GPU buffers, so their
// correctness is pixels, and a unit test cannot see pixels. It is also exactly why bugs survive
// here: the day's worst ones were all SILENT, reporting success while being wrong, and this layer
// has no instrument that can report anything.
//
// So this is not a test. It is an assertion that runs against the real frame and turns a silent
// wrong pixel into a console error naming the mesh and the slot. Same idiom as `DevCssCanary` and
// the `config.COLORS` drift warning: dev-only, cheap, loud.
//
// WHAT IT CATCHES, and why these two:
//   · NON-FINITE values. A single NaN entering a matrix propagates — one bad divide upstream and a
//     node's transform, then anything composed from it, becomes NaN. Three renders that as an
//     object silently vanishing, which looks exactly like a node that legitimately left the set.
//   · ABSURD POSITIONS. A finite but wild coordinate (1e6 out) is the other half of the same class:
//     the slot is drawn, just nowhere the camera will ever be, so it reads as missing too.
//
// WHAT IT DELIBERATELY DOES NOT CLAIM. "Every instanced slot is written or zero-scaled every frame"
// is a real discipline in this repo, but proving it needs the WRITE PATH instrumented, not the
// buffer inspected — an unwritten slot and a deliberately zero-scaled one are the same bytes. This
// audit reads the buffer only, so it stays honest about that: it finds corruption, not omission.

/** One thing wrong with one slot. `kind` is what to fix, not merely what was seen. */
export interface InstanceFinding {
  mesh: string;
  slot: number;
  kind: "non-finite" | "out-of-bounds";
  detail: string;
}

/** Any |coordinate| beyond this is a bug, not a scene. The chamber's own trail runs to ~±40 world
 *  units and the globe to ~±120, so this is orders of magnitude clear of anything legitimate — it
 *  is a corruption trip-wire, not a layout constraint, and must never be tightened into one. */
export const POS_LIMIT = 100_000;

/**
 * Scan one instanced mesh's matrix buffer (and colour buffer, when present).
 *
 * Pure over plain arrays so it is testable without a GPU: callers pass the live
 * `instanceMatrix.array`. Stops at `cap` findings, because a corrupted buffer is usually corrupt in
 * thousands of slots and the first few name the cause just as well as all of them.
 */
export function auditInstances(
  mesh: string,
  matrix: ArrayLike<number>,
  count: number,
  colour?: ArrayLike<number> | null,
  cap = 4,
): InstanceFinding[] {
  const out: InstanceFinding[] = [];
  for (let i = 0; i < count && out.length < cap; i++) {
    const b = i * 16;
    let bad = -1;
    for (let k = 0; k < 16; k++) {
      if (!Number.isFinite(matrix[b + k] as number)) { bad = k; break; }
    }
    if (bad >= 0) {
      out.push({ mesh, slot: i, kind: "non-finite", detail: `matrix[${bad}] = ${matrix[b + bad]}` });
      continue; // its translation is meaningless too — one finding per slot
    }
    // Translation is the last column of a column-major 4x4: elements 12, 13, 14.
    for (let k = 12; k < 15; k++) {
      const v = matrix[b + k] as number;
      if (Math.abs(v) > POS_LIMIT) {
        out.push({ mesh, slot: i, kind: "out-of-bounds", detail: `${"xyz"[k - 12]} = ${v}` });
        break;
      }
    }
  }
  if (colour) {
    for (let i = 0; i < count && out.length < cap; i++) {
      const b = i * 3;
      for (let k = 0; k < 3; k++) {
        if (!Number.isFinite(colour[b + k] as number)) {
          out.push({ mesh, slot: i, kind: "non-finite", detail: `colour[${"rgb"[k]}] = ${colour[b + k]}` });
          break;
        }
      }
    }
  }
  return out;
}

/** One line per finding, deduped by mesh+kind so a corrupt buffer reports once, not per frame. */
export function findingKey(f: InstanceFinding): string {
  return `${f.mesh}:${f.kind}`;
}
