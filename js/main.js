// Entry point: wires the data layer to the 3D scene, the globe view and the UI.

import * as THREE from "three";
import Stats from "three/addons/libs/stats.module.js";
const _dofTmp = new THREE.Vector3(); // scratch for the depth-of-field focus target
import { createScene } from "./scene.js";
import { Layers } from "./layers.js";
import { Globe } from "./globe.js";
import { UI } from "./ui.js";
import { SnapshotStream } from "./stream.js";
import { NetworkData } from "./api.js";
import { loadGeoCache, resolveMissing } from "./geo.js";

const canvas = document.getElementById("scene");
const { scene, camera, renderer, controls, composer, dof, background } = createScene(canvas);

// FPS / frame-time monitor, parked top-right under the header (click to cycle
// fps / ms / memory panels).
const stats = new Stats();
stats.dom.style.cssText = "position:fixed;top:86px;right:16px;left:auto;z-index:60;opacity:0.92;cursor:pointer";
document.body.appendChild(stats.dom);

const layers = new Layers(scene);
const globe = new Globe(scene, layers, camera);
const ui = new UI({ camera, renderer, controls, layers, globe });

// Meaningless stand-in shown in the (work-in-progress) Snapshot DAG view: a slowly
// tumbling wireframe cube. The real hypergraph/globe are hidden while it's on.
const ledgerCube = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(16, 16, 16)),
  new THREE.LineBasicMaterial({ color: 0x2af5ff, transparent: true, opacity: 0.7 }),
);
ledgerCube.position.set(0, 2, 0);
ledgerCube.visible = false;
scene.add(ledgerCube);
const stream = new SnapshotStream({
  onSelect: (data) => { ui.showSnapshot(data); layers.flashCore(); },
  onArrive: () => layers.flashCore(),
});
const data = new NetworkData();

// ---- geolocation: load the baked cache, build the globe when data is ready ----
let geoMap = {};
let lastClusters = null;
let metaData = null; // baked metagraph nodes (data/metagraphs.json)
loadGeoCache().then((m) => { geoMap = m; buildGlobe(); applyMetagraphs(); });

// Baked real metagraphs + their validator nodes, plotted on the globe.
fetch("./data/metagraphs.json")
  .then((r) => (r.ok ? r.json() : null))
  .then((d) => { metaData = d; applyMetagraphs(); })
  .catch(() => {});

function applyMetagraphs() {
  if (!metaData || !Object.keys(geoMap).length) return;
  globe.setMetagraphs(metaData, geoMap);
  ui.setMetagraphList(globe.metaList);
  ui.refreshLeaderboard();
  // Deep link: #geo=SYMBOL (or =metagraphId) pre-selects that metagraph filter.
  const m = location.hash.match(/^#geo[=:](.+)$/);
  if (m) {
    const key = decodeURIComponent(m[1]);
    const mg = globe.metaList.find((x) =>
      x.id === key || (x.symbol || "").toUpperCase() === key.toUpperCase());
    if (mg) ui.selectFilter(mg.id);
  }
}

function buildGlobe() {
  if (!lastClusters || !Object.keys(geoMap).length) return;
  globe.setNodes(lastClusters.l0, lastClusters.l1, geoMap);
  applyMetagraphs();
  ui.refreshLeaderboard();
  // fill in any validators missing from the cache (no-op when fully cached)
  const ips = [...lastClusters.l0, ...lastClusters.l1].map((n) => n.ip);
  resolveMissing(geoMap, ips, (m) => {
    geoMap = m;
    globe.setNodes(lastClusters.l0, lastClusters.l1, geoMap);
    ui.refreshLeaderboard();
  });
}

// ---- data -> visuals + UI ----
data.on("status", ({ live }) => ui.setStatus(live));

data.on("global", (evt) => {
  if (evt.reset) stream.setSnapshots(evt.snapshots);
  else stream.push(evt.snapshot);
  if (evt.latest) ui.onGlobal(evt.latest);
});

data.on("meta", (evt) => layers.updateMeta(evt.name, evt));

data.on("cluster", ({ l0, l1 }) => {
  ui.setNodeCounts(l0, l1);
  lastClusters = { l0, l1 };
  buildGlobe();
});

// ---- view mode toggle (Hypergraph <-> Geography) ----
let mode = "hyper";
let morph = 0; // 0 = hypergraph, 1 = globe (animated)
const toggle = document.getElementById("viewtoggle");
function selectView(view) {
  if (view === mode) return;
  const btn = toggle.querySelector(`[data-view="${view}"]`);
  if (!btn) return;
  mode = view;
  [...toggle.children].forEach((b) => b.classList.toggle("active", b.dataset.view === mode));
  ui.setMode(mode);
}
toggle.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (btn) selectView(btn.dataset.view);
});

