import * as THREE from "three";
import { feature } from "topojson-client";
import { R, LAND_H, latLonToVec3 } from "./geoMath.js";

// Builds the geo globe SURFACE — the body sphere, graticule, atmosphere rim, and the raised
// continents (+ glowing coastal cliffs) — into `globe.group`, and sets the handles the morph/fade
// loop reads back on `globe` (`sphereMesh`, `atmoUniforms`, `landWallUniforms`, `landFillMesh`),
// pushing the fade-by-opacity materials into `globe.geoFades`. Split out of globe.js so the node
// engine there isn't buried under ~230 lines of geometry. The continent fill is async (fetched
// land), so `landFillMesh` / `landWallUniforms` appear once it loads (the morph loop guards them).
export function buildGlobeSurface(globe) {
  buildSphere(globe);
  buildGraticule(globe);
  buildAtmosphere(globe);
  buildLand(globe);
}

function buildSphere(globe) {
  // Writes depth so it occludes the far half of the atmosphere shell (leaving only a rim)
  // and hides far-side nodes. Hidden in the Hypergraph (visibility toggled in setMorph) so it
  // can't occlude the core there; fades in by opacity with the rest of the surface.
  const mat = new THREE.MeshStandardMaterial({
    color: 0x0a1426, emissive: 0x050c18, emissiveIntensity: 0.5,
    roughness: 0.95, metalness: 0.1,
    transparent: true, opacity: 0,
  });
  globe.geoFades.push({ mat, base: 1 });
  globe.sphereMesh = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 48), mat);
  globe.sphereMesh.visible = false;
  // The body is transparent (opacity fades in), so it lands in the transparent pass
  // alongside the additive land walls/coastline — and all three share the globe-centre
  // bounding origin, making their back-to-front sort a tie that flips as the globe
  // spins. When the sort puts this opaque-ish body *after* the land (which can't
  // depthWrite to defend itself), it paints over the near-side rim, leaving only the
  // limb — reads like you're seeing the far side. A lower renderOrder pins the body to
  // draw first every frame: its depth is laid down, then near land passes / far land is
  // occluded, deterministically at any orientation.
  globe.sphereMesh.renderOrder = -2;
  globe.group.add(globe.sphereMesh);
}

function buildGraticule(globe) {
  const pts = [];
  const step = 15;
  for (let lat = -75; lat <= 75; lat += step)
    for (let lon = -180; lon < 180; lon += 4)
      pts.push(latLonToVec3(lat, lon, R + 0.02), latLonToVec3(lat, lon + 4, R + 0.02));
  for (let lon = -180; lon < 180; lon += step)
    for (let lat = -88; lat < 88; lat += 4)
      pts.push(latLonToVec3(lat, lon, R + 0.02), latLonToVec3(lat + 4, lon, R + 0.02));
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color: 0x1d4a66, transparent: true, opacity: 0 });
  globe.geoFades.push({ mat, base: 0.28 });
  globe.group.add(new THREE.LineSegments(geo, mat));
}

function buildAtmosphere(globe) {
  // A thin, dim rim. Higher power concentrates it at the very edge and the low
  // overall scale keeps it from blooming into a bright blue halo.
  globe.atmoUniforms = { glowColor: { value: new THREE.Color(0x2a6fd0) }, uM: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: globe.atmoUniforms,
    vertexShader: `varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 glowColor; uniform float uM; varying vec3 vN;
      void main(){ float i = pow(clamp(0.82 - dot(vN, vec3(0.0,0.0,1.0)), 0.0, 1.0), 2.3); gl_FragColor = vec4(glowColor, 1.0) * i * uM * 0.45; }`,
    side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  globe.group.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.13, 48, 32), mat));
}

