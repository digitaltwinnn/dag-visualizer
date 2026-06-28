import * as THREE from "three";

// Shared geo constants + lat/lon → 3D position, used by BOTH the node engine (globe.js) and the
// globe surface (globeSurface.js) — so the two can live in separate files without one importing
// the other just for these.
export const R = 16; // globe radius
export const LAND_H = 0.34; // how far the coastal "wall" rim rises above the solid land fill (R)

export function latLonToVec3(lat, lon, r = R) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}