// Deep link: opening with #geo (optionally #geo=SYMBOL) starts in the node-geography
// view. There's nothing to morph from on a fresh load, so snap straight to the globe.
const isGeoHash = () => /^geo($|[=:])/.test(location.hash.replace("#", ""));
if (isGeoHash()) { selectView("geo"); morph = 1; }
window.addEventListener("hashchange", () => selectView(isGeoHash() ? "geo" : "hyper"));

// ---- boot ----
data.init().then(() => {
  const loader = document.getElementById("loader");
  loader.classList.add("gone");
  setTimeout(() => loader.remove(), 900);
});

// ---- render loop ----
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  stats.begin();
  const dt = Math.min(clock.getDelta(), 0.05);

  // morph between the two views: nodes physically fly between layouts while the
  // Hypergraph furniture (core, metagraphs) scales away and the globe fades in.
  const target = mode === "geo" ? 1 : 0;
  morph += (target - morph) * Math.min(1, dt * 1.1);
  layers.root.visible = morph < 0.985;
  layers.root.scale.setScalar(Math.max(0.0001, 1 - morph));

  globe.setMorph(morph);
  background.update(dt, morph);
  layers.update(dt, morph);
  globe.update(dt);
  ui.update(dt);
  controls.update();

  // Ledger (placeholder) view: hide the hypergraph + globe and show the stand-in
  // cube instead. (`layers.update` sets coreGroup.visible, so override it here.)
  const ledger = mode === "ledger";
  if (ledger) { layers.root.visible = false; layers.coreGroup.visible = false; }
  globe.group.visible = !ledger;
  background.mesh.visible = !ledger; // plain dark backdrop — the ledger view gets its own
  ledgerCube.visible = ledger;
  if (ledger) { ledgerCube.rotation.y += dt * 0.4; ledgerCube.rotation.x += dt * 0.18; }

  // Depth of field — only when a SINGLE metagraph is focused. Its nodes form a
  // compact cluster at one depth, so a focal plane reads as "this metagraph sharp,
  // the rest soft". Spread selections (All / DAG L0 / DAG L1 / overview) span the
  // whole depth range, where a focal plane would just blur everything, so DoF stays
  // off for them. Fades out across the morph (Hypergraph-only).
  const metaSel = mode === "hyper" && ui.filter !== "all" && ui.filter !== "l0" && ui.filter !== "l1";
  const dofMix = THREE.MathUtils.clamp(1 - (morph - 0.4) / 0.2, 0, 1);
  dof.enabled = metaSel && dofMix > 0.001;
  if (dof.enabled) {
    // Track the hub's LIVE position (it keeps orbiting) so it stays crisp.
    const meta = layers.metas.find((x) => x.cfg.id === ui.filter);
    const target = meta ? meta.group.getWorldPosition(_dofTmp) : controls.target;
    dof.uniforms["focus"].value = camera.position.distanceTo(target);
    dof.uniforms["maxblur"].value = 0.01 * dofMix;
  }

  composer.render();
  stats.end();
}
animate();
