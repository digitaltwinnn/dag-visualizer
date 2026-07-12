import * as THREE from "three";
import { feature } from "topojson-client";
import { R, LAND_H, latLonToVec3 } from "../../domain/geoLayout";
import { ringsToSegments, type Ring } from "../../domain/countryShape";

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
  // Shared FACING uniform (camera direction in the globe's local frame — Globe copies _camN in
  // each frame): the graticule + coastal walls dim their far-hemisphere fragments through it,
  // so the see-through backside stays present but visibly "behind" (user: front/back ambiguity).
  facingUniform?: { value: THREE.Vector3 };
  // Shared CLOSENESS uniform (0 = overview, 1 = country/node zoom; Globe writes it from the
  // camera altitude each frame): up close the coastal walls tighten to a crisp rim (the soft
  // ridge read as fuzz at node range, user) and the far-side see-through drops to near-nothing
  // (looking THROUGH the globe distracted at close range, user).
  closeUniform?: { value: number };
  // The polar compass roses' materials, faded per frame by BOTH the morph fade and the pole's
  // own facing (a rose on the far side dims hard — the depth cue that killed the ambiguity).
  poleRoses?: Array<{ mats: Array<THREE.Material & { opacity: number }>; bases: number[]; sign: number }>;
  // Per-country geometries from the countries topology (world-atlas numeric id → GeoJSON
  // geometry) — the country drill's border + shape-based framing read these. Async (set once
  // the topology loads); `onCountriesReady` lets the owner re-assert a drill made before then.
  countryGeoms?: Map<string, { type: string; coordinates: unknown }>;
  countryBorder?: { mesh: THREE.LineSegments; fade: GeoFadeEntry };      // the committed drill
  hoverCountryBorder?: { mesh: THREE.LineSegments; fade: GeoFadeEntry }; // the hover preview (may coexist)
  // The drilled country's FILL boost: a low-res equirect mask texture sampled by the land-fill
  // shader — inside the mask the additive land glass brightens (see setCountryFillMask).
  countryMaskUniforms?: { uCountryMask: { value: THREE.Texture }; uMaskBoost: { value: number } };
  onCountriesReady?: () => void;
}

// HOLOGRAPHIC GLOBE: there is deliberately NO opaque body sphere and NO atmosphere halo.
// The coastal wall rim is the defining stroke, the land glass + micro-grid carry the surface,
// and the ocean is simply the void between coastlines — the far side shows through dimly
// (far-side node discs still vanish via discFall; the far graticule/walls reading through IS
// the hologram). All surface colours come from config.COLORS' geo family (scene structural
// lane — never identity-tinted).
export function buildGeoView(globe: GeoViewHost): void {
  buildGraticule(globe);
  buildCompassRose(globe);
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
  // The sea graticule (grid lines OVER the ocean): subtle so the continents (the raised, gridded
  // land) clearly lead — lifted from 0.03 (user: a bit more present on the water). Accent hue.
  const mat = new THREE.LineBasicMaterial({ color: globe.geoColor, transparent: true, opacity: 0 });
  // FACING dim: far-hemisphere fragments fade to ~30% so the backside reads as behind the globe
  // instead of blending with the front (the hologram keeps its see-through presence, quieter).
  // The floor drops to near-zero as the camera closes in (uClose) — at country/node range the
  // far side showing through read as visual noise (user).
  globe.facingUniform = { value: new THREE.Vector3(0, 0, 1) };
  globe.closeUniform = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uCamN = globe.facingUniform!;
    sh.uniforms.uClose = globe.closeUniform!;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vDir;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvDir = normalize(position);");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uCamN;\nuniform float uClose;\nvarying vec3 vDir;")
      .replace(
        "#include <color_fragment>",
        "#include <color_fragment>\ndiffuseColor.a *= mix(mix(0.3, 0.04, uClose), 1.0, smoothstep(-0.35, 0.2, dot(vDir, uCamN)));",
      );
  };
  globe.geoFades.push({ mat, base: 0.06 });
  globe.group.add(new THREE.LineSegments(geo, mat));
}

