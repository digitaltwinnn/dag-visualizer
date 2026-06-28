// Owns the single shared set of validator nodes and morphs them between two
// layouts driven by `morph` (0 = Hypergraph shells, 1 = geographic globe):
//   - Hypergraph: fibonacci shells around the core (L0 inner, L1 outer).
//   - Geography:  each node at its real lat/lon on the globe surface.
// The SAME node objects move between the two — they never disappear/reappear.
// The globe surface, coastlines, heatmap and arcs fade in via opacity as nodes
// arrive, so node radii always match the (full-size, non-scaled) globe.

import * as THREE from "three";
import { COLORS, METAGRAPHS, metaAnchor } from "./config.js";
import * as geoStats from "./geoStats.js";
import { buildGlobeSurface } from "./globeSurface.js";
import { R, LAND_H, latLonToVec3 } from "./geoMath.js";

const Z_AXIS = new THREE.Vector3(0, 0, 1);
const DIM = new THREE.Color(0x223046);
const _geoVec = new THREE.Vector3(); // scratch for the morph-fly interpolation
const _dummy = new THREE.Object3D(); // reused to compose per-instance matrices
const _vec = new THREE.Vector3();
const _qSpin = new THREE.Quaternion();   // hypergraph tumble
const _qRadial = new THREE.Quaternion(); // outward-facing (globe) orientation
const _col = new THREE.Color();          // scratch colour for dim recolouring
const _focusMat = new THREE.Matrix4();   // scratch for reading an instance's live transform
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (m) => m * m * (3 - 2 * m);
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // fibonacci-shell / phyllotaxis spacing

// A node's role set, shared by the DAG core + metagraph nodes. A node (one machine) can run
// several layers; "L0" is a ROLE, not a node kind — so the tooltip names the NETWORK and
// shows the layer(s) as tags (a hybrid lists every one it runs, which is why hovering it
// lights more than one shell). Keyed by node, so every shell of the same machine reads alike.
const nodeRoles = (node, fallback) =>
  node && node.roles && node.roles.length ? node.roles : [fallback];

// Travelling-packet arcs: each is a short comet that hops node -> node.
const ARC_TAIL = 8;         // points making up each comet
const ARC_TAIL_FRAC = 0.3;  // comet length as a fraction of its current arc
const ARC_SAMPLES = 24;     // bezier samples baked per hop

// View-dependent disc falloff: `facing` = disc-normal · camera-direction (1 = dead
// on, 0 = edge-on at the limb). Discs shrink out before they go edge-on so the
// limb doesn't turn into a cluttered band of slivers.
const discFall = (facing) => THREE.MathUtils.smoothstep(facing, 0.12, 0.42);

// Deterministically fan co-located nodes out around their shared point so the
// flat discs don't pile on top of each other (city-level geolocation puts a whole
// datacenter at one coordinate). Groups the given unit directions by proximity
// and lays each group out as a phyllotaxis (sunflower) disc on the local tangent
// plane. Mutates the vectors in place; returns the proximity clusters (centre +
// count + angular spread) so the density heatmap can encircle each one.
const _sx = new THREE.Vector3(), _sy = new THREE.Vector3(), _sh = new THREE.Vector3();
function spreadCoLocated(dirs, { groupDeg = 0.8, spacingDeg = 0.32, maxDeg = 2.3 } = {}) {
  const cosT = Math.cos(groupDeg * Math.PI / 180);
  const clusters = [];
  for (const d of dirs) {
    let best = null;
    for (const c of clusters) if (c.center.dot(d) > cosT) { best = c; break; }
    if (best) { best.members.push(d); best.sum.add(d); best.center.copy(best.sum).normalize(); }
    else clusters.push({ center: d.clone(), sum: d.clone(), members: [d] });
  }
  for (const c of clusters) {
    const K = c.members.length;
    c.count = K;
    c.spread = 0;
    if (K < 2) continue;
    const ctr = c.center;
    // build a tangent basis at the cluster centre
    _sh.set(Math.abs(ctr.y) < 0.92 ? 0 : 1, Math.abs(ctr.y) < 0.92 ? 1 : 0, 0);
    _sx.crossVectors(_sh, ctr).normalize();
    _sy.crossVectors(ctr, _sx).normalize();
    // spread grows with sqrt(count) to keep node spacing roughly constant
    const spread = Math.min(maxDeg, spacingDeg * Math.sqrt(K)) * Math.PI / 180;
    c.spread = spread;
    c.members.forEach((d, k) => {
      const rr = spread * Math.sqrt((k + 0.5) / K);
      const th = k * GOLDEN_ANGLE;
      d.copy(ctr)
        .addScaledVector(_sx, Math.cos(th) * rr)
        .addScaledVector(_sy, Math.sin(th) * rr)
        .normalize();
    });
  }
  return clusters;
}


export class Globe {
  constructor(scene, layers = null, camera = null) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.layers = layers; // for gluing metagraph nodes to their orbiting hubs
    this.camera = camera; // for the view-dependent disc falloff at the limb
    this._camN = new THREE.Vector3(); // camera direction in this group's local frame

    this.pickables = [];   // the validator node discs (shared across views)
    this.nodes = [];
    this.geoFades = [];    // { mat, base } surface materials faded by morph
    this.morph = 0;
    this.clock = 0;
    // null = idle spin; { from, to, fromX, toX, t, dur } = ease-in-out to a focus
    // orientation (y = longitude swing, x = latitude tilt so high-lat nodes come into view).
    this.spin = null;
    this.countryFilter = null; // cc to drill into (combined with the network filter), or null
    this.countryMix = 0;       // eased 0..1: how strongly the country dim is applied
    this.l0Count = 0;
    this.l1Count = 0;
    // The raised coastal wall rim — a fixed soft ice-blue (eased each frame, but the target is held).
    this._edgeColor = new THREE.Color(0x9ccad6);
    this._edgeTarget = new THREE.Color(0x9ccad6);

    // Highlight/dim state driven by the "Understand the network" panel: each
    // validator layer eases its own dim level (0 = bright, 1 = dimmed) so the
    // unselected nodes fade their glow and recolour toward dark grey.
    this.dim = { l0: 0, l1: 0 };
    this.dimTarget = { l0: 0, l1: 0 };
    this._appliedDim = { l0: -1, l1: -1 }; // last dim baked into the colour buffer

    // Real metagraph validator nodes, plotted on the globe (geography view only).
    // `filter` drives both these and the global validators: "all" | "l0" | "l1"
    // | <metagraphId>. Each metagraph node eases its own dim toward dimTarget.
    this.metaNodes = [];
    this.metaList = [];
    this.metaSphere = null;   // glowing spheres (Hypergraph cluster)
    this.metaDisc = null;  // flat discs lying on the globe surface (geography)
    this.filter = "all";
    // Hover-pairing: the node id under the cursor — every instance of that machine (its
    // layer-shell siblings) glows, so a hybrid's points across the shells read as ONE machine.
    this._hoverNodeId = null;
    this._selectedNodeId = null; // a clicked node card — its shells stay lit until cleared

