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
  COUNTRY_VIEW_ELEV,
  GLOBE_LEAN_MAX,
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

  // C = the country's front point after the gentle lean.
  const C = (latAngle: number) => {
    const e = latAngle - THREE.MathUtils.clamp(latAngle, -GLOBE_LEAN_MAX, GLOBE_LEAN_MAX);
    return new THREE.Vector3(0, Math.sin(e) * top, Math.cos(e) * top);
  };
  // The invariant: the camera sits COUNTRY_VIEW_ELEV above C's local tangent plane — the
  // same surface angle for every country, at any latitude and any extent.
  const camElevAboveTangent = (latAngle: number) => {
    const c = C(latAngle);
    const n = c.clone().normalize();
    const v = out.pos.clone().sub(c).normalize();
    return Math.asin(v.dot(n));
  };

  it("views every country at the same surface angle (equator, Germany, Finland)", () => {
    for (const lat of [0.05, 0.9, 1.12]) {
      countryFraming(lat, 0.08, out);
      expect(camElevAboveTangent(lat)).toBeCloseTo(COUNTRY_VIEW_ELEV, 5);
    }
  });

  it("approaches from IN FRONT (equator side) — never over the country's zenith", () => {
    for (const lat of [0.05, 0.9, 1.12]) {
      countryFraming(lat, 0.08, out);
      const c = C(lat);
      expect(out.pos.y).toBeLessThan(c.y + 1e-9); // below the country point, not above it
      expect(out.pos.z).toBeGreaterThan(c.z); // outward, in front of the surface
    }
  });

  it("distance is fit to extent — floored, monotonic, capped", () => {
    const dist = (ang: number) => {
      countryFraming(0.9, ang, out);
      return out.pos.distanceTo(C(0.9));
    };
    expect(dist(0.02)).toBeCloseTo(5, 9); // floor
    expect(dist(0.25)).toBeGreaterThan(dist(0.12));
    expect(dist(0.7)).toBeCloseTo(20, 9); // cap
  });

  it("aims slightly below the country point (rides above frame-centre) and stays outside the globe", () => {
    countryFraming(0.9, 0.12, out);
    const c = C(0.9);
    expect(out.target.y).toBeLessThan(c.y); // aim dropped south along the surface
    expect(out.pos.length()).toBeGreaterThan(top);
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