// POLAR COMPASS ROSE — the subtle orientation cue (user: the tilted country/node poses read
// disorienting without knowing where north is). E/W only exist relative to a point on a sphere,
// so the honest anchors are the POLES. The mark is a slender FOUR-POINT STAR rose (long cardinal
// points, short diagonal spokes, one hairline ring crossing the waists) — deliberately NOT the
// ring-and-ruler-ticks dial the Snapshots station dials use (user: the first draft read as the
// same instrument). Lives in `globe.group` (rotates + tilts WITH the globe — a truthful scene
// marker, not HUD chrome), structural accent, and fades by BOTH the morph fade and the pole's
// FACING (a far-side rose dims hard — the front/back depth cue). Construction-time only.
function buildCompassRose(globe: GeoViewHost) {
  const R_TIP = 1.6, R_WAIST = 0.3, R_DIAG = 0.8, R_RING = 1.0, SEG = 72;
  const pts: THREE.Vector3[] = [];
  const at = (a: number, r: number) => new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    // the star point: tip → the two 45° waist corners (a slim diamond blade)
    pts.push(at(a, R_TIP), at(a + Math.PI / 4, R_WAIST));
    pts.push(at(a, R_TIP), at(a - Math.PI / 4, R_WAIST));
    // short plain diagonal spoke between the blades
    pts.push(at(a + Math.PI / 4, R_WAIST), at(a + Math.PI / 4, R_DIAG));
  }
  for (let i2 = 0; i2 < SEG; i2++) {
    const a0 = (i2 / SEG) * Math.PI * 2, a1 = ((i2 + 1) / SEG) * Math.PI * 2;
    pts.push(at(a0, R_RING), at(a1, R_RING));
  }
  const dialGeo = new THREE.BufferGeometry().setFromPoints(pts);

  // A micro cardinal letter on a small flat plane at the rose's centre — canvas-texture text
  // (the ledger _makeLabel idiom), colour derived from the structural accent, additive so the
  // dark canvas adds nothing.
  const makeLetter = (text: string): THREE.Mesh => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const g = cv.getContext("2d")!;
    g.fillStyle = new THREE.Color(globe.geoColor).getStyle();
    g.font = "600 84px ui-monospace, monospace"; // no webfont is loaded — name the real stack
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(text, 64, 68);
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    return new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), mat);
  };

  // One rose per pole. The north pole is ocean (surface at R); the south pole sits on the
  // Antarctica plateau (R+LAND_H) — each floats a little above its own surface. Bases kept
  // QUIET (user: the first draft read brighter than the rest of the hologram).
  const poles: Array<{ y: number; letter: string; dial: number; text: number; flipX: number; sign: number }> = [
    { y: R + 0.5, letter: "N", dial: 0.16, text: 0.24, flipX: -Math.PI / 2, sign: 1 },
    { y: -(R + LAND_H + 0.5), letter: "S", dial: 0.09, text: 0.14, flipX: Math.PI / 2, sign: -1 },
  ];
  globe.poleRoses = [];
  for (const pole of poles) {
    const mat = new THREE.LineBasicMaterial({
      color: globe.geoColor, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const dial = new THREE.LineSegments(dialGeo, mat);
    dial.position.y = pole.y;
    globe.group.add(dial);

    const letter = makeLetter(pole.letter);
    letter.rotation.x = pole.flipX; // lie flat, readable from outside the pole
    letter.position.y = pole.y;
    globe.group.add(letter);

    // NOT in geoFades: Globe fades these itself (morph fade × pole facing) each frame.
    globe.poleRoses.push({
      mats: [mat, letter.material as THREE.MeshBasicMaterial],
      bases: [pole.dial, pole.text],
      sign: pole.sign,
    });
  }
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
  g.fillStyle = "rgb(14,14,14)"; // the surface FILL — a faint solid wash (user-tuned up when the tile
                                 // grid was removed) so the land reads present, not void; on screen it
                                 // lands at texel × base 0.45 additive of the geo cyan (~5-6%)
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

  // NO land tiles (user decision, after A/B): the land is a SIMPLE FILL — the near-transparent
  // wash + the glowing coastal walls carry the landmass, and the sea graticule (which spans the
  // whole sphere, water and behind the land) supplies the digital-globe line work.

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
    // countries-110m carries BOTH the land union (`objects.land` — the plateau/walls build,
    // identical arcs to the old land-110m file) AND per-country geometries (`objects.countries`
    // — the drill border + shape-based framing), so one fetch serves both.
    const res = await fetch("/countries-110m.json");
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
    // The wall material shares the graticule's facing + closeness uniforms (built first in
    // buildGeoView).
    const wallUniforms = {
      ...globe.landWallUniforms,
      uCamN: globe.facingUniform ?? { value: new THREE.Vector3(0, 0, 1) },
      uClose: globe.closeUniform ?? { value: 0 },
    };
    const wallMat = new THREE.ShaderMaterial({
      uniforms: wallUniforms,
      vertexShader: `
        varying float vH; varying vec3 vDir;
        void main() {
          vH = length(position); // distance from the globe centre
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uBase; uniform float uTop; uniform float uOpacity;
        uniform vec3 uCamN; uniform float uClose;
        varying float vH; varying vec3 vDir;
        void main() {
          float t = clamp((vH - uBase) / (uTop - uBase), 0.0, 1.0);
          // Gently non-linear ramp (a blend of linear + quadratic): dim along the ocean line,
          // strengthening toward the top rim — so the rim reads as an edge, not a glowing band.
          float e = t * (0.4 + 0.6 * t);
          // The coastal cliffs use the SURFACE hue (uColor = --primary), dim at the base so they read
          // as a soft ridge blending into the surface. The TOP EDGE carries a clearly brighter
          // highlight (user-tuned: shorter walls, brighter rim) so the coastline stays legible.
          // Up close (uClose) the soft ridge read as FUZZ (user): the body glow damps down and the
          // rim band tightens + brightens, so the coastline resolves into a crisp line.
          float body = (0.03 + 0.13 * e) * mix(1.0, 0.4, uClose);
          float edge = smoothstep(mix(0.65, 0.86, uClose), 1.0, t) * mix(0.24, 0.36, uClose);
          // FACING dim: far-hemisphere cliffs stay visible (the hologram's see-through
          // presence) but clearly BEHIND — and near-invisible at close range (uClose), where
          // seeing through the globe distracted (user). See GeoViewHost.facingUniform/closeUniform.
          float facing = mix(mix(0.35, 0.04, uClose), 1.0, smoothstep(-0.35, 0.15, dot(vDir, uCamN)));
          gl_FragColor = vec4(uColor * (body + edge), min(1.0, e * mix(0.72, 0.6, uClose)) * uOpacity * facing);
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
    // SELECTED-COUNTRY FILL BOOST (user, 2026-07-11): the drilled country's interior firms up
    // while the rest of the world keeps the calm resting glass. A second equirect MASK texture
    // (rasterized per drill — setCountryFillMask) rides the same UVs as the land map; inside
    // the mask the additive luminance multiplies up. Cleared = uMaskBoost 1 (a hard no-op, so
    // a stale mask can never show through).
    const blank = document.createElement("canvas");
    blank.width = blank.height = 1;
    const blankTex = new THREE.CanvasTexture(blank);
    blankTex.colorSpace = THREE.NoColorSpace;
    globe.countryMaskUniforms = { uCountryMask: { value: blankTex }, uMaskBoost: { value: 1 } };
    landMat.onBeforeCompile = (sh) => {
      sh.uniforms.uCountryMask = globe.countryMaskUniforms!.uCountryMask;
      sh.uniforms.uMaskBoost = globe.countryMaskUniforms!.uMaskBoost;
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform sampler2D uCountryMask;\nuniform float uMaskBoost;")
        .replace(
          "#include <map_fragment>",
          // THRESHOLDED sample: linear filtering smears the rasterized mask across many
          // screen pixels at node-level zoom (the fill faded toward the border, user
          // 2026-07-12) — the tight smoothstep snaps the boost to a crisp in/out boundary
          // with sub-texel antialiasing, so the fill reads as a proper fill to the edge.
          "#include <map_fragment>\n\tdiffuseColor.rgb *= mix(1.0, uMaskBoost, smoothstep(0.4, 0.6, texture2D(uCountryMask, vMapUv).r));",
        );
    };
    globe.landFillMat = landMat;
    // base = the resting ADDITIVE strength of the land surface (0..1) — lower = more transparent.
    // Kept well below 1 so the globe reads as a faint calm hologram, the coastal walls the accent.
    globe.geoFades.push({ mat: globe.landFillMat, base: 0.45 });
    globe.landFillMesh = new THREE.Mesh(new THREE.SphereGeometry(top, 96, 64), globe.landFillMat);
    globe.landFillMesh.renderOrder = -1; // before the rim/nodes
    globe.landFillMesh.visible = false;  // revealed once the globe materialises (setMorph)
    globe.group.add(globe.landFillMesh);

    // COUNTRY BORDERS — TWO LineSegments, rebuilt per drill/hover change (event-driven; see
    // setCountryBorder): one for the COMMITTED drill, one for the HOVER preview, so hovering
    // another country still previews while a drill is lit (user — the single shared border made
    // committed-wins eat the preview). Invisible at rest (the surface stays clean). Structural
    // accent, additive like the coastal walls so the hairline glows over the land glass; the
    // geoFades entries give them the surface's morph gating for free (`base` IS the level).
    const makeBorder = () => {
      const mat = new THREE.LineBasicMaterial({
        color: globe.geoColor,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.LineSegments(new THREE.BufferGeometry(), mat);
      mesh.visible = false;
      const fade = { mat, base: 0 };
      globe.geoFades.push(fade);
      globe.group.add(mesh);
      return { mesh, fade };
    };
    globe.countryBorder = makeBorder();
    globe.hoverCountryBorder = makeBorder();

    // Per-country geometry index for the border + framing (world-atlas numeric id → geometry).
    const countries = feature(topo, topo.objects.countries) as unknown as {
      features: Array<{ id?: string | number; geometry: { type: string; coordinates: unknown } }>;
    };
    globe.countryGeoms = new Map();
    for (const f of countries.features)
      if (f.id != null) globe.countryGeoms.set(String(f.id), f.geometry);
    globe.onCountriesReady?.();
  } catch {
    /* graticule-only fallback */
  }
}

// How much the drilled country's land glass brightens inside the mask. The land fill's
// resting additive contribution is TINY (texel luminance ~0.055 × the 0.45 base), so small
// multipliers are imperceptible — the readable range starts ~×6 (tuned live: ×8 firms the
// selection without going neon; ×12 read as a hot plate competing with the node stacks).
const MASK_BOOST = 8.0;

// Rasterize the drilled country's rings into a low-res equirect mask and hand it to the
// land-fill shader; null clears (uMaskBoost 1 = hard no-op). Event-driven — one Canvas2D
// draw per drill change, never per frame. Same projection + seam strategy as the land
// texture: per-ring longitude unwrap and a triple draw at x−W / x / x+W, evenodd for holes.
export function setCountryFillMask(globe: GeoViewHost, rings: Ring[] | null): void {
  const u = globe.countryMaskUniforms;
  if (!u) return; // land not built yet — the drill re-asserts via onCountriesReady
  if (!rings?.length) {
    u.uMaskBoost.value = 1;
    return;
  }
  const W = 2048, H = 1024; // enough texels that the shader's threshold lands ON the border
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#fff";
  const px = (lon: number, lat: number): [number, number] =>
    [((lon + 180) / 360) * W, ((90 - lat) / 180) * H];
  const unwrap = (ring: Ring): Ring => {
    let lon = ring[0][0];
    const out: Ring = [[lon, ring[0][1]]];
    for (let i = 1; i < ring.length; i++) {
      let d = ring[i][0] - ring[i - 1][0];
      if (d > 180) d -= 360; else if (d < -180) d += 360;
      lon += d;
      out.push([lon, ring[i][1]]);
    }
    return out;
  };
  for (const xOff of [-W, 0, W]) {
    g.beginPath();
    for (const raw of rings) {
      const ring = unwrap(raw);
      const [x0, y0] = px(ring[0][0], ring[0][1]);
      g.moveTo(x0 + xOff, y0);
      for (let i = 1; i < ring.length; i++) {
        const [x, y] = px(ring[i][0], ring[i][1]);
        g.lineTo(x + xOff, y);
      }
      g.closePath();
    }
    g.fill("evenodd");
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  const old = u.uCountryMask.value;
  u.uCountryMask.value = tex;
  u.uMaskBoost.value = MASK_BOOST;
  old.dispose(); // event-driven swap — never per frame
}

// Show a country border (`which`: the committed drill or the hover preview) for `rings` at
// `level` opacity (0 hides it). The geometry rebuild is event-driven — once per country
// hover/drill change, never per frame.
export function setCountryBorder(
  globe: GeoViewHost,
  which: "drill" | "hover",
  rings: Ring[] | null,
  level: number,
): void {
  const b = which === "drill" ? globe.countryBorder : globe.hoverCountryBorder;
  if (!b) return; // topology not loaded yet — onCountriesReady re-asserts
  if (!rings?.length || level <= 0) {
    b.fade.base = 0;
    b.mesh.visible = false;
    return;
  }
  b.mesh.geometry.dispose();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(ringsToSegments(rings), 3));
  b.mesh.geometry = geo;
  b.mesh.visible = true;
  b.fade.base = level;
}
