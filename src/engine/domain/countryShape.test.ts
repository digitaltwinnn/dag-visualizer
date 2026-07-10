import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  ccToNumeric,
  geometryRings,
  mainPolygonRings,
  ringsCentroid,
  ringsAngularRadius,
  countryFraming,
  ringsToSegments,
  COUNTRY_LEAN_MAX,
  AIM_BELOW_CENTROID,
  type Ring,
} from "./countryShape";
import { R, LAND_H, latLonToVec3 } from "./geoLayout";

// A closed square ring centred on (lat, lon), `half` degrees to each side.
function square(lat: number, lon: number, half: number): Ring {
  return [
    [lon - half, lat - half],
    [lon + half, lat - half],
    [lon + half, lat + half],
    [lon - half, lat + half],
    [lon - half, lat - half],
  ];
}

describe("ccToNumeric", () => {
  it("joins alpha-2 to the world-atlas numeric id", () => {
    expect(ccToNumeric("US")).toBe("840");
    expect(ccToNumeric("de")).toBe("276"); // case-insensitive (ip-api is uppercase, be safe)
    expect(ccToNumeric("FI")).toBe("246");
  });
  it("is null for unknown / missing codes", () => {
    expect(ccToNumeric("ZZ")).toBeNull();
    expect(ccToNumeric(null)).toBeNull();
    expect(ccToNumeric(undefined)).toBeNull();
  });
});

describe("geometryRings", () => {
  const ring = square(10, 20, 1);
  it("flattens Polygon and MultiPolygon alike", () => {
    expect(geometryRings({ type: "Polygon", coordinates: [ring] })).toEqual([ring]);
    expect(
      geometryRings({ type: "MultiPolygon", coordinates: [[ring], [ring, ring]] }),
    ).toHaveLength(3);
  });
  it("is empty for other geometry types", () => {
    expect(geometryRings({ type: "Point", coordinates: [0, 0] })).toEqual([]);
  });
});

describe("mainPolygonRings", () => {
  it("picks the largest landmass of a multipolygon (the France/Guiana case)", () => {
    const metropole = square(46, 2, 4); // the big square
    const guiana = square(4, -53, 1); // small, far away
    const rings = mainPolygonRings({
      type: "MultiPolygon",
      coordinates: [[guiana], [metropole]],
    });
    expect(rings).toEqual([metropole]);
    // …so the framing centroid lands on the mainland, not in the ocean between the parts
    const c = ringsCentroid(rings)!;
    expect(c.angleTo(latLonToVec3(46, 2, 1))).toBeLessThan(0.05);
  });
  it("passes plain polygons through", () => {
    const ring = square(10, 20, 2);
    expect(mainPolygonRings({ type: "Polygon", coordinates: [ring] })).toEqual([ring]);
  });
});

describe("ringsCentroid", () => {
  it("finds the centre of a symmetric ring", () => {
    const c = ringsCentroid([square(40, 10, 3)])!;
    const expected = latLonToVec3(40, 10, 1);
    expect(c.angleTo(expected)).toBeLessThan(0.02);
  });
  it("handles the antimeridian without unwrapping (ring straddling ±180)", () => {
    const c = ringsCentroid([square(0, 180, 3)])!; // lon 177..183 wraps through the seam
    const expected = latLonToVec3(0, 180, 1);
    expect(c.angleTo(expected)).toBeLessThan(0.02);
  });
  it("is null for degenerate input", () => {
    expect(ringsCentroid([])).toBeNull();
  });
});

describe("ringsAngularRadius", () => {
  it("grows with the ring's extent", () => {
    const c = ringsCentroid([square(0, 0, 2)])!;
    const small = ringsAngularRadius([square(0, 0, 2)], c);
    const large = ringsAngularRadius([square(0, 0, 10)], ringsCentroid([square(0, 0, 10)])!);
    expect(small).toBeGreaterThan(0);
    expect(large).toBeGreaterThan(small * 3);
  });
});

describe("countryFraming", () => {
  const out = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  const top = R + LAND_H;

  // The framing invariant: the centroid appears AIM_BELOW_CENTROID radians above the view
  // axis — at any latitude and any zoom (the top-limb fix).
  const centroidAboveAxis = (latAngle: number) => {
    const e = latAngle - THREE.MathUtils.clamp(latAngle, -COUNTRY_LEAN_MAX, COUNTRY_LEAN_MAX);
    const cy = Math.sin(e) * top;
    const cz = Math.cos(e) * top;
    const elevCentroid = Math.atan2(cy - out.pos.y, out.pos.z - cz);
    const elevAxis = Math.atan2(out.target.y - out.pos.y, out.pos.z - out.target.z);
    return elevCentroid - elevAxis;
  };

  it("keeps a high-latitude centroid just above frame-centre at CLOSE zoom (the top-limb fix)", () => {
    countryFraming(0.9, 0.05, out); // ~51°N (Germany-ish), compact extent → near-end zoom
    expect(out.pos.z).toBe(22);
    expect(centroidAboveAxis(0.9)).toBeCloseTo(AIM_BELOW_CENTROID, 5);
  });

  it("holds the same aim invariant WIDE (continent-spanning extent)", () => {
    countryFraming(0.8, 0.7, out); // US-with-Alaska-ish
    expect(out.pos.z).toBe(34); // clamped at the wide end
    expect(centroidAboveAxis(0.8)).toBeCloseTo(AIM_BELOW_CENTROID, 5);
  });

  it("and for an equatorial centroid", () => {
    countryFraming(0.1, 0.1, out); // within COUNTRY_LEAN_MAX — the lean covers the latitude
    expect(centroidAboveAxis(0.1)).toBeCloseTo(AIM_BELOW_CENTROID, 5);
  });

  it("keeps the low-tilt camera pose (pos.y fixed, camera outside the globe)", () => {
    countryFraming(0.2, 0.2, out);
    expect(out.pos.y).toBe(1.5);
    expect(out.pos.length()).toBeGreaterThan(top); // never inside the surface
  });

  it("allocates nothing (writes into the caller's out struct)", () => {
    const pos = out.pos;
    const target = out.target;
    countryFraming(0.5, 0.3, out);
    expect(out.pos).toBe(pos);
    expect(out.target).toBe(target);
  });
});

describe("ringsToSegments", () => {
  it("emits one segment pair per ring edge at the plateau radius", () => {
    const ring = square(10, 20, 2); // 4 edges
    const pos = ringsToSegments([ring]);
    expect(pos.length).toBe(4 * 6);
    // every vertex sits at the border radius
    for (let i = 0; i < pos.length; i += 3) {
      const r = Math.hypot(pos[i], pos[i + 1], pos[i + 2]);
      expect(r).toBeCloseTo(R + LAND_H + 0.03, 5);
    }
  });
});
