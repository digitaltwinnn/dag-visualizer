import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { R, HEX_H, VALIDATOR_HEX_R, META_HEX_R, CHIP_PITCH, LAND_H, latLonToVec3, vec3ToLatLon } from "./geoLayout";

describe("geo constants", () => {
  it("R is a positive globe radius other modules scale against", () => {
    expect(R).toBeGreaterThan(0);
  });

  it("LAND_H is a modest relief relative to R (a few percent, not a mountain range)", () => {
    expect(LAND_H).toBeGreaterThan(0);
    expect(LAND_H / R).toBeLessThan(0.15);
  });

  it("META_HEX_R is the larger of the two chip radii (honeycomb pitch derives from it)", () => {
    expect(META_HEX_R).toBeGreaterThan(VALIDATOR_HEX_R);
  });

  it("HEX_H and CHIP_PITCH are positive and the pitch clears the chip height (stacks read as separate chips)", () => {
    expect(HEX_H).toBeGreaterThan(0);
    expect(CHIP_PITCH).toBeGreaterThan(0);
    expect(CHIP_PITCH).toBeGreaterThan(HEX_H); // clear air between stacked levels, not a fused column
  });
});

describe("latLonToVec3", () => {
  it("places the poles on the Y axis at radius r", () => {
    const north = latLonToVec3(90, 0, R);
    expect(north.x).toBeCloseTo(0, 9);
    expect(north.y).toBeCloseTo(R, 9);
    expect(north.z).toBeCloseTo(0, 9);
    const south = latLonToVec3(-90, 123, R);
    expect(south.x).toBeCloseTo(0, 9);
    expect(south.y).toBeCloseTo(-R, 9);
    expect(south.z).toBeCloseTo(0, 9);
  });

  it("every point lands exactly on the sphere of the given radius", () => {
    for (const [lat, lon] of [[0, 0], [45, -73], [-33, 151], [12, -180]] as const) {
      const p = latLonToVec3(lat, lon, 7.5);
      expect(p.length()).toBeCloseTo(7.5, 9);
    }
  });

  it("defaults the radius to R when omitted", () => {
    const p = latLonToVec3(10, 20);
    expect(p.length()).toBeCloseTo(R, 9);
  });
});

describe("vec3ToLatLon", () => {
  it("is the exact inverse of latLonToVec3 at any radius", () => {
    for (const [lat, lon] of [[37.5, -121.9], [-45, 60], [0, -179], [89, 179]] as const) {
      const p = latLonToVec3(lat, lon, 4.2);
      const back = vec3ToLatLon(p);
      expect(back.lat).toBeCloseTo(lat, 6);
      expect(back.lon).toBeCloseTo(lon, 5);
    }
  });

  it("keeps longitude in (-180, 180]", () => {
    const { lon } = vec3ToLatLon(new THREE.Vector3(-1, 0, -0.0001));
    expect(lon).toBeGreaterThan(-180);
    expect(lon).toBeLessThanOrEqual(180);
  });
});