    this.nodeGroup = new THREE.Group();
    this.group.add(this.nodeGroup);

    // The geo globe surface (body, graticule, atmosphere, continents) is built in globeSurface.js
    // — it sets the handles (sphereMesh / atmoUniforms / landWallUniforms / landFillMesh) back on
    // `this` for the morph/fade loop, and pushes its fade materials into this.geoFades.
    buildGlobeSurface(this);
  }

  // The wall is always the fixed ice-blue — a metagraph's colour on it read as either too dominant
  // (bright rim) or not nice (faded base), so the rim no longer follows the active metagraph. Kept
  // as a setter so the Engine caller doesn't need to change.
  setEdgeColor(_color) {
    this._edgeTarget.set(0x9ccad6);
  }

  // -------------------------------------------------- build the shared nodes
  // The ~320 validators are drawn as two InstancedMeshes that share the same
  // per-instance colour (aBase) and animated glow (aEmissive):
  //   - instSphere:  a glowing sphere, shown in the Hypergraph view
  //   - instDisc: a flat circle lying on the globe, shown in the geography view
  // They cross-fade as the nodes fly between layouts, so each view keeps its
  // ideal shape. `this.nodes` holds plain data records, not meshes.
  // `dagCore` = the DAG modelled as a metagraph-shaped core (api.js `_buildDagCore`): one
  // node per MACHINE, each with `roles` (a hybrid runs several layers). We plot one instance
  // per machine (de-duped — no more "same IP, two rows"), in its primary shell; counts are by
  // ROLE, so a hybrid still counts toward both L0 and L1.
  setNodes(dagCore, geoMap) {
    this._disposeNodes();
    this.nodes = [];
    const machines = (dagCore && dagCore.nodes) || [];
    // Per-(machine, role) instances: a machine appears in EACH layer shell it runs, so the
    // L0 / cL1 shells match the counts. The GLOBE still shows one dot per machine — only the
    // primary instance is geo-visible (siblings fly in during the morph, then merge into it).
    const l0List = machines.filter((m) => m.roles && m.roles.includes("l0"));
    const cl1List = machines.filter((m) => m.roles && m.roles.includes("cl1"));
    this.l0Count = l0List.length;
    this.l1Count = cl1List.length;
    const total = l0List.length + cl1List.length;

    // Shared per-instance buffers (one colour + one glow value per node), each
    // wrapped by an attribute on both geometries so the two meshes stay in sync.
    const baseArr = new Float32Array(total * 3);
    const emiArr = new Float32Array(total).fill(0.5);
    const picks = new Array(total);

    const sphereGeo = (this._sphereGeo ||= new THREE.SphereGeometry(0.5, 16, 12)).clone();
    const discGeo = (this._discGeo ||= new THREE.CircleGeometry(1, 24)).clone();
    const wrap = (geo) => {
      geo.setAttribute("aBase", new THREE.InstancedBufferAttribute(baseArr, 3));
      const aE = new THREE.InstancedBufferAttribute(emiArr, 1);
      aE.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute("aEmissive", aE);
      return aE;
    };
    this.aEmiSphere = wrap(sphereGeo);
    this.aEmiDisc = wrap(discGeo);

    const mkMesh = (geo, side) => {
      const mat = this._makeNodeMaterial();
      mat.side = side;
      const mesh = new THREE.InstancedMesh(geo, mat, total);
      mesh.frustumCulled = false; // instances span the whole scene; base bounds would mis-cull
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.userData.picks = picks;
      this.nodeGroup.add(mesh);
      return mesh;
    };
    this.instSphere = mkMesh(sphereGeo, THREE.FrontSide);
    this.instDisc = mkMesh(discGeo, THREE.DoubleSide); // visible even at the globe's limb
    this.baseArr = baseArr;
    this.emiArr = emiArr;
    this.pickables = [this.instSphere];

    const seen = new Set();
    let idx = 0;
    const net = (dagCore && dagCore.name) || "DAG";
    const place = (list, role, kind, color, rad, flatten) => {
      const n = list.length;
      list.forEach((node, i) => {
        const ready = node.state === "Ready";
        // The first instance of a machine is its geo "primary" (the one dot on the globe);
        // later instances (its other layer shells) are hybrid siblings, hidden in geo.
        const primary = node.id == null || !seen.has(node.id);
        if (node.id != null) seen.add(node.id);
        const col = new THREE.Color(color);
        if (!ready) col.lerp(DIM, 0.55);

        // hypergraph fibonacci-shell position
        const y = 1 - (i / Math.max(1, n - 1)) * 2;
        const rr = Math.sqrt(Math.max(0, 1 - y * y));
        const phi = i * GOLDEN_ANGLE;
        const hyperPos = new THREE.Vector3(
          Math.cos(phi) * rr * rad, y * rad * flatten, Math.sin(phi) * rr * rad
        );

        // geographic position (real location; co-located nodes are fanned out
        // deterministically below so the discs don't stack)
        const g = geoMap[node.ip];
        const geoDir = g ? latLonToVec3(g.lat, g.lon, 1).normalize() : null;

        const u = {
          index: idx, layer: role, roles: node.roles || [role], nodeId: node.id, geoPrimary: primary, ready, base: col.clone(),
          hyperPos, hyperDir: hyperPos.clone().normalize(), hyperRadius: hyperPos.length(),
          geoDir, trueDir: geoDir ? geoDir.clone() : null, geoRadius: R + LAND_H + 0.02, noGeo: !g,
          // hyperSize = sphere diameter (Hypergraph); geoSize = circle radius (globe). A hybrid
          // sibling has geoSize 0 → no disc on the globe (one dot per machine).
          hyperSize: 0.55 * (ready ? 1 : 0.78), geoSize: primary ? 0.06 * (ready ? 1 : 0.78) : 0,
          azimuth: Math.atan2(hyperPos.z, hyperPos.x), twinkle: Math.random() * 6.2831,
          spinAxis: new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize(),
          spinSpeed: 0.3 + Math.random() * 0.5, spinPhase: Math.random() * 6.2831,
          pick: {
            kind, title: net, roles: nodeRoles(node, role), node, geo: g || null,
            sub: g ? `${g.city ? g.city + ", " : ""}${g.country}` : (node.ip ? `${node.state} · ${node.ip}` : ""),
          },
        };
        baseArr[idx * 3] = col.r; baseArr[idx * 3 + 1] = col.g; baseArr[idx * 3 + 2] = col.b;
        picks[idx] = u.pick;
        this.nodes.push(u);
        idx++;
      });
    };
    place(l0List, "l0", "l0", COLORS.l0, 8, 1.0);
    place(cl1List, "cl1", "l1", COLORS.l1, 14, 0.78);
    this.instSphere.geometry.getAttribute("aBase").needsUpdate = true;
    this.instDisc.geometry.getAttribute("aBase").needsUpdate = true;

    // Fan out the filter-active nodes and (re)build the density rings + arcs.
    this._relayoutGeo();
    this.setMorph(this.morph); // place at current morph
  }

  // MeshStandardMaterial patched so each instance gets its own colour and an
  // animated emissive intensity — neither is per-instance on the stock material.
  // aBase tints the lit diffuse; emissive becomes aBase * aEmissive.
  _makeNodeMaterial() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.5, metalness: 0.2,
    });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec3 aBase;\nattribute float aEmissive;\nvarying vec3 vBase;\nvarying float vEmi;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBase = aBase;\nvEmi = aEmissive;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vBase;\nvarying float vEmi;")
        .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= vBase;")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance = vBase * vEmi;");
    };
    return mat;
  }

  _disposeNodes() {
    for (const mesh of [this.instSphere, this.instDisc]) {
      if (!mesh) continue;
      this.nodeGroup.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.dispose();
    }
    this.instSphere = this.instDisc = null;
  }

  // -------------------------------------------------- heatmap (geo clusters)
  // `clusters` come from spreadCoLocated: { center, count, spread (radians) }.
  _buildHeatmap(clusters) {
    if (this.heatGroup) { this.heatGroup.children.forEach((s) => s.material.dispose()); this.group.remove(this.heatGroup); }
    this.heatGroup = new THREE.Group();
    this.group.add(this.heatGroup);
    if (!clusters || !clusters.length) return;

    // Density 0..1 on a log scale, anchored so a lone node (count 1 -> log2(1)=0)
    // reads as sparse rather than maxing the scale out to "hot". Degenerate case
    // (every cluster a singleton) -> logMax 0 -> all sparse.
    const logMax = Math.log2(Math.max(...clusters.map((c) => c.count)));
    const tex = (this._glowTex ||= makeGlowTexture());
    const fillGeo = (this._heatGeo ||= new THREE.PlaneGeometry(1, 1));
    const ringGeo = (this._ringGeo ||= new THREE.RingGeometry(0.9, 1.0, 40));

    for (const c of clusters) {
      const t = logMax > 0 ? Math.min(1, Math.log2(c.count) / logMax) : 0;
      const color = heatColor(t);
      const pos = c.center.clone().multiplyScalar(R + LAND_H + 0.01);
      const quat = new THREE.Quaternion().setFromUnitVectors(Z_AXIS, c.center);
      // ring encircles the fanned-out cluster (+ a small margin); lone nodes get
      // a modest density dot.
      const radius = Math.max(0.1 + 0.07 * t, (c.spread || 0) * R + 0.18);

      const glow = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({
        map: tex, color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
      glow.userData.baseOpacity = 0.05 + 0.08 * t;
      glow.scale.setScalar(radius * 1.7); glow.position.copy(pos); glow.quaternion.copy(quat);
      this.heatGroup.add(glow);

      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
      ring.userData.baseOpacity = 0.12 + 0.3 * t;
      ring.scale.setScalar(radius); ring.position.copy(pos); ring.quaternion.copy(quat);
      this.heatGroup.add(ring);
    }
  }

  // ---------------------------------------------- arcs (travelling packets)
  // The connection "arcs" are a swarm of independent packets. Each is a short
  // comet that travels one curved hop between two nodes, flashes the node it
  // reaches, pauses briefly, then picks a nearby node and hops on — so the web is
  // never a fixed set of lines but live, self-routing traffic. All packets share
  // ONE LineSegments (a single draw call); only their head/tail positions (and a
  // colour on each hop) are rewritten on the CPU each frame — a few hundred floats.
  _buildArcs(pts) {
    if (this.arcGroup) { this.arcGroup.traverse((o) => o.material && o.material.dispose()); this.group.remove(this.arcGroup); }
    this.arcGroup = new THREE.Group();
    this.group.add(this.arcGroup);
    this.arcMat = null;
    this.arcAgents = null;
    this.arcPool = pts; // nodes the packets route between ({ dir, node })
    if (pts.length < 2) return;

    const N = Math.min(40, Math.max(6, Math.round(pts.length * 0.8)));
    const vertsPer = (ARC_TAIL - 1) * 2; // LineSegments: one span = two vertices
    const total = N * vertsPer;
    const positions = new Float32Array(total * 3);
    const aTail = new Float32Array(total);
    const colors = new Float32Array(total * 3);
    this._cometPts = this._cometPts || Array.from({ length: ARC_TAIL }, () => new THREE.Vector3());
    this.arcPos = positions;
    this.arcCol = colors;

    this.arcAgents = [];
    for (let i = 0; i < N; i++) {
      const from = pts[(Math.random() * pts.length) | 0];
      const ag = {
        from, to: null, curve: null, vstart: i * vertsPer,
        t: Math.random(),                  // spread the swarm along their hops
        speed: 0.25 + Math.random() * 0.4, // hop progress per second
        state: "travel", pause: 0,
      };
      ag.to = this._pickTarget(from);
      ag.curve = this._arcCurve(from.dir, ag.to.dir);
      // static comet falloff: aTail 0 at the head -> 1 at the tail tip
      for (let j = 0; j < ARC_TAIL - 1; j++) {
        aTail[ag.vstart + j * 2] = j / (ARC_TAIL - 1);
        aTail[ag.vstart + j * 2 + 1] = (j + 1) / (ARC_TAIL - 1);
      }
      this.arcAgents.push(ag);
      this._colorAgent(ag);
      this._writeAgent(ag);
    }

    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(positions, 3); posAttr.setUsage(THREE.DynamicDrawUsage);
    const colAttr = new THREE.BufferAttribute(colors, 3); colAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", posAttr);
    geo.setAttribute("aTail", new THREE.BufferAttribute(aTail, 1));
    geo.setAttribute("aColor", colAttr);
    this.arcPosAttr = posAttr;
    this.arcColAttr = colAttr;

    this.arcMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uM: { value: 0 } }, // morph fade-in (geography view)
      vertexShader: `
        attribute float aTail; attribute vec3 aColor;
        varying float vB; varying vec3 vColor;
        void main() {
          vB = 1.0 - aTail;                 // bright (1) at the head -> 0 at the tail tip
          vColor = aColor;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform float uM; varying float vB; varying vec3 vColor;
        void main() {
          float a = vB * vB * uM;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor * (0.5 + vB), a);
        }`,
    });
    this.arcGroup.add(new THREE.LineSegments(geo, this.arcMat));
  }

  // A curved hop between two unit directions, sampled into ARC_SAMPLES points
  // (same outward-bulging bezier the static arcs used).
  _arcCurve(dirA, dirB) {
    const a = dirA.clone().multiplyScalar(R + LAND_H + 0.02);
    const b = dirB.clone().multiplyScalar(R + LAND_H + 0.02);
    const mid = a.clone().add(b).multiplyScalar(0.5).normalize().multiplyScalar(R * (1.25 + a.distanceTo(b) / (R * 6)));
    return new THREE.QuadraticBezierCurve3(a, mid, b).getPoints(ARC_SAMPLES - 1);
  }

  // Pick the next node to travel to: just another random node in the network
  // (anywhere, not necessarily nearby), avoiding staying put.
  _pickTarget(from) {
    const pool = this.arcPool;
    let c = from;
    for (let k = 0; k < 8 && c === from; k++) c = pool[(Math.random() * pool.length) | 0];
    return c;
  }

  _sampleCurve(curve, param, out) {
    const f = THREE.MathUtils.clamp(param, 0, 1) * (curve.length - 1);
    const i0 = Math.floor(f), i1 = Math.min(curve.length - 1, i0 + 1);
    return out.copy(curve[i0]).lerp(curve[i1], f - i0);
  }

  // Paint one packet's vertices the colour of the node it's heading to.
  _colorAgent(ag) {
    const c = ag.to.node.color || ag.to.node.base; // metanode .color / validator .base
    const col = this.arcCol;
    for (let v = 0, n = (ARC_TAIL - 1) * 2; v < n; v++) {
      const ci = (ag.vstart + v) * 3;
      col[ci] = c.r; col[ci + 1] = c.g; col[ci + 2] = c.b;
    }
  }

  // Write a packet's comet into the shared position buffer: ARC_TAIL points
  // trailing the head along its current arc (collapsed onto the node while paused).
  _writeAgent(ag) {
    const pos = this.arcPos, p = this._cometPts;
    const step = ARC_TAIL_FRAC / (ARC_TAIL - 1);
    const collapsed = ag.state === "pause";
    for (let j = 0; j < ARC_TAIL; j++) {
      this._sampleCurve(ag.curve, collapsed ? 1 : ag.t - j * step, p[j]);
    }
    for (let j = 0; j < ARC_TAIL - 1; j++) {
      const vi = (ag.vstart + j * 2) * 3, A = p[j], B = p[j + 1];
      pos[vi] = A.x; pos[vi + 1] = A.y; pos[vi + 2] = A.z;
      pos[vi + 3] = B.x; pos[vi + 4] = B.y; pos[vi + 5] = B.z;
    }
  }

  _fade(group, m) {
    if (!group) return;
    group.traverse((o) => { if (o.userData && o.userData.baseOpacity != null) o.material.opacity = o.userData.baseOpacity * m; });
  }

  // Focus one topic from the learn panel, dimming the validator layers that
  // aren't part of it. `focus` is overview | l0 | l1 | metagraphs | null.
  setHighlight(focus) {
    let l0 = 0, l1 = 0;
    if (focus === "l0") l1 = 1;
    else if (focus === "l1") l0 = 1;
    else if (focus === "metagraphs") { l0 = 1; l1 = 1; }
    this.dimTarget.l0 = l0;
    this.dimTarget.l1 = l1;
  }

  // -------------------------------------------------- metagraph nodes
  // Build the metagraph validator markers from baked data. `list` is the
  // contents of data/metagraphs.json; geoMap supplies each node's location.
  // Only metagraphs with at least one locatable node are kept.
  setMetagraphs(list, geoMap) {
    this._disposeMeta();
    this.metaNodes = [];

    const withNodes = (list || []).filter((m) =>
      (m.nodes || []).some((n) => geoMap[n.ip]));
    // Colour + Hypergraph slot come from the matching config metagraph, so each
    // metagraph's hub (Layers) and its globe nodes share a colour and the nodes
    // fly out from where the hub sits.
    const n = METAGRAPHS.length;
    withNodes.forEach((m) => {
      const ci = METAGRAPHS.findIndex((c) => c.id === m.id);
      const cfg = ci >= 0 ? METAGRAPHS[ci] : null;
      m.color = cfg ? cfg.color : 0x8affc1;
      m._anchor = metaAnchor(ci >= 0 ? ci : 0, n);
    });
    this.metaList = withNodes;

    const recs = [];
    // Each metagraph runs its own L0 + currency-L1 (cl1) + data-L1 (dl1). Lay the
    // nodes out as concentric fibonacci shells around the hub — L0 inner, data-L1
    // middle, currency-L1 outer — mirroring the global DAG L0/L1 shells around the
    // core. Currency-L1 is rarely a standalone node (its machines also run L0), so
    // it's outermost and usually empty — no gap left in between. The geography end
    // (geoDir) is the node's real location, so the layers morph onto the globe.
    const SHELL = { l0: 2.0, dl1: 3.4, cl1: 4.6 }; // tighter clusters hugging the hub
    const rolesOf = (node) => nodeRoles(node, node.layer);
    for (const m of withNodes) {
      const a = m._anchor;
      // The orbiting hub mesh (Layers) this metagraph's nodes cluster around.
      const hubGroup = this.layers?.metas?.find((x) => x.cfg.id === m.id)?.group || null;
      const located = m.nodes.filter((node) => geoMap[node.ip]);
      // Per-(node, role): a hybrid node appears in EACH layer shell it runs (so the shells
      // match the counts); the GLOBE shows one dot per node (its first/primary instance).
      const seen = new Set();
      for (const layer of ["l0", "dl1", "cl1"]) {
        const list = located.filter((node) => rolesOf(node).includes(layer));
        const cnt = list.length;
        const rad = SHELL[layer];
        list.forEach((node, i) => {
          const g = geoMap[node.ip];
          const primary = !seen.has(node.ip);
          seen.add(node.ip);
          // fibonacci-shell offset from the hub (deterministic, even spacing)
          const y = 1 - (i / Math.max(1, cnt - 1)) * 2;
          const rr = Math.sqrt(Math.max(0, 1 - y * y));
          const phi = i * GOLDEN_ANGLE;
          const offset = new THREE.Vector3(Math.cos(phi) * rr * rad, y * rad, Math.sin(phi) * rr * rad);
          const dir = latLonToVec3(g.lat, g.lon, 1).normalize(); // real location; fanned out below
          recs.push({
            metaId: m.id, layer, color: new THREE.Color(m.color), index: 0,
            hubGroup, offset, geoPrimary: primary, nodeId: node.ip,
            // Hypergraph fallback cluster (used if the hub isn't available).
            hyperPos: new THREE.Vector3(a.x, a.y, a.z).add(offset),
            // Geography end: the node's real location + outward normal for the disc
            // (geoPos is filled in after the co-located fan-out below).
            geoPos: new THREE.Vector3(),
            geoDir: dir, trueDir: dir.clone(),
            // same sphere/disc sizing & tumble as the validator nodes; a hybrid sibling has
            // geoSize 0 → no disc on the globe (one dot per node).
            hyperSize: 0.52, geoSize: primary ? 0.0667 : 0,
            spinAxis: new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize(),
            spinSpeed: 0.3 + Math.random() * 0.5, spinPhase: Math.random() * 6.2831,
            twinkle: Math.random() * 6.2831, dim: 0, dimTarget: 0,
            pick: {
              kind: "metanode", meta: m, node, geo: g, layer,
              // Network name + the node's role tags (a hybrid lists every layer it runs) — so
              // hovering any shell of a machine reads the same, matching the paired glow.
              title: m.name, roles: rolesOf(node),
              sub: g ? `${g.city ? g.city + ", " : ""}${g.country}` : (node.ip ? `${node.state} · ${node.ip}` : ""),
            },
          });
        });
      }
    }
    const total = recs.length;
    if (!total) return;

    // Fan-out + density rings are (re)built per filter selection by _relayoutGeo,
    // which setFilter() calls at the end of this method (this.metaNodes is set first).

    // Same two-mesh cross-fade as the validator nodes (see setNodes): a tumbling
    // sphere in the Hypergraph, a flat disc lying on the globe surface in geography.
    const baseArr = new Float32Array(total * 3);
    const emiArr = new Float32Array(total).fill(0.5);
    const picks = new Array(total);
    const sphereGeo = new THREE.SphereGeometry(0.5, 16, 12);
    const discGeo = new THREE.CircleGeometry(1, 24);
    const wrap = (geo) => {
      geo.setAttribute("aBase", new THREE.InstancedBufferAttribute(baseArr, 3));
      const aE = new THREE.InstancedBufferAttribute(emiArr, 1);
      aE.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute("aEmissive", aE);
      return aE;
    };
    this.metaAESphere = wrap(sphereGeo);
    this.metaAEDisc = wrap(discGeo);

    const mkMesh = (geo, side) => {
      const mat = this._makeNodeMaterial();
      mat.side = side;
      const mesh = new THREE.InstancedMesh(geo, mat, total);
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.userData.picks = picks;
      this.nodeGroup.add(mesh);
      return mesh;
    };
    this.metaSphere = mkMesh(sphereGeo, THREE.FrontSide);
    this.metaDisc = mkMesh(discGeo, THREE.DoubleSide); // visible even at the limb

    recs.forEach((r, i) => {
      r.index = i;
      baseArr[i * 3] = r.color.r; baseArr[i * 3 + 1] = r.color.g; baseArr[i * 3 + 2] = r.color.b;
      picks[i] = r.pick;
    });
    this.metaSphere.geometry.getAttribute("aBase").needsUpdate = true;
    this.metaDisc.geometry.getAttribute("aBase").needsUpdate = true;

    this.metaNodes = recs;
    this.metaEmi = emiArr;
    this.metaBaseArr = baseArr;
    this.setFilter(this.filter);
  }

  _disposeMeta() {
    for (const mesh of [this.metaSphere, this.metaDisc]) {
      if (!mesh) continue;
      this.nodeGroup.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.dispose();
    }
    this.metaSphere = this.metaDisc = null;
  }

  // Isolate one network on the globe and dim the rest. `sel` is the filter id
  // shared with the global validators: "all" | "l0" | "l1" | <metagraphId>.
  setFilter(sel) {
    this.filter = sel;
    this.countryFilter = null; // switching network clears the country drill-down
    // The validators ARE the DAG core, so they're lit under "all" or "dag" and dimmed only
    // when a metagraph is selected (both layers together — the L0/L1 split filters are gone).
    const dagLit = sel === "all" || sel === "dag";
    this.dimTarget.l0 = dagLit ? 0 : 1;
    this.dimTarget.l1 = dagLit ? 0 : 1;
    for (const r of this.metaNodes) {
      r.dimTarget = (sel === "all" || sel === r.metaId) ? 0 : 1;
    }
    this._relayoutGeo();
  }

  // Narrow the current network selection to a single country (cc), or null to
  // clear. Combines with setFilter: a node is active only if it's in BOTH.
  setCountry(cc) {
    this.countryFilter = cc || null;
    this._relayoutGeo();
  }

  // Hover-pairing: pass the hovered node's id (validator machine id, or a metagraph node ip);
  // the per-frame glow loops brighten every instance that shares it. null clears the highlight.
  setHoverNode(id) {
    this._hoverNodeId = id || null;
  }

  // The persistently selected node (a clicked node card) — glows every layer shell it runs,
  // like the transient hover-pairing but it stays lit until the selection clears.
  setSelectedNode(id) {
    this._selectedNodeId = id || null;
  }

  // World position of a node's HYPERGRAPH point (validator or metagraph node) by its id — read
  // from its live instance transform, so it's correct mid-orbit. Lets the camera frame a node
  // when the selection carries into the Hypergraph. null if not found.
  hyperWorldPos(id) {
    if (!id) return null;
    const u = this.nodes.find((n) => n.nodeId === id);
    if (u && this.instSphere) {
      this.instSphere.getMatrixAt(u.index, _focusMat);
      return this.group.localToWorld(new THREE.Vector3().setFromMatrixPosition(_focusMat));
    }
    const r = this.metaNodes && this.metaNodes.find((n) => n.nodeId === id);
    if (r && this.metaSphere) {
      this.metaSphere.getMatrixAt(r.index, _focusMat);
      return this.group.localToWorld(new THREE.Vector3().setFromMatrixPosition(_focusMat));
    }
    return null;
  }

  // Whether a node is part of the current network filter (i.e. not network-dimmed).
  // `id` is the core a node belongs to ("dag" for any validator, the metagraph id for a
  // metagraph node). Active under "all" or its own core.
  _isActive(id) {
    return this.filter === "all" || this.filter === id;
  }

  // Whether a node passes BOTH the network filter and the country drill-down —
  // i.e. it's the bright, fanned-out, arc-wired, camera-focused set.
  _nodeActive(layerOrMetaId, geo) {
    return this._isActive(layerOrMetaId) &&
      (!this.countryFilter || (geo && geo.cc === this.countryFilter));
  }

  // Aim the globe so a unit direction `dir` (in the un-rotated globe frame) swings to the
  // front: rotation.y picks the longitude (the short way round), rotation.x tilts the
  // latitude up into view so nodes near the top/bottom aren't stuck at the rim. The tilt is
  // clamped to `maxTilt` (radians) so the globe leans rather than flipping pole-on.
  // `raise` (radians) leaves the aimed point that far ABOVE the front-centre instead of
  // dead-centre — so a focused node sits in the upper third and the globe curves away below
  // it (an oblique "horizon" framing), rather than being viewed straight-down top-down.
  _aimAt(dir, maxTilt, raise = 0) {
    const fromY = this.group.rotation.y;
    let dy = -Math.atan2(dir.x, dir.z) - fromY;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy)); // shortest way round
    const h = Math.hypot(dir.x, dir.z);
    const tilt = Math.max(-maxTilt, Math.min(maxTilt, Math.atan2(dir.y, h) - raise));
    this.spin = { from: fromY, to: fromY + dy, fromX: this.group.rotation.x, toX: tilt, t: 0, dur: 1.3 };
  }

  // Aim the globe so the densest part of the current filter's located nodes faces the
  // camera (the mean node direction leans toward wherever the most nodes are), with a gentle
  // ~32° tilt so a high-latitude cluster (e.g. Finland) isn't framed at the rim. Pass false
  // to resume the idle spin. Returns the selection's concentration R = |mean of node dirs|
  // (0 = spread over the globe, 1 = all co-located), so the camera can zoom proportionally.
  focusDensest(on) {
    if (!on) { this.spin = null; return null; }
    const mean = new THREE.Vector3();
    let count = 0;
    for (const u of this.nodes) if (!u.noGeo && u.geoPrimary && this._nodeActive("dag", u.pick.geo)) { mean.add(u.trueDir); count++; }
    for (const r of this.metaNodes) if ((r.geoPrimary ?? true) && this._nodeActive(r.metaId, r.pick.geo)) { mean.add(r.trueDir); count++; }
    if (!count || mean.lengthSq() < 1e-6) { this.spin = null; return null; }
    const R = mean.length() / count;
    this._aimAt(mean.clone().normalize(), 0.56); // ~32° max lean for a broad selection
    return R;
  }

  // Aim a single node's location to the centre of the view (the caller frames the globe so its
  // curvature still reads around it). A tiny `raise` nudges it a hair above dead-centre so there's
  // a touch more globe below; the tilt rotates high-latitude nodes in off the rim. False if no lat/lon.
  focusNode(geo) {
    if (!geo || geo.lat == null || geo.lon == null) return false;
    this._aimAt(latLonToVec3(geo.lat, geo.lon, 1).normalize(), 0.70, 0.12); // ≤40° tilt, ~7° raise
    return true;
  }

  // -------------------------------------------------- per-country breakdown
  // The geo "data" functions live in geoStats.js (pure, no mesh state); these wrappers just feed
  // them the live node arrays so the engine's call sites stay the same.
  countryStats(filter = this.filter) {
    return geoStats.countryStats(this.nodes, this.metaNodes, filter);
  }
  listNodes(filter = this.filter) {
    return geoStats.listNodes(this.nodes, this.metaNodes, filter);
  }
  distributionScores() {
    return geoStats.distributionScores(this.nodes, this.metaNodes);
  }

  // Re-fan the co-located nodes and rebuild the density rings + arcs using ONLY
  // the filter-active nodes, so the rings, fan-out and connection arcs tighten
  // around exactly what's shown. Inactive (dimmed) nodes collapse back to their
  // true location and drop out of the arc pool.
  _relayoutGeo() {
    const clusters = [];

    // Validators: active ones fan out among themselves; the rest reset to point. Only the
    // primary instance per machine takes part in the globe layout (hybrid siblings are hidden).
    const vActive = [];
    for (const u of this.nodes) {
      if (u.noGeo) continue;
      u.geoDir.copy(u.trueDir);
      if (u.geoPrimary && this._nodeActive("dag", u.pick.geo)) vActive.push(u);
    }
    if (vActive.length) clusters.push(...spreadCoLocated(vActive.map((u) => u.geoDir)));

    // Metagraph nodes: same treatment, then re-drop each onto the globe surface
    // (their disc position is precomputed from geoDir, unlike the validators').
    const mActive = [];
    for (const r of this.metaNodes) {
      r.geoDir.copy(r.trueDir);
      if (!(r.geoPrimary ?? true)) continue; // hybrid siblings: hidden on the globe
      if (this._nodeActive(r.metaId, r.pick.geo)) mActive.push(r);
    }
    if (mActive.length) clusters.push(...spreadCoLocated(mActive.map((r) => r.geoDir), { spacingDeg: 0.4, maxDeg: 2 }));
    for (const r of this.metaNodes) r.geoPos.copy(r.geoDir).multiplyScalar(R + LAND_H + 0.02);

    this._buildHeatmap(clusters);

    // Arcs only connect the filter-active nodes, drawn from their fanned-out
    // positions — so selecting a metagraph wires arcs between exactly its discs,
    // and "all" connects the validator set as before. (_buildArcs clones each
    // dir, so the shared geoDir vectors are safe to mutate afterwards.)
    const arcPts = [];
    for (const u of vActive) if (u.ready) arcPts.push({ dir: u.geoDir, node: u });
    for (const r of mActive) arcPts.push({ dir: r.geoDir, node: r });
    this._buildArcs(arcPts);
  }

  // Camera direction expressed in this group's local frame, so a disc's facing
  // can be read as a plain dot product with its (local) surface normal.
  _updateCamN() {
    this._hasCam = !!this.camera;
    if (!this._hasCam) return;
    this._camN.copy(this.camera.position);
    this.group.worldToLocal(this._camN).normalize();
  }

  // How strong the network/country dim is, ramped by the morph: SUBTLE in the Hypergraph
  // (a gentle "out of focus" push — nodes stay full-strength-ish and visible) and FULL on the
  // globe (off-filter nodes fade out entirely). EVERY dim consumer — node scale AND glow, for
  // BOTH validators and metagraph nodes — multiplies the raw eased dim by this one value, so
  // they can never drift apart (the old bug: the validator *scale* used the raw, un-ramped dim
  // and so scaled the nodes to nothing in hyper, while their glow only dimmed).
  _dimScale() {
    return 0.32 + 0.68 * this.morph;
  }

  // -------------------------------------------------- morph between layouts
  setMorph(m) {
    this.morph = m;
    const e = smooth(m);
    this._updateCamN();
    if (this.instSphere) {
      const t = this.clock;
      // Keep the spheres full-size for the whole flight so their movement reads
      // clearly, then cross-fade them into the circles only at the last moment,
      // once the nodes have essentially arrived at the globe surface.
      const w = smooth(THREE.MathUtils.clamp((m - 0.82) / 0.16, 0, 1));
      const sphereVis = 1 - w, discVis = w;
      for (const u of this.nodes) {
        // Shared position: fly from the fibonacci shell to the globe surface.
        let dir;
        if (u.noGeo) {
          dir = u.hyperDir;
          _dummy.position.copy(u.hyperPos);
        } else {
          dir = _vec.copy(u.hyperDir).lerp(u.geoDir, e).normalize();
          _dummy.position.copy(dir).multiplyScalar(lerp(u.hyperRadius, u.geoRadius, e));
        }

        // Nodes outside the current network/country selection are hidden ON THE GLOBE — and on
        // the hyper→globe morph they vanish (they're irrelevant to that flight) rather than
        // travel to the globe only to disappear. But in the HYPERGRAPH the off-filter nodes must
        // stay visible (just dimmed) — so the hide scales with the morph `m` (0 in hyper → no
        // hide; 1 in geo → full hide). Without this, selecting a metagraph in hyper scaled the
        // DAG validators to nothing instead of dimming them.
        let hideV = u.layer === "l0" ? this.dim.l0 : this.dim.l1;
        if (this.countryFilter && (!u.pick.geo || u.pick.geo.cc !== this.countryFilter)) hideV = Math.max(hideV, this.countryMix);
        const show = 1 - hideV * this._dimScale(); // SAME ramped dim as the glow + the metagraph nodes

        // Sphere: tumbling on its own axis, shrinking out as it nears the globe.
        _qSpin.setFromAxisAngle(u.spinAxis, u.spinPhase + t * u.spinSpeed);
        _dummy.quaternion.copy(_qSpin);
        _dummy.scale.setScalar(u.hyperSize * sphereVis * (u.noGeo ? 1 - e : 1) * show);
        _dummy.updateMatrix();
        this.instSphere.setMatrixAt(u.index, _dummy.matrix);

        // Circle: a flat disc lying tangent on the surface (local +Z outward),
        // growing in as the node lands, and fading out toward the limb. No-geo
        // nodes never get a disc.
        const fall = this._hasCam ? discFall(dir.dot(this._camN)) : 1;
        _qRadial.setFromUnitVectors(Z_AXIS, dir);
        _dummy.quaternion.copy(_qRadial);
        _dummy.scale.setScalar(u.noGeo ? 0 : u.geoSize * discVis * fall * show);
        _dummy.updateMatrix();
        this.instDisc.setMatrixAt(u.index, _dummy.matrix);
      }
      this.instSphere.instanceMatrix.needsUpdate = true;
      this.instDisc.instanceMatrix.needsUpdate = true;
      this.instSphere.visible = sphereVis > 0.001;
      this.instDisc.visible = discVis > 0.001;
      this.pickables = [w < 0.5 ? this.instSphere : this.instDisc];
      const mp = w < 0.5 ? this.metaSphere : this.metaDisc;
      if (mp) this.pickables.push(mp);
    }
    // The globe surface fades in only once nodes are well on their way, and the
    // heatmap/arcs later still — so the Earth materialises under the arriving
    // nodes instead of veiling them mid-flight.
    const surf = smooth(THREE.MathUtils.clamp((m - 0.35) / 0.45, 0, 1));
    const extras = smooth(THREE.MathUtils.clamp((m - 0.6) / 0.4, 0, 1));
    this.sphereMesh.visible = m > 0.05; // keep it out of the Hypergraph view
    for (const f of this.geoFades) f.mat.opacity = f.base * surf;
    if (this.landWallUniforms) this.landWallUniforms.uOpacity.value = surf;
    if (this.landFillMesh) this.landFillMesh.visible = m > 0.05; // opacity via geoFades
    this.atmoUniforms.uM.value = surf;
    this._fade(this.heatGroup, extras);
    if (this.arcMat) this.arcMat.uniforms.uM.value = extras;
  }

  update(dt) {
    this.clock += dt;
    // Ease the wall colour (held at the default cyan).
    if (this.landWallUniforms) {
      this._edgeColor.lerp(this._edgeTarget, Math.min(1, dt * 3));
      this.landWallUniforms.uColor.value.copy(this._edgeColor);
    }
    if (this.spin) {
      // Ease-in-out to the focus orientation (longitude + tilt), then hold there (no idle spin).
      const s = this.spin;
      if (s.t < 1) {
        s.t = Math.min(1, s.t + dt / s.dur);
        const e = s.t < 0.5 ? 2 * s.t * s.t : 1 - Math.pow(-2 * s.t + 2, 2) / 2;
        this.group.rotation.y = s.from + (s.to - s.from) * e;
        this.group.rotation.x = (s.fromX || 0) + ((s.toX || 0) - (s.fromX || 0)) * e;
      }
    } else {
      this.group.rotation.y += dt * 0.03; // idle spin
      // Ease any focus tilt back to level when idling, so the globe sits upright again.
      if (this.group.rotation.x) this.group.rotation.x += (0 - this.group.rotation.x) * Math.min(1, dt * 2.2);
    }
    const m = this.morph;
    const flashDecay = Math.max(0, 1 - dt * 5); // ~0.2s glow tail after a hit
    // The one morph-ramped dim strength (see _dimScale) — subtle in hyper, full in geo.
    const dimScale = this._dimScale();
    // The hover/select "dim the others" effect only kicks in when NOT isolating a metagraph
    // (filter all / dag) — otherwise it would compound with the network dim and the off-focus
    // nodes would disappear entirely. With a metagraph selected, the network dim alone carries it.
    const dimOthersOnFocus = this.filter === "all" || this.filter === "dag";

    // Travelling packets: each hops node -> node, lighting up the node it reaches,
    // resting a moment, then routing on to a nearby node. Many at once read as live
    // network traffic. Advanced before the glow loops (so arrival flashes land this
    // frame) and only while the globe is showing (morph past halfway).
    if (this.arcMat && this.arcAgents && m > 0.5) {
      let recolour = false;
      for (const ag of this.arcAgents) {
        if (ag.state === "travel") {
          ag.t += ag.speed * dt;
          if (ag.t >= 1) {
            ag.t = 1;
            ag.to.node._flash = 0.7;                  // light up the node it reaches
            ag.state = "pause";
            ag.pause = 0.3 + Math.random() * 1.2;     // dynamic rest before hopping on
          }
        } else {
          ag.pause -= dt;
          if (ag.pause <= 0) {
            ag.from = ag.to;
            ag.to = this._pickTarget(ag.from);        // route on to a nearby node
            ag.curve = this._arcCurve(ag.from.dir, ag.to.dir);
            ag.t = 0; ag.state = "travel";
            this._colorAgent(ag);                     // take on the new destination's colour
            recolour = true;
          }
        }
        this._writeAgent(ag);
      }
      this.arcPosAttr.needsUpdate = true;
      if (recolour) this.arcColAttr.needsUpdate = true;
    }

    if (this.instSphere) {
      // Ease the per-layer dim levels; only rewrite the (otherwise static) base
      // colour buffer while a transition is actually in flight.
      const k = Math.min(1, dt * 4);
      this.dim.l0 += (this.dimTarget.l0 - this.dim.l0) * k;
      this.dim.l1 += (this.dimTarget.l1 - this.dim.l1) * k;
      this.countryMix += ((this.countryFilter ? 1 : 0) - this.countryMix) * k;
      // While a country drill-down is active, per-node dim varies, so recolour every
      // frame; otherwise only during a layer-dim transition.
      const cf = this.countryFilter, cmix = this.countryMix;
      const recolour = cf != null || cmix > 0.001 ||
                       Math.abs(this.dim.l0 - this._appliedDim.l0) > 0.001 ||
                       Math.abs(this.dim.l1 - this._appliedDim.l1) > 0.001;
      const base = this.baseArr;

      const emi = this.emiArr;
      // A hovered/selected node dims the rest so it stands out — same in both views.
      const focusId = this._hoverNodeId || this._selectedNodeId;
      const focusDim = 0.45;
      for (const u of this.nodes) {
        let d = (u.layer === "l0" ? this.dim.l0 : this.dim.l1) * dimScale;
        // outside the drilled-into country? dim it on top of the network dim (geo only).
        if (cf && (!u.pick.geo || u.pick.geo.cc !== cf)) d = Math.max(d, cmix);
        // dim the glow on the globe so dense regions don't bloom into a blob;
        // the lower Hypergraph base lets the point-lights shade the sphere
        // (so it reads as a solid 3D ball, not a uniform glowing dot).
        let ei = lerp(0.5, 0.22, m);
        // Twinkle is a decorative (non-data-driven) shimmer — geo only (scaled by m), so the
        // Hypergraph nodes stay static and only the DATA-driven pulses animate there.
        ei += Math.sin(this.clock * 2 + u.twinkle) * 0.06 * m;
        const flRaw = u._flash || 0; // brief flash when an arc pulse reaches this node
        const fl = flRaw * m; // arcs are a geo-only visual — their flash must not bleed into hyper
        emi[u.index] = Math.max(0.02, ei * (1 - d * 0.92) + fl); // suppress glow when dimmed
        // Hover/selection pairing: the focused machine's every layer-shell glows together,
        // and the rest dim back so it stands out (only when not already isolating a metagraph).
        if (focusId) {
          if (u.nodeId === this._hoverNodeId || u.nodeId === this._selectedNodeId) emi[u.index] += 1.4;
          else if (dimOthersOnFocus) emi[u.index] *= focusDim;
        }
        if (flRaw) u._flash = flRaw * flashDecay;

        if (recolour) {
          const c = _col.copy(u.base).lerp(DIM, d * 0.85);
          base[u.index * 3] = c.r; base[u.index * 3 + 1] = c.g; base[u.index * 3 + 2] = c.b;
        }
      }
      // Both meshes share emiArr; flag both attributes for re-upload.
      this.aEmiSphere.needsUpdate = true;
      this.aEmiDisc.needsUpdate = true;
      if (recolour) {
        this.instSphere.geometry.getAttribute("aBase").needsUpdate = true;
        this.instDisc.geometry.getAttribute("aBase").needsUpdate = true;
        this._appliedDim.l0 = this.dim.l0;
        this._appliedDim.l1 = this.dim.l1;
      }
    }

    // Metagraph nodes: a cluster of tumbling spheres around each hub in the
    // Hypergraph that fly out and cross-fade into flat discs on the globe surface
    // — exactly like the validator nodes (setMorph), just coloured per metagraph.
    // The hub orbits in a different frame than this (rotating) group, so its live
    // position is converted into this group's local space each frame.
    if (this.metaSphere) {
      const e = smooth(m);                                              // flight progress
      const w = smooth(THREE.MathUtils.clamp((m - 0.82) / 0.16, 0, 1)); // sphere -> disc
      const sphereVis = 1 - w, discVis = w;
      const kk = Math.min(1, dt * 4);
      const emi = this.metaEmi;
      const base = this.metaBaseArr;
      const cf = this.countryFilter, cmix = this.countryMix;
      // A hovered/selected node dims the rest so it stands out — same in both views.
      const focusId = this._hoverNodeId || this._selectedNodeId;
      const focusDim = 0.45;
      for (const r of this.metaNodes) {
        r.dim += (r.dimTarget - r.dim) * kk;
        // effective dim = network dim (subtle in hyper via dimScale), raised by the country
        // dim when this node is outside the drilled-into country (geo only).
        let dEff = r.dim * dimScale;
        if (cf && (!r.pick.geo || r.pick.geo.cc !== cf)) dEff = Math.max(dEff, cmix);
        // Twinkle (decorative shimmer) is geo-only (scaled by m) — no non-data-driven node
        // animation in the Hypergraph.
        const glow = (0.5 + Math.sin(this.clock * 2 + r.twinkle) * 0.12 * m) * (1 - dEff * 0.9);
        const flRaw = r._flash || 0; // brief flash when an arc pulse reaches this node
        const fl = flRaw * m; // arcs are a geo-only visual — their flash must not bleed into hyper
        emi[r.index] = Math.max(0.03, glow + fl);
        // Hover/selection pairing: the focused node's shells glow together; the rest dim back
        // so it stands out (only when not already isolating a metagraph).
        if (focusId) {
          if (r.nodeId === this._hoverNodeId || r.nodeId === this._selectedNodeId) emi[r.index] += 1.4;
          else if (dimOthersOnFocus) emi[r.index] *= focusDim;
        }
        if (flRaw) r._flash = flRaw * flashDecay;

        const c = _col.copy(r.color).lerp(DIM, dEff * 0.85);
        base[r.index * 3] = c.r; base[r.index * 3 + 1] = c.g; base[r.index * 3 + 2] = c.b;

        // Hypergraph anchor = the hub's current orbit position, expressed in this
        // group's local frame (so it stays glued to the hub as the globe spins).
        if (r.hubGroup) {
          _vec.copy(r.hubGroup.position);
          this.group.worldToLocal(_vec).add(r.offset);
        } else {
          _vec.copy(r.hyperPos);
        }
        _geoVec.copy(_vec).lerp(r.geoPos, e);

        // Sphere: tumbling on its own axis, shrinking out near the globe. Filtered-out
        // metagraph nodes shrink fully (1 - dEff) so they vanish quickly on the morph too.
        _dummy.position.copy(_geoVec);
        _qSpin.setFromAxisAngle(r.spinAxis, r.spinPhase + this.clock * r.spinSpeed);
        _dummy.quaternion.copy(_qSpin);
        _dummy.scale.setScalar(r.hyperSize * sphereVis * (1 - dEff));
        _dummy.updateMatrix();
        this.metaSphere.setMatrixAt(r.index, _dummy.matrix);

        // Disc: flat on the surface (local +Z points outward), growing in and
        // fading out toward the limb like the validator discs.
        const fall = this._hasCam ? discFall(r.geoDir.dot(this._camN)) : 1;
        _qRadial.setFromUnitVectors(Z_AXIS, r.geoDir);
        _dummy.quaternion.copy(_qRadial);
        // Hide (not dim) metagraph nodes outside the selection — shrink the disc fully out.
        _dummy.scale.setScalar(r.geoSize * discVis * (1 - dEff) * fall);
        _dummy.updateMatrix();
        this.metaDisc.setMatrixAt(r.index, _dummy.matrix);
      }
      this.metaSphere.instanceMatrix.needsUpdate = true;
      this.metaDisc.instanceMatrix.needsUpdate = true;
      this.metaSphere.visible = sphereVis > 0.001;
      this.metaDisc.visible = discVis > 0.001;
      this.metaAESphere.needsUpdate = true;
      this.metaAEDisc.needsUpdate = true;
      this.metaSphere.geometry.getAttribute("aBase").needsUpdate = true;
      this.metaDisc.geometry.getAttribute("aBase").needsUpdate = true;
    }
  }
}

// Soft radial glow sprite used for the heatmap.
function makeGlowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.4)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// Cool -> hot gradient for density (blue -> green -> yellow -> red).
const HEAT_STOPS = [
  [0.0, new THREE.Color(0x1a6cff)],
  [0.35, new THREE.Color(0x36e29a)],
  [0.65, new THREE.Color(0xffd166)],
  [1.0, new THREE.Color(0xff5a3c)],
];
function heatColor(t) {
  for (let i = 0; i < HEAT_STOPS.length - 1; i++) {
    const [a, ca] = HEAT_STOPS[i];
    const [b, cb] = HEAT_STOPS[i + 1];
    if (t <= b) return ca.clone().lerp(cb, (t - a) / (b - a));
  }
  return HEAT_STOPS[HEAT_STOPS.length - 1][1].clone();
}
