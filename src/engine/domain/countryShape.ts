// Country SHAPE math for the Geography view's country drill — pure logic over the world-atlas
// countries topology (public/countries-110m.json, parsed to GeoJSON rings by the scene layer).
//
// Two jobs:
//  1. the drill FRAMING: a constant-angle pose — the camera approaches the country's centroid
//     from IN FRONT (the equator side) at one fixed angle above its local tangent plane, at a
//     distance fit to the country's angular extent (see countryFraming);
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

// The globe's max X-lean when aiming a selection to the front (mirrors focusDensest's cap —
// a stronger lean read as "viewing the globe from the north", user; a FULL lean read as the
// camera going over the country, upside-down-ish). The constant viewing angle comes from the
// camera construction below, not from the lean.
export const GLOBE_LEAN_MAX = 0.32;

// The drill's globe lean for a country at `latAngle`: gentle (GLOBE_LEAN_MAX), stretched just
// enough at very high latitudes that the constant-angle camera stays on the front side of the
// zenith (ZENITH_CAP) — so Finland keeps the exact same surface angle as Germany instead of
// silently flattening against the cap.
export const ZENITH_CAP = 1.55; // just short of π/2
export function countryLean(latAngle: number): number {
  const need = Math.abs(latAngle) - (ZENITH_CAP - COUNTRY_VIEW_ELEV);
  return Math.sign(latAngle) * Math.min(Math.abs(latAngle), Math.max(GLOBE_LEAN_MAX, need));
}

// alpha-2 (node geo `cc`) → the topology's ISO numeric id, or null when unknown.
export function ccToNumeric(cc: string | null | undefined): string | null {
  if (!cc) return null;
  return (codes as Record<string, string>)[cc.toUpperCase()] ?? null;
}

// …and the reverse join (numeric → alpha-2), for resolving a scene hit back to the cc channel.
const numericToAlpha: Record<string, string> = {};
for (const [cc, ccn] of Object.entries(codes as Record<string, string>)) numericToAlpha[ccn] = cc;
export function numericToCc(ccn: string): string | null {
  return numericToAlpha[ccn] ?? null;
}

// Even-odd point-in-rings test in lon/lat degrees (holes fall out of the even-odd rule
// naturally). Each edge is unwrapped into the test longitude's ±180° frame, so seam-crossing
// rings (the Aleutians, Fiji) test correctly without a global unwrap. (Pole-enclosing rings —
// Antarctica — are the known blind spot; no node country encloses a pole.)
const wrapNear = (x: number, ref: number): number => {
  while (x - ref > 180) x -= 360;
  while (x - ref < -180) x += 360;
  return x;
};
export function pointInRings(lat: number, lon: number, rings: Ring[]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const y1 = ring[i][1];
      const y2 = ring[i + 1][1];
      if (y1 > lat === y2 > lat) continue; // edge doesn't straddle the test latitude
      const x1 = wrapNear(ring[i][0], lon);
      const x2 = wrapNear(ring[i + 1][0], x1);
      const xCross = x1 + ((lat - y1) / (y2 - y1)) * (x2 - x1);
      if (lon < xCross) inside = !inside;
    }
  }
  return inside;
}

// The country under a lat/lon, restricted to `eligible` alpha-2 codes (the drillable set —
// hovering open ocean or a node-less country stays quiet). Iterates the topology index;
// event-driven per pointer move, cheap at 110m over the gated set.
export function countryCcAt(
  lat: number,
  lon: number,
  geoms: Iterable<[string, { type: string; coordinates: unknown }]>,
  eligible?: (cc: string) => boolean,
): string | null {
  for (const [ccn, geom] of geoms) {
    const cc = numericToCc(ccn);
    if (!cc || (eligible && !eligible(cc))) continue;
    if (pointInRings(lat, lon, geometryRings(geom))) return cc;
  }
  return null;
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

// Country-drill camera framing, CONSTANT-ANGLE (user: the old pose read flatter the further
// north the country; the angle toward the country must always be the same — and approached
// FROM THE FRONT, not over the top). The globe leans gently (GLOBE_LEAN_MAX), leaving the
// country's centroid C on the front meridian at a residual elevation `e`; the camera then
// sits IN FRONT OF AND BELOW C — on the equator side of its meridian, COUNTRY_VIEW_ELEV
// above C's local tangent plane — angling down at the country. Same surface angle for every
// country (US vs Finland differ only in DISTANCE, fit to their extent), north stays up, and
// the camera never crosses over the country's zenith.
//
// `latAngle` = the centroid's elevation angle (atan2(dir.y, hypot(dir.x, dir.z))), radians.
// `angularRadius` = ringsAngularRadius() over the main landmass, radians.
export function countryFraming(latAngle: number, angularRadius: number, out: CameraFraming): void {
  const top = R + LAND_H;
  const e = latAngle - countryLean(latAngle); // C's residual elevation on the front face, post-lean
  const cy = Math.sin(e) * top;
  const cz = Math.cos(e) * top;
  // Distance: fit the extent within ~a third of the 55° camera's half-frame, floored so
  // city-states don't slam the surface, capped so continent-spanning countries stay inside
  // a readable wide pose.
  const halfSpan = Math.max(0.06, angularRadius);
  const FIT_TAN = 0.31; // fit half-angle inside the FOV-55 frame (0.27 → 0.31, user: zoom in a bit more)
  // Floor 3.9 (compact countries — Finland-sized — come in close; the Engine's global
  // CAM_ZOOM dolly widens the net pose ~15%), cap 18.5 (continent-spanners stay readable).
  const D = THREE.MathUtils.clamp((Math.sin(halfSpan) * top) / FIT_TAN, 3.9, 18.5);
  // Approach direction (in the meridian plane): COUNTRY_VIEW_ELEV above C's tangent plane on
  // the EQUATOR side — v̂ = (0, -cos(e+φ), sin(e+φ)). countryLean() guarantees e+φ ≤ ZENITH_CAP,
  // so the camera stays on the front side of the country's zenith at any latitude.
  const a = Math.min(e + COUNTRY_VIEW_ELEV, ZENITH_CAP);
  out.pos.set(0, cy - Math.cos(a) * D, cz + Math.sin(a) * D);
  // Composition: compact countries ride slightly above frame-centre (the drop aims the axis
  // below C); wide countries ease down to the mid-line — their landmass extends upward from
  // the centroid, so the same above-centre bias read "too high" for the US/Canada/India
  // (user). The drop fades out (slightly negative) as D approaches the wide cap.
  const t = (D - 3.9) / 14.6; // 0 at the near floor, 1 at the wide cap
  const bias = THREE.MathUtils.lerp(AIM_BELOW_CENTROID, -0.04, t);
  const drop = Math.tan(bias) * D;
  out.target.set(0, cy - Math.cos(e) * drop, cz + Math.sin(e) * drop);
}

// The fixed elevation of the camera above the country's local tangent plane (radians,
// ~49° — top-down enough that the outline reads as a shape, not a silhouette; lifted from
// 0.72, user: "tilt the camera a bit more up").
export const COUNTRY_VIEW_ELEV = 0.85;

// How far below the front point the view axis aims (radians): the country appears this angle
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
