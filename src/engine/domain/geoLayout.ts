import * as THREE from "three";

// Shared geo constants + lat/lon → 3D position, used by BOTH the node engine (globe.js) and the
// globe surface (globeSurface.js) — so the two can live in separate files without one importing
// the other just for these.
export const R = 16; // globe radius
export const HEX_H = 0.08;      // geo hex-prism height (world) — thin chip (user-tuned down from 0.11)
export const VALIDATOR_HEX_R = 0.13; // geo hex-prism CIRCUMRADIUS (world) — DAG validators
export const META_HEX_R = 0.14;      // …metagraph nodes; the honeycomb pitch derives from the LARGER
export const CHIP_PITCH = 0.13;  // radial lift per LEVEL in a co-located stack: HEX_H + clear air
                                 // (user: chips must read as separate, not one fused column) — see
                                 // nodeLayout's stackSizes/spreadCoLocated levels + NodeFabric
export const LAND_H = 1.0; // height the coastal "wall" cliffs rise from the ocean (R) to the raised
                           // land plateau (R+LAND_H) — a modest relief (~6% of R at R=16); the walls
                           // are a calm ridge in the surface hue with a brighter top rim.

export function latLonToVec3(lat: number, lon: number, r: number = R): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}
