// Country SHAPE math for the Geography view's country drill — pure logic over the world-atlas
// countries topology (public/countries-110m.json, parsed to GeoJSON rings by the scene layer).
//
// Two jobs:
//  1. the drill FRAMING: aim the camera at the country's centroid LATITUDE and zoom to fit its
//     angular EXTENT (replaces the node-mean concentration zoom, which pinned mid/high-latitude
//     countries to the top limb of the frame — the globe's lean is capped, so latitude must be
//     compensated by the camera target, not the spin);
//  2. the selection BORDER: the country's rings as line-segment positions on the plateau.
//
// The alpha-2 → numeric join (node geo `cc` → topology country id) is baked offline to
// data/country-codes.json (scripts/bake-country-codes.ts).
import * as THREE from "three";
import codes from "@/data/country-codes.json";
import { R, LAND_H, latLonToVec3 } from "./geoLayout";
import type { CameraFraming } from "./cameraRig";

// One polygon ring: [lon, lat] pairs in degrees (GeoJSON order), first == last.
export type Ring = [number, number][];

// The globe's max X-lean when aiming a selection to the front. focusDensest's WIDE pose caps
// at 0.32 (a stronger lean read as "viewing the globe from the north", user); the node zoom
// leans up to 0.70. The country drill sits between the two: 0.32 left a high-latitude
// country's residual elevation so high that the CLOSE camera craned ~43° up and pulled the
// pole into mid-frame (France) — 0.55 brings the country down the front face instead.
export const GLOBE_LEAN_MAX = 0.32;
export const COUNTRY_LEAN_MAX = 0.55;

// alpha-2 (node geo `cc`) → the topology's ISO numeric id, or null when unknown.
export function ccToNumeric(cc: string | null | undefined): string | null {
  if (!cc) return null;
  return (codes as Record<string, string>)[cc.toUpperCase()] ?? null;
}

// Flatten a GeoJSON Polygon/MultiPolygon coordinates array to a flat list of rings.
export function geometryRings(geometry: {
  type: string;
  coordinates: unknown;
}): Ring[] {
  if (geometry.type === "Polygon") return geometry.coordinates as Ring[];
  if (geometry.type === "MultiPolygon") return (geometry.coordinates as Ring[][]).flat();
  return [];
}

// The rings of the country's MAIN landmass: the polygon whose outer ring has the greatest
// total arc length (a fair size proxy at the topology's uniform 110m simplification). The
// FRAMING targets this — a multipolygon's far-flung parts (French Guiana inside France's
// geometry, Hawaii/the Aleutians for the US) would otherwise drag the centroid into open
// ocean and blow the zoom wide. The BORDER keeps drawing every polygon (geometryRings) —
// the outline stays honest; only the camera composes on the mainland.
export function mainPolygonRings(geometry: { type: string; coordinates: unknown }): Ring[] {
  if (geometry.type !== "MultiPolygon") return geometryRings(geometry);
  let best: Ring[] = [];
  let bestLen = -1;
  for (const poly of geometry.coordinates as Ring[][]) {
    const outer = poly[0] ?? [];
    let len = 0;
    for (let i = 0; i < outer.length - 1; i++)
      len += latLonToVec3(outer[i][1], outer[i][0], 1).angleTo(
        latLonToVec3(outer[i + 1][1], outer[i + 1][0], 1),
      );
    if (len > bestLen) {
      bestLen = len;
      best = poly;
    }
  }
  return best;
}

// Segment-length-weighted mean direction of the rings' vertices, as a unit vector. Working in
// 3D unit directions makes the antimeridian a non-event (no longitude unwrap — Alaska's
// Aleutians and Fiji just work). Length weighting keeps densely-digitised stretches of
// coastline from biasing the centroid. Event-driven (one call per drill), so the per-vertex
// allocation is fine.
export function ringsCentroid(rings: Ring[]): THREE.Vector3 | null {
  const mean = new THREE.Vector3();
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const a = latLonToVec3(ring[i][1], ring[i][0], 1);
      const b = latLonToVec3(ring[i + 1][1], ring[i + 1][0], 1);
      const w = a.angleTo(b); // segment angular length
      mean.addScaledVector(a, w / 2).addScaledVector(b, w / 2);
    }
  }
  if (mean.lengthSq() < 1e-9) return null;
  return mean.normalize();
}

