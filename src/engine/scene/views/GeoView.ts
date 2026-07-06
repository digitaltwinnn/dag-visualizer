import * as THREE from "three";
import { feature } from "topojson-client";
import { R, LAND_H, latLonToVec3 } from "../../domain/geoMath";

// Builds the geo globe SURFACE — the body sphere, graticule, atmosphere rim, and the raised
// continents (+ glowing coastal cliffs) — into `globe.group`, and sets the handles the morph/fade
// loop reads back on `globe` (`sphereMesh`, `atmoUniforms`, `landWallUniforms`, `landFillMesh`),
// pushing the fade-by-opacity materials into `globe.geoFades`. Split out of globe.js so the node
// engine there isn't buried under ~230 lines of geometry. The continent fill is async (fetched
// land), so `landFillMesh` / `landWallUniforms` appear once it loads (the morph loop guards them).

// One entry in `host.geoFades`: a material faded in/out by the morph loop, scaled by `base`
// (its own resting opacity once fully revealed).
interface GeoFadeEntry {
  mat: THREE.Material & { opacity: number };
  base: number;
}

// The exact handles buildGeoView reads and writes on the host (the Globe instance,
// scene/Globe.ts, implements this). `landFillMat` is set too (an
// extra beyond the brief's 5) but is only read back locally to construct `landFillMesh`, not
// consumed elsewhere in globe.js — kept optional here for parity with the original handle.
export interface GeoViewHost {
  group: THREE.Group;
  geoFades: GeoFadeEntry[];
  geoColor: number; // the structural accent (--primary), fed from the Engine — grid + graticule hue
  _edgeColor: THREE.Color;
  landWallUniforms?: {
    uColor: { value: THREE.Color };
    uBase: { value: number };
    uTop: { value: number };
    uOpacity: { value: number };
  };
  landFillMat?: THREE.MeshBasicMaterial;
  landFillMesh?: THREE.Mesh;
}

// HOLOGRAPHIC GLOBE: there is deliberately NO opaque body sphere and NO atmosphere halo.
// The coastal wall rim is the defining stroke, the land glass + micro-grid carry the surface,
// and the ocean is simply the void between coastlines — the far side shows through dimly
// (far-side node discs still vanish via discFall; the far graticule/walls reading through IS
// the hologram). All surface colours come from config.COLORS' geo family (scene structural
// lane — never identity-tinted).
export function buildGeoView(globe: GeoViewHost): void {
  buildGraticule(globe);
  buildLand(globe);
}

function buildGraticule(globe: GeoViewHost) {
  const pts: THREE.Vector3[] = [];
  const step = 15;
  for (let lat = -75; lat <= 75; lat += step)
    for (let lon = -180; lon < 180; lon += 4)
      pts.push(latLonToVec3(lat, lon, R + 0.02), latLonToVec3(lat, lon + 4, R + 0.02));
  for (let lon = -180; lon < 180; lon += step)
    for (let lat = -88; lat < 88; lat += 4)
      pts.push(latLonToVec3(lat, lon, R + 0.02), latLonToVec3(lat + 4, lon, R + 0.02));
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  // The sea graticule (grid lines OVER the ocean): very subtle on purpose — a faint hint so the
  // continents (the raised, gridded land) clearly lead. Accent hue, kept calm by a low fade opacity.
  const mat = new THREE.LineBasicMaterial({ color: globe.geoColor, transparent: true, opacity: 0 });
  globe.geoFades.push({ mat, base: 0.05 });
  globe.group.add(new THREE.LineSegments(geo, mat));
}