async function buildLand(globe) {
  try {
    const res = await fetch("/land-110m.json");
    const topo = await res.json();
    const land = feature(topo, topo.objects.land);

    // Each coastline ring becomes two things, built from the SAME vertices so they line
    // up exactly: a raised cliff "wall" (a vertical ribbon from ocean level R up to the
    // plateau top R+LAND_H) and the filled plateau on top (the polygon triangulated and
    // lifted to that same top radius). Because both use latLonToVec3(lat, lon, top) on the
    // identical ring points, the fill boundary IS the wall-top edge — no approximation.
    // Antimeridian-safe: lon +180 and −180 map to the SAME 3D point, so a seam wall segment
    // is a degenerate (zero-area) quad, and seam-straddling fill triangles are skipped below.
    const top = R + LAND_H;
    // Start the cliff base just ABOVE the sea (the opaque, faceted sphere at R dips ~0.02 below
    // R between facets) so the additive wall never z-fights / pokes through the waterline. The
    // base is faded to transparent anyway, so the visible rim is unchanged.
    const wallBase = R + 0.04;
    const wallPos = []; // wall ribbon vertices (two triangles per ring segment)
    const fillPos = []; // plateau triangles (the solid land cap)
    const addRing = (ring) => {
      for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i], b = ring[i + 1];
        // Wall quad: base (just above the sea) -> raised top, as two triangles.
        const B0 = latLonToVec3(a[1], a[0], wallBase), B1 = latLonToVec3(b[1], b[0], wallBase);
        const T0 = latLonToVec3(a[1], a[0], top), T1 = latLonToVec3(b[1], b[0], top);
        wallPos.push(
          B0.x, B0.y, B0.z, B1.x, B1.y, B1.z, T1.x, T1.y, T1.z,
          B0.x, B0.y, B0.z, T1.x, T1.y, T1.z, T0.x, T0.y, T0.z,
        );
      }
    };
    // Triangulate the plateau in (lon, lat) with earcut, then lift each vertex to the
    // wall-top radius with the very same function the walls use. The catch is the ±180
    // seam: earcut knows nothing about it, so a polygon that crosses it (Eurasia-Africa
    // via Chukotka, Antarctica, a couple of islands — 4 of 125) tears into garbage. We
    // first UNWRAP each ring's longitude into a continuous run (accumulate the shortest
    // step), which turns a crosser back into a valid simple polygon; latLonToVec3 maps
    // the out-of-[-180,180] longitudes straight back to the right 3D points.
    const unwrap = (ring) => {
      let lon = ring[0][0];
      const out = [new THREE.Vector2(lon, ring[0][1])];
      for (let i = 1; i < ring.length; i++) {
        let d = ring[i][0] - ring[i - 1][0];
        if (d > 180) d -= 360; else if (d < -180) d += 360;
        lon += d;
        out.push(new THREE.Vector2(lon, ring[i][1]));
      }
      // drop the closing duplicate — unless unwrap moved it (a pole-encircling ring)
      const a = out[0], b = out[out.length - 1];
      if (out.length > 1 && Math.abs(a.x - b.x) < 1e-6 && a.y === b.y) out.pop();
      return out;
    };
    const meanLon = (r) => r.reduce((s, p) => s + p.x, 0) / r.length;
    // Emit one earcut triangle, subdivided into an n×n grid so each facet is small. A big
    // flat triangle is a chord that sags toward the globe centre — past ocean level it gets
    // depth-occluded into a black patch — so the split keeps the surface hugging the sphere.
    // n is FIXED (not per-triangle by size): with a uniform split, neighbouring triangles
    // divide their shared edge into the same points, so there are no T-junction cracks. The
    // widest real triangle spans ~68°, so n=4 keeps every facet (~17°) under the ~24° sag
    // limit (smooth per-vertex normals hide the faceting). ~76k tris in one static draw call.
    const n = 4;
    const emitTri = (A, B, C) => {
      const pt = (u, w) => latLonToVec3(A.y + (B.y - A.y) * u + (C.y - A.y) * w,
                                        A.x + (B.x - A.x) * u + (C.x - A.x) * w, top);
      // Force outward winding so gl_FrontFacing agrees with the radial normals; otherwise
      // DoubleSide flips the normal on back-wound facets and they render unlit (black). Every
      // sub-facet shares this triangle's parametric orientation, so decide the flip ONCE.
      const pA = pt(0, 0), pB = pt(1, 0), pC = pt(0, 1);
      const nx = (pB.y - pA.y) * (pC.z - pA.z) - (pB.z - pA.z) * (pC.y - pA.y);
      const ny = (pB.z - pA.z) * (pC.x - pA.x) - (pB.x - pA.x) * (pC.z - pA.z);
      const nz = (pB.x - pA.x) * (pC.y - pA.y) - (pB.y - pA.y) * (pC.x - pA.x);
      const flip = nx * pA.x + ny * pA.y + nz * pA.z < 0;
      const tri = (p0, p1, p2) => {
        if (flip) fillPos.push(p0.x, p0.y, p0.z, p2.x, p2.y, p2.z, p1.x, p1.y, p1.z);
        else fillPos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
      };
      for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) {
        tri(pt(i / n, j / n), pt((i + 1) / n, j / n), pt(i / n, (j + 1) / n));
        if (j < n - i - 1) tri(pt((i + 1) / n, j / n), pt((i + 1) / n, (j + 1) / n), pt(i / n, (j + 1) / n));
      }
    };
    const addPolygon = (rings) => {
      rings.forEach(addRing); // cliff walls for the outer ring + every hole
      const contour = unwrap(rings[0]);
      // A ring whose longitude winds a full turn encircles a pole (Antarctica): close it
      // along the far parallel so the cap fills down to the pole instead of leaving a gash.
      if (Math.abs(contour[contour.length - 1].x - contour[0].x) > 270) {
        const poleLat = contour[0].y < 0 ? -90 : 90;
        contour.push(new THREE.Vector2(contour[contour.length - 1].x, poleLat));
        contour.push(new THREE.Vector2(contour[0].x, poleLat));
      }
      const cMean = meanLon(contour);
      const holes = rings.slice(1).map((h) => {
        const u = unwrap(h);
        const shift = Math.round((cMean - meanLon(u)) / 360) * 360; // into the outer's lon frame
        if (shift) u.forEach((p) => (p.x += shift));
        return u;
      });
      let faces;
      try { faces = THREE.ShapeUtils.triangulateShape(contour, holes); } catch { return; }
      const verts = [contour, ...holes].flat(); // earcut indexes contour then holes, in order
      for (const [a, b, c] of faces) emitTri(verts[a], verts[b], verts[c]);
    };
    for (const f of land.features) {
      const g = f.geometry;
      if (g.type === "Polygon") addPolygon(g.coordinates);
      else if (g.type === "MultiPolygon") g.coordinates.forEach(addPolygon);
    }

    // The cliff walls. A ShaderMaterial derives each vertex's height from its
    // distance to the globe's centre (the group's origin) — so the metagraph
    // colour fades smoothly out at ocean level (R) and brightens toward the top
    // (R+LAND_H). Additive + bloom makes the coastlines glow like ridges. The
    // opaque sphere depth-occludes the far-side walls (depthWrite stays off here).
    const wallGeo = new THREE.BufferGeometry();
    wallGeo.setAttribute("position", new THREE.Float32BufferAttribute(wallPos, 3));
    globe.landWallUniforms = {
      uColor: { value: globe._edgeColor.clone() },
      uBase: { value: wallBase },
      uTop: { value: top },
      uOpacity: { value: 0 },
    };
    const wallMat = new THREE.ShaderMaterial({
      uniforms: globe.landWallUniforms,
      vertexShader: `
        varying float vH;
        void main() {
          vH = length(position); // distance from the globe centre
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uBase; uniform float uTop; uniform float uOpacity;
        varying float vH;
        void main() {
          float t = clamp((vH - uBase) / (uTop - uBase), 0.0, 1.0);
          // Gently non-linear ramp (a blend of linear + quadratic): dim along the ocean line,
          // strengthening toward the top rim — so the rim reads as an edge, not a glowing band.
          float e = t * (0.4 + 0.6 * t);
          gl_FragColor = vec4(uColor * (0.09 + 0.26 * e), e * uOpacity);
        }`,
      // Single-sided so only cliffs whose face points toward the camera draw: a
      // continent's near + side edges show, its far edge (behind the filled plateau)
      // is culled instead of glowing through the translucent fill. BackSide because the
      // topojson ring winding puts the outward cliff face on the geometry's back side.
      transparent: true, depthWrite: false, side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
    });
    globe.group.add(new THREE.Mesh(wallGeo, wallMat));

    // The solid plateau, from the triangles built above. Radial normals (= normalized
    // position) give it the smooth sphere shading of the sea, so it responds to light
    // EXACTLY like the body — just lifted a couple of shades for subtle land/sea contrast.
    // depthWrite occludes the ocean grid (and the back walls) beneath the plateau; the nodes
    // sit ABOVE it, so they aren't hidden. Its edge IS the wall-top edge (same vertices).
    const fillGeo = new THREE.BufferGeometry();
    const fillArr = new Float32Array(fillPos);
    fillGeo.setAttribute("position", new THREE.BufferAttribute(fillArr, 3));
    const normArr = new Float32Array(fillArr.length);
    for (let i = 0; i < fillArr.length; i += 3) {
      const inv = 1 / Math.hypot(fillArr[i], fillArr[i + 1], fillArr[i + 2]);
      normArr[i] = fillArr[i] * inv; normArr[i + 1] = fillArr[i + 1] * inv; normArr[i + 2] = fillArr[i + 2] * inv;
    }
    fillGeo.setAttribute("normal", new THREE.BufferAttribute(normArr, 3));
    globe.landFillMat = new THREE.MeshStandardMaterial({
      // Contrast lives mostly in the emissive (lighting-independent) so the land reads as
      // land even in dimly-lit parts of the globe — the single north key light otherwise
      // leaves the camera-facing centre near-black, which looked like an unfilled hole.
      color: 0x26384a, emissive: 0x121c28, emissiveIntensity: 0.9,
      roughness: 0.95, metalness: 0.1,
      transparent: true, opacity: 0, side: THREE.DoubleSide,
    });
    globe.geoFades.push({ mat: globe.landFillMat, base: 1 }); // fades in with the sea
    globe.landFillMesh = new THREE.Mesh(fillGeo, globe.landFillMat);
    globe.landFillMesh.renderOrder = -1; // after the body (−2), before the rim/heatmap/nodes
    globe.landFillMesh.visible = false;  // revealed once the globe materialises (setMorph)
    globe.group.add(globe.landFillMesh);
  } catch (e) { /* graticule-only fallback */ }
}