// The country's angular radius around its centroid: the max angle from the centroid direction
// to any ring vertex (radians). Honest about far-flung parts — Alaska/Hawaii widen the US.
export function ringsAngularRadius(rings: Ring[], centroid: THREE.Vector3): number {
  let max = 0;
  for (const ring of rings)
    for (const p of ring) {
      const ang = centroid.angleTo(latLonToVec3(p[1], p[0], 1));
      if (ang > max) max = ang;
    }
  return max;
}

// Country-drill camera framing from the country's shape (not its nodes): the globe has already
// been aimed at the centroid (Y-spin + X-lean capped at GLOBE_LEAN_MAX), so the centroid rests
// on the front meridian at a RESIDUAL elevation (its latitude minus the capped lean). The camera
// stays in the user-approved low-tilt pose (pos.y fixed, near the equator plane); the DISTANCE
// fits the country's angular extent, and the AIM is angle-based: the view axis points
// AIM_BELOW_CENTROID radians below the centroid, so the country rides just above frame-centre
// at ANY zoom (a fixed-fraction target pull broke at close range — the elevation angle to a
// high-latitude centroid grows as the camera closes in, pushing it past the FOV-55 top edge).
//
// `latAngle` = the centroid's elevation angle (atan2(dir.y, hypot(dir.x, dir.z))), radians.
// `angularRadius` = ringsAngularRadius(), radians.
export function countryFraming(latAngle: number, angularRadius: number, out: CameraFraming): void {
  const top = R + LAND_H;
  const lean = THREE.MathUtils.clamp(latAngle, -COUNTRY_LEAN_MAX, COUNTRY_LEAN_MAX);
  const e = latAngle - lean; // residual elevation after the globe's capped lean
  const cy = Math.sin(e) * top; // the centroid on the front face, post-spin
  const cz = Math.cos(e) * top;
  // Distance: fit the extent within ~a third of the 55° camera's half-frame (margin for the
  // low-tilt foreshortening), floored so city-states don't slam the surface and clamped so
  // continent-spanning countries stay inside the geoNetwork-ish wide end.
  const halfSpan = Math.max(0.06, angularRadius);
  const FIT_TAN = 0.27; // ≈ tan(15°) — the comfortable half-angle inside the FOV-55 frame
  const need = (Math.sin(halfSpan) * top) / FIT_TAN;
  const py = 1.5;
  const pz = THREE.MathUtils.clamp(cz + need, 22, 34);
  out.pos.set(0, py, pz);
  const elev = Math.atan2(cy - py, pz - cz); // camera → centroid elevation
  const aim = elev - AIM_BELOW_CENTROID;
  const tz = cz * 0.35; // target depth pulled toward the globe centre (composed pivot)
  out.target.set(0, py + Math.tan(aim) * (pz - tz), tz);
}

// How far below the centroid the view axis aims (radians): the country appears this angle
// ABOVE frame-centre — ~30% up the FOV-55 half-frame.
export const AIM_BELOW_CENTROID = 0.15;

// The rings as LineSegments positions (pairs of consecutive vertices) on the plateau — the
// drill's border hairline. Event-driven allocation: built once per country change, never
// per frame.
export function ringsToSegments(rings: Ring[], radius: number = R + LAND_H + 0.03): Float32Array {
  let count = 0;
  for (const ring of rings) count += Math.max(0, ring.length - 1);
  const pos = new Float32Array(count * 6);
  let o = 0;
  for (const ring of rings)
    for (let i = 0; i < ring.length - 1; i++) {
      const a = latLonToVec3(ring[i][1], ring[i][0], radius);
      const b = latLonToVec3(ring[i + 1][1], ring[i + 1][0], radius);
      pos[o++] = a.x; pos[o++] = a.y; pos[o++] = a.z;
      pos[o++] = b.x; pos[o++] = b.y; pos[o++] = b.z;
    }
  return pos;
}
