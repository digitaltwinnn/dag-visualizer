// FACE SHADING for the chamber's boxes — the bars, the lane tiles, the data marks and the blocks.
//
// They are drawn UNLIT (MeshBasicMaterial): their brightness is the emphasis channel, written per
// instance, and a lamp would be a second voice in it. But an unlit box is one flat colour on every
// face, so at the chamber's pose a bar read as a bright slab and a tile as a square. The form is
// baked into the geometry instead: a per-vertex multiplier by which way the face looks — the top
// whole, the faces along the trail (the ones the camera looks at, ±X) a step down, the flanks a
// step further, the underside least. It multiplies whatever the material and the instance colour
// say, so every tier keeps its order and the top face keeps exactly the level it had; a box simply
// has three tones where it had one. No light, no normal maths per frame, the same on both grounds.
//
// The material must set `vertexColors: true` for the attribute to be read.

import * as THREE from "three";

export const FACE_SHADE: Readonly<{ top: number; front: number; side: number; under: number }> = {
  top: 1, front: 0.74, side: 0.52, under: 0.4,
};

/** Bake the face multipliers into `geo` (a box) and hand it back. `up` names the LOCAL axis that
 *  ends up vertical in the chamber: `y` for a box placed as it is, `z` for the lane tiles, which
 *  are spun −90° about X. The trail axis is local X either way. Event-time. */
export function faceShade<T extends THREE.BufferGeometry>(geo: T, up: "y" | "z" = "y"): T {
  const n = geo.getAttribute("normal");
  const col = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) {
    const u = up === "y" ? n.getY(i) : n.getZ(i);
    const k = u > 0.5 ? FACE_SHADE.top
      : u < -0.5 ? FACE_SHADE.under
      : Math.abs(n.getX(i)) > 0.5 ? FACE_SHADE.front
      : FACE_SHADE.side;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return geo;
}