// The land mask + 3° micro-grid as ONE mipmapped equirectangular texture — the standard way
// globes carry both. Canvas2D draws the topojson land polygons directly in equirect space
// (its evenodd fill handles ring winding + holes robustly; drawing each ring at x−W/x/x+W
// makes the antimeridian a non-issue), then composites the grid lines "source-atop" so they
// exist ONLY on land.
//
// ⚠️ The mask is encoded in LUMINANCE, NOT ALPHA. The working canvas uses alpha internally,
// but the final texture is FLATTENED onto an opaque black canvas: sea = pure black, land =
// dim glass grey, grid lines = bright. The material renders it ADDITIVELY, so black adds
// nothing — the sea simply doesn't exist on screen. This deliberately avoids alphaTest +
// CanvasTexture: alpha-encoded canvas uploads proved PATH-DEPENDENT in Chrome (premultiplied
// GPU-canvas fast paths vs readback produce different texels than getImageData reports, and
// the result flipped between mipmapped and direct uploads). Luminance survives every path.
// Mipmaps then do the minification anti-aliasing that analytic per-fragment lines can't get
// under the postprocessing composer (no MSAA there) — no shimmer as the globe turns.
type LandFeature = { geometry: { type: string; coordinates: unknown } };
function makeLandTexture(features: LandFeature[]): THREE.DataTexture {
  // 4096×2048: POWER-OF-TWO on purpose — NPOT dimensions combined with the wrong wrap/filter
  // are another way a WebGL texture goes silently incomplete (= samples black, no error).
  // POT + ClampToEdge + Linear is complete under every WebGL. High res so the fine 1px grid
  // lines stay CRISP (supersampled) on the near face instead of blurring — see the no-mipmaps note.
  const W = 4096, H = 2048;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d")!;
  const px = (lon: number, lat: number): [number, number] =>
    [((lon + 180) / 360) * W, ((90 - lat) / 180) * H];

  // Land mask. One path per polygon (outer ring + holes), evenodd-filled (handles winding +
  // holes robustly); each polygon is drawn three times at x−W / x / x+W so a seam-crossing
  // ring simply paints its overflow into the neighbouring copy; pole-encircling rings
  // (Antarctica) are closed along the pole edge so the cap reaches the pole.
  g.fillStyle = "rgb(26,26,26)"; // faint resting wash (~0.10) — the surface stays airy, not solid;
                                 // the fine grid does the reading, the fill is barely a whisper
  // Unwrap a ring's longitudes into a continuous run (accumulate the shortest step) so a
  // seam-crosser stays one monotonic path; returns [lon, lat] pairs in absolute (possibly
  // out-of-[-180,180]) longitude.
  const unwrapRing = (ring: number[][]): number[][] => {
    let lon = ring[0][0];
    const out: number[][] = [[lon, ring[0][1]]];
    for (let i = 1; i < ring.length; i++) {
      let d = ring[i][0] - ring[i - 1][0];
      if (d > 180) d -= 360; else if (d < -180) d += 360;
      lon += d;
      out.push([lon, ring[i][1]]);
    }
    return out;
  };
  const meanLon = (r: number[][]) => r.reduce((s, p) => s + p[0], 0) / r.length;
  for (const f of features) {
    const polys = (f.geometry.type === "Polygon"
      ? [f.geometry.coordinates]
      : f.geometry.coordinates) as number[][][][];
    for (const rings of polys) {
      // Unwrap the outer ring, then shift each HOLE ring into the outer's 360° frame — otherwise
      // a hole unwrapped in its own cycle lands in a different canvas column than the outer that
      // encloses it, so evenodd never subtracts it (that was the Caspian-Sea bug: it read as land).
      const outer = unwrapRing(rings[0]);
      const oMean = meanLon(outer);
      const holes = rings.slice(1).map((h) => {
        const u = unwrapRing(h);
        const shift = Math.round((oMean - meanLon(u)) / 360) * 360;
        if (shift) for (const p of u) p[0] += shift;
        return u;
      });
      for (const xOff of [-W, 0, W]) {
        g.beginPath();
        for (const rp of [outer, ...holes]) {
          const [x0, y0] = px(rp[0][0], rp[0][1]);
          g.moveTo(x0 + xOff, y0);
          let lastX = x0;
          for (let i = 1; i < rp.length; i++) {
            const [x, y] = px(rp[i][0], rp[i][1]);
            g.lineTo(x + xOff, y);
            lastX = x;
          }
          // Pole-encircling ring (Antarctica): the run ends ~a full width from its start —
          // close it along the pole edge so the fill reaches the pole instead of leaving a gash.
          if (Math.abs(lastX - x0) > W * 0.75) {
            const poleY = rp[0][1] < 0 ? H : 0;
            g.lineTo(lastX + xOff, poleY);
            g.lineTo(x0 + xOff, poleY);
          }
          g.closePath();
        }
        g.fill("evenodd");
      }
    }
  }

  // Orientation guard: if a data source ever ships inverted coverage (world-border ring with
  // the continents as holes), a known mid-ocean pixel comes out painted — XOR-flip the mask
  // (painted↔unpainted in one op). No-op for correctly-oriented data like the current file.
  const oceanProbe = g.getImageData(
    Math.round(((-140 + 180) / 360) * W), Math.round((90 / 180) * H), 1, 1,
  ).data;
  if (oceanProbe[3] > 0) {
    g.globalCompositeOperation = "xor";
    g.fillRect(0, 0, W, H); // same fillStyle: the glass luminance
    g.globalCompositeOperation = "source-over";
  }

  // The micro-grid, clipped to the land by compositing — drawn at exact degree positions;
  // source-atop keeps the lines ONLY where land is painted (alpha is still live HERE, on the
  // working canvas — it's flattened away below).
  g.globalCompositeOperation = "source-atop";
  g.strokeStyle = "rgb(34,34,34)"; // very subtle grid — barely above the fill (26), a faint hint of mesh
  g.lineWidth = 1.0;                   // 1px at 4096 = a very FINE hairline (crisp, not fuzzy)
  const STEP = 1.5;                    // DENSE 1.5° graticule — a delicate mesh, not a coarse cage
  for (let lat = -90 + STEP; lat < 90; lat += STEP) {
    const y = ((90 - lat) / 180) * H;
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
  }
  for (let lon = -180; lon < 180; lon += STEP) {
    const x = ((lon + 180) / 360) * W;
    // Meridians converge at the poles — stop them past |lat| 72° so Antarctica isn't a glow blob.
    const yTop = ((90 - 72) / 180) * H, yBot = ((90 + 72) / 180) * H;
    g.beginPath(); g.moveTo(x, yTop); g.lineTo(x, yBot); g.stroke();
  }
  g.globalCompositeOperation = "source-over";

  // FLATTEN: opaque black out-canvas — the luminance encoding (see header note). After this,
  // alpha is 255 everywhere and no upload path can reinterpret it. Drawn VERTICALLY FLIPPED
  // because the texture uploads as a raw buffer, and three does NOT apply `flipY` to
  // DataTextures — the flip must be baked into the pixels.
  const flat = document.createElement("canvas");
  flat.width = W; flat.height = H;
  const fg = flat.getContext("2d")!;
  fg.fillStyle = "#000";
  fg.fillRect(0, 0, W, H);
  fg.save();
  fg.scale(1, -1);
  fg.drawImage(cv, 0, -H);
  fg.restore();

  // Upload as RAW PIXELS (DataTexture), not as a canvas: canvas-sourced texImage2D goes
  // through browser fast paths (GPU-GPU copies, premultiply variants) that proved unreliable;
  // getImageData → typed array → texImage2D is the one path that is deterministic everywhere,
  // and getImageData is exactly what our own probes verify against.
  //
  // ⚠️ Plain Linear filtering, NO mipmaps — deliberately. A mip-requiring minFilter whose
  // mips fail to generate leaves the texture INCOMPLETE, which samples BLACK with no error
  // anywhere (that was this view's hardest bug: the land silently vanished). The bake
  // resolution is chosen near the on-screen sampling rate, so linear-without-mips shows no
  // meaningful shimmer.
  const pixels = fg.getImageData(0, 0, W, H);
  const tex = new THREE.DataTexture(new Uint8Array(pixels.data.buffer), W, H, THREE.RGBAFormat);
  tex.flipY = false; // baked into the pixels above
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.ClampToEdgeWrapping; // the sphere's native UVs stay in [0,1] — no repeat needed
  tex.wrapT = THREE.ClampToEdgeWrapping; // poles must not wrap
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

async function buildLand(globe: GeoViewHost) {
  try {
    const res = await fetch("/land-110m.json");
    const topo = await res.json();
    const land = feature(topo, topo.objects.land);

    // Each coastline ring becomes a raised cliff "wall" (a vertical ribbon from ocean level R
    // up to the plateau top R+LAND_H) — GEOMETRY, because the walls are the hologram's defining
    // stroke and need real 3D presence for the rim shader. The land SURFACE inside the walls is
    // NOT geometry any more: it's a full sphere at the same top radius wearing the land-mask
    // texture (see makeLandTexture) with alphaTest cutting the ocean away — the standard
    // texture-mask globe technique. (The previous earcut/unwrap plateau triangulation rendered
    // its complement on part of the world — a defect masked for months by the old near-black
    // body sphere behind it — and was fragile at the seam/poles; the masked sphere kills the
    // whole bug class: no unwrap, no pole caps, no T-junctions, mipmapped anti-aliasing.)
    const top = R + LAND_H;
    // Start the cliff base just ABOVE the sea (the opaque, faceted sphere at R dips ~0.02 below
    // R between facets) so the additive wall never z-fights / pokes through the waterline. The
    // base is faded to transparent anyway, so the visible rim is unchanged.
    const wallBase = R + 0.04;
    const wallPos: number[] = []; // wall ribbon vertices (two triangles per ring segment)
    const addRing = (ring: number[][]) => {
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
    // Walls for every ring (outer coasts + hole rims). The fill is textural — see below.
    for (const f of land.features as LandFeature[]) {
      const polys = (f.geometry.type === "Polygon"
        ? [f.geometry.coordinates]
        : f.geometry.coordinates) as number[][][][];
      for (const rings of polys) rings.forEach(addRing);
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
          // The coastal cliffs use the SURFACE hue (uColor = --primary) and are kept DIM so they read
          // as a soft ridge blending into the surface, not a bright rim — height alone gives the
          // relief. A barely-there top-edge highlight keeps the coastline legible.
          float edge = smoothstep(0.6, 1.0, t);
          gl_FragColor = vec4(uColor * (0.03 + 0.13 * e + 0.15 * edge), min(1.0, e * 0.72) * uOpacity);
        }`,
      // Single-sided so only cliffs whose face points toward the camera draw: a
      // continent's near + side edges show, its far edge (behind the filled plateau)
      // is culled instead of glowing through the translucent fill. BackSide because the
      // topojson ring winding puts the outward cliff face on the geometry's back side.
      transparent: true, depthWrite: false, side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
    });
    globe.group.add(new THREE.Mesh(wallGeo, wallMat));

    // HOLOGRAPHIC LAND. The surface is the geo view's "ledger pane": a faint, CALM structural skin
    // in the SAME accent hue as the ledger tiles (globe.geoColor = --primary), so the two views match
    // by construction — calm comes from low brightness, not a bespoke tone. It's a plain sphere at the
    // wall-top radius wearing the land texture ADDITIVELY: sea texels are pure black (they add nothing
    // and simply don't exist on screen), land carries the soft glass glow + 3° grid in luminance, and
    // the HUE rides the material colour, kept dim (×1.0) so the grid stays a calm wash, not neon. No
    // lighting model — the hologram must read identically on both hemispheres (MeshBasicMaterial); no
    // depthWrite (additive light occludes nothing); FrontSide so the far hemisphere is culled and the
    // hologram stays readable (walls + graticule still give the far side its faint see-through
    // presence). Static — reduced-motion safe.
    const landTex = makeLandTexture(land.features as LandFeature[]);
    const landMat = new THREE.MeshBasicMaterial({
      map: landTex,
      color: new THREE.Color(globe.geoColor),
      blending: THREE.AdditiveBlending, depthWrite: false,
      transparent: true, opacity: 0, side: THREE.FrontSide,
    });
    globe.landFillMat = landMat;
    // base = the resting ADDITIVE strength of the land surface (0..1) — lower = more transparent.
    // Kept well below 1 so the globe reads as a faint calm hologram, the coastal walls the accent.
    globe.geoFades.push({ mat: globe.landFillMat, base: 0.45 });
    globe.landFillMesh = new THREE.Mesh(new THREE.SphereGeometry(top, 96, 64), globe.landFillMat);
    globe.landFillMesh.renderOrder = -1; // before the rim/heatmap/nodes
    globe.landFillMesh.visible = false;  // revealed once the globe materialises (setMorph)
    globe.group.add(globe.landFillMesh);
  } catch {
    /* graticule-only fallback */
  }
}
