import * as THREE from "three";
import { useStore } from "@/src/store/store";
import { metagraphById, initNetwork } from "@/src/data/network";
// Existing vanilla modules, reused. Bare specifiers resolve via npm; no types yet.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createScene } from "../../js/scene.js";
import { Layers } from "../../js/layers.js";
import { Globe } from "../../js/globe.js";
import { loadGeoCache, resolveMissing } from "../../js/geo.js";

type Mode = "hyper" | "geo" | "ledger";
type Vec = THREE.Vector3;

// Camera presets (ported from ui.js FOCI).
const FOCI: Record<string, { pos: Vec; target: Vec }> = {
  overview: { pos: new THREE.Vector3(0, 15, 60), target: new THREE.Vector3(0, 2, 0) },
  l0: { pos: new THREE.Vector3(0, 6, 20), target: new THREE.Vector3(0, 1, 0) },
  l1: { pos: new THREE.Vector3(14, 10, 26), target: new THREE.Vector3(0, 0, 0) },
  metagraphs: { pos: new THREE.Vector3(0, 30, 70), target: new THREE.Vector3(0, 0, 0) },
  geo: { pos: new THREE.Vector3(0, 11, 36), target: new THREE.Vector3(0, 2, 0) },
};

// Imperative engine: owns the scene, the Hypergraph + globe, the render loop, the
// camera-focus tweens, and the command surface React drives via the store. Ports
// main.js's render loop + ui.js's camera focus, decoupled from any DOM/panels.
export class Engine {
  private ctx: any;
  private layers: any;
  private globe: any;
  private clock = new THREE.Clock();
  private raf = 0;
  private disposed = false;
  private _dofTmp = new THREE.Vector3();

  private mode: Mode = "hyper";
  private filter = "all";
  private country: string | null = null;
  private morph = 0; // 0 = hypergraph, 1 = globe (eased each frame)
  private tween: {
    fromPos: Vec; toPos: Vec; fromTgt: Vec; toTgt: Vec; t: number; dur: number;
  } | null = null;

  private geoMap: Record<string, any> = {};
  private clusters: { l0: any[]; l1: any[] } | null = null;
  private metaData: any = null;

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private canvas: HTMLCanvasElement;
  private onClick = (e: MouseEvent) => this._handleClick(e);
  private onMove = (e: MouseEvent) => this._handleMove(e);
  private _hoverKey: string | null = null;

  private unsub: Array<() => void> = [];
  private metaTimer: ReturnType<typeof setInterval> | undefined;
  private onResize = () => this.ctx.resize?.();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = createScene(canvas);
    this.layers = new Layers(this.ctx.scene);
    this.globe = new Globe(this.ctx.scene, this.layers, this.ctx.camera);
    canvas.addEventListener("click", this.onClick);
    canvas.addEventListener("pointermove", this.onMove);
    // The engine owns the resize handler (createScene no longer adds one) so it's
    // cleaned up on dispose — no leak across StrictMode remounts / HMR.
    window.addEventListener("resize", this.onResize);

    // Apply current store state, then react to changes (Lane B command bridge).
    const s = useStore.getState();
    this.mode = s.mode;
    this.filter = s.filter;
    // Booting straight into geo (deep link / persisted view): snap to the globe —
    // there's nothing to morph from on a fresh load (matches the old #geo behaviour).
    if (this.mode === "geo") this.morph = 1;
    this.unsub.push(
      useStore.subscribe((st, prev) => {
        if (st.mode !== prev.mode) this.setMode(st.mode);
        if (st.filter !== prev.filter) {
          this.filter = st.filter;
          // Switching network clears any country drill-down (matches the old geo UX).
          this.country = null;
          if (prev.country != null) useStore.getState().setCountry(null);
          this.applyFilter();
        }
        if (st.country !== prev.country && st.filter === prev.filter) {
          this.country = st.country;
          this.globe.setCountry(st.country);
          this._applyGeoFocus();
        }
        if (st.learnFocus !== prev.learnFocus) this.setLearnFocus(st.learnFocus);
      }),
    );

    this._loadData();
    this.setMode(this.mode); // also calls applyFilter()
    this.start();
  }

  // ---- data wiring (ports main.js loadGeoCache + metagraphs fetch + cluster) ----
  private async _loadData() {
    const net = initNetwork(); // idempotent; guarantees a NetworkData instance
    if (net?.clusters?.l0?.length) this.clusters = net.clusters;
    net?.on("cluster", ({ l0, l1 }: { l0: any[]; l1: any[] }) => {
      this.clusters = { l0, l1 };
      this._buildGlobe();
    });

    // Validator geo seed (instant plot); merged, not replaced, so it doesn't clobber
    // the metagraph IP geo that arrives from /api/metagraphs.
    loadGeoCache().then((m: Record<string, any>) => {
      this.geoMap = { ...this.geoMap, ...m };
      this._buildGlobe();
      this._applyMetagraphs();
    });

    // Live metagraphs + their geolocated node IPs (server-side; Phase 6 route).
    await this.refreshMeta(true);
    // Keep a long-open tab current. The snapshot/cluster/price feeds already poll
    // client-side (NetworkData), but the metagraph SET is fetched once — so re-pull
    // it on an interval too (Vercel never restarts; ISR only freshens the server
    // cache, not an idle client). Matches the route's revalidate window.
    this.metaTimer = setInterval(() => this.refreshMeta(false), 10 * 60 * 1000);
  }

  // Fetch the (server-cached, live) metagraph set + node geo. On the initial load we
  // build + frame as usual; on a periodic refresh we rebuild the nodes ONLY if the
  // set actually changed, and WITHOUT moving the camera (don't yank the user's view).
  private async refreshMeta(initial: boolean) {
    try {
      const r = await fetch("/api/metagraphs");
      if (!r.ok) return;
      const { metagraphs, geo } = await r.json();
      if (geo) this.geoMap = { ...this.geoMap, ...geo };
      const changed = JSON.stringify(metagraphs) !== JSON.stringify(this.metaData);
      this.metaData = metagraphs;
      this._publishMetaList(); // context-pane rows ready as soon as the route data is in
      if (initial) {
        this._applyMetagraphs();
      } else if (changed && Object.keys(this.geoMap).length) {
        this.globe.setMetagraphs(this.metaData, this.geoMap);
        this._publishLeaderboard();
      }
    } catch {
      /* keep showing the last good data */
    }
  }

  private _buildGlobe() {
    if (!this.clusters || !Object.keys(this.geoMap).length) return;
    this.globe.setNodes(this.clusters.l0, this.clusters.l1, this.geoMap);
    this._applyMetagraphs();
    const ips = [...this.clusters.l0, ...this.clusters.l1].map((n: any) => n.ip);
    resolveMissing(this.geoMap, ips, (m: Record<string, any>) => {
      this.geoMap = m;
      if (this.clusters) this.globe.setNodes(this.clusters.l0, this.clusters.l1, this.geoMap);
      this._publishLeaderboard();
    });
    this._publishLeaderboard();
  }

  private _applyMetagraphs() {
    if (!this.metaData || !Object.keys(this.geoMap).length) return;
    this.globe.setMetagraphs(this.metaData, this.geoMap);
    this.applyFilter(); // re-assert the active filter on the freshly built nodes
    // metaList is published in refreshMeta (metagraph geo arrives with the route), so
    // we don't re-publish here — this runs on every cluster poll.
  }

  // Push EVERY metagraph from the route data (not just the geo-filtered globe list) to
  // the store, so the context pane's Layers/Nodes/Make-up rows render from the raw node
  // data as soon as the route returns — independent of geolocation. `located` (count of
  // geolocatable nodes) + `countriesCount` come from the geo we have; the filter chips
  // use `located` for their count / disabled "(0)" state (what the globe can plot).
  private _publishMetaList() {
    const data: any[] = this.metaData || [];
    const list = data.map((m: any) => {
      const nodes = m.nodes || [];
      const located = nodes.filter((n: any) => this.geoMap[n.ip]).length;
      const countries = new Set(
        nodes.map((n: any) => this.geoMap[n.ip]?.country).filter(Boolean),
      ).size;
      return {
        id: m.id, name: m.name, symbol: m.symbol, description: m.description,
        siteUrl: m.siteUrl, color: metagraphById(m.id)?.color ?? 0x8affc1,
        nodes, located, countriesCount: countries,
      };
    });
    useStore.getState().setMetaList(list);
  }

  // ---- view + filter (ports ui.setMode / _applyFilter / camera focus) ----
  setMode(mode: Mode) {
    this.mode = mode;
    if (mode === "ledger") {
      this.layers.focusId = null;
      this.globe.setFilter("all");
      this.globe.focusDensest(false);
      this.ctx.controls.autoRotate = true;
      this.focus("overview");
      return;
    }
    this.ctx.controls.autoRotate = mode !== "geo";
    this.applyFilter();
  }

  applyFilter() {
    if (this.mode === "geo") {
      this.globe.setFilter(this.filter); // also clears globe.countryFilter
      this._applyGeoFocus();
    } else if (this.mode === "hyper") {
      this.globe.setFilter("all"); // no dimming in the Hypergraph
      this.globe.focusDensest(false);
      this._focusFilter(this.filter);
    }
    this._publishLeaderboard();
  }

  // Aim/zoom the globe for the current network + country selection (ports
  // ui.js _applyGeoFocus): narrowed selections swing to the densest cluster and
  // zoom proportional to concentration; "all" sits at the wide geo overview.
  private _applyGeoFocus() {
    const narrowed = this.filter !== "all" || this.country != null;
    const R = this.globe.focusDensest(narrowed);
    if (narrowed && R != null) this._focusGeo(R);
    else this.focus("geo");
  }

  // Compute the per-country leaderboard + distribution score for the active filter
  // and push them to the store (the React Leaderboard reads them). Cheap.
  private _publishLeaderboard() {
    if (!this.globe.nodes?.length) return;
    const countries = this.globe.countryStats(this.filter);
    const { scores, refId } = this.globe.distributionScores();
    useStore.getState().setLeaderboard({ countries, score: scores[this.filter] ?? null, refId });
  }

  // ---- picking (ports ui.js _pick / _pickablesFor / _onClick) ----
  private _pickablesFor(): any[] {
    if (this.mode === "hyper") return this.layers.pickables.concat(this.globe.pickables);
    if (this.mode === "geo") return this.globe.pickables;
    return []; // ledger: nothing pickable
  }

  private _pickAt(e: MouseEvent): any {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    this.pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    const list = this._pickablesFor();
    if (!list.length) return null;
    this.raycaster.setFromCamera(this.pointer, this.ctx.camera);
    const hits = this.raycaster.intersectObjects(list, false);
    if (!hits.length) return null;
    const h = hits[0];
    return h.object.userData.picks
      ? h.object.userData.picks[h.instanceId as number]
      : h.object.userData.pick;
  }

  // Hover tooltip: only writes the store when the hovered target changes (not per
  // pixel); the Tooltip component positions itself from the pointer.
  private _handleMove(e: MouseEvent) {
    const p = this._pickAt(e);
    const key = p ? `${p.title}|${p.sub}` : null;
    this.canvas.style.cursor = p ? "pointer" : "grab";
    if (key === this._hoverKey) return;
    this._hoverKey = key;
    useStore.getState().setHover(p ? { title: p.title ?? "", sub: p.sub ?? "" } : null);
  }

  private _handleClick(e: MouseEvent) {
    const p = this._pickAt(e);
    if (!p) return;
    // A hub click selects the metagraph (opens its context pane + frames it) rather
    // than a one-off inspector card; everything else opens the inspector.
    if (p.kind === "meta") {
      useStore.getState().setFilter(p.cfg.id);
    } else {
      this.ctx.controls.autoRotate = false;
      useStore.getState().setInspect(p);
    }
  }

  private focus(name: string) {
    const f = FOCI[name];
    if (f) this._tweenTo(f.pos, f.target);
  }

  // "Understand the network" topic: frame it + dim the rest (ports ui.js focus +
  // _highlight). null clears the dim and returns to the idle overview.
  setLearnFocus(name: string | null) {
    this.focus(name || "overview");
    this.layers.setHighlight(name);
    this.globe.setHighlight(name);
    this.ctx.controls.autoRotate = !name;
  }

  private _tweenTo(toPos: Vec, toTgt: Vec) {
    this.tween = {
      fromPos: this.ctx.camera.position.clone(),
      toPos: toPos.clone(),
      fromTgt: this.ctx.controls.target.clone(),
      toTgt: toTgt.clone(),
      t: 0,
      dur: 1.4,
    };
  }

  private _focusGeo(R: number) {
    const t = THREE.MathUtils.smoothstep(R, 0.7, 1.0);
    this._tweenTo(
      new THREE.Vector3(0, THREE.MathUtils.lerp(11, 9, t), THREE.MathUtils.lerp(36, 27, t)),
      new THREE.Vector3(0, THREE.MathUtils.lerp(2, 2.7, t), 0),
    );
  }

  private _focusFilter(filter: string) {
    this.layers.focusId = null;
    if (filter === "all") {
      this.ctx.controls.autoRotate = true;
      this.focus("overview");
      return;
    }
    this.ctx.controls.autoRotate = false;
    if (filter === "l0" || filter === "l1") {
      this.focus(filter);
      return;
    }
    const meta = this.layers.metas?.find((x: any) => x.cfg.id === filter);
    if (!meta) {
      this.focus("overview");
      return;
    }
    this.layers.focusId = filter; // anchor this hub so it stays framed
    const hub = meta.group.position.clone();
    const out = hub.clone().normalize();
    const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), out).normalize();
    const camPos = hub
      .clone()
      .addScaledVector(out, 12)
      .addScaledVector(side, -6)
      .addScaledVector(new THREE.Vector3(0, 1, 0), 5.5);
    this._tweenTo(camPos, hub);
  }

  // ---- render loop (ports main.js animate) ----
  private start() {
    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.05);

      const target = this.mode === "geo" ? 1 : 0;
      this.morph += (target - this.morph) * Math.min(1, dt * 1.1);
      this.layers.root.visible = this.morph < 0.985;
      this.layers.root.scale.setScalar(Math.max(0.0001, 1 - this.morph));

      this.globe.setMorph(this.morph);
      this.ctx.background.update(dt, this.morph);
      this.layers.update(dt, this.morph);
      this.globe.update(dt);
      this._updateTween(dt);
      this.ctx.controls.update();

      const ledger = this.mode === "ledger";
      if (ledger) {
        this.layers.root.visible = false;
        this.layers.coreGroup.visible = false;
      }
      this.globe.group.visible = !ledger;
      this.ctx.background.mesh.visible = !ledger;

      // Depth of field: only a single focused metagraph in the Hypergraph.
      const metaSel =
        this.mode === "hyper" && this.filter !== "all" && this.filter !== "l0" && this.filter !== "l1";
      const dofMix = THREE.MathUtils.clamp(1 - (this.morph - 0.4) / 0.2, 0, 1);
      this.ctx.dof.enabled = metaSel && dofMix > 0.001;
      if (this.ctx.dof.enabled) {
        const meta = this.layers.metas.find((x: any) => x.cfg.id === this.filter);
        const focusTarget = meta
          ? meta.group.getWorldPosition(this._dofTmp)
          : this.ctx.controls.target;
        this.ctx.dof.uniforms["focus"].value = this.ctx.camera.position.distanceTo(focusTarget);
        this.ctx.dof.uniforms["maxblur"].value = 0.01 * dofMix;
      }

      this.ctx.composer.render();
    };
    loop();
  }

  private _updateTween(dt: number) {
    if (!this.tween) return;
    const tw = this.tween;
    tw.t = Math.min(1, tw.t + dt / tw.dur);
    const e = tw.t < 0.5 ? 2 * tw.t * tw.t : 1 - Math.pow(-2 * tw.t + 2, 2) / 2; // easeInOutQuad
    this.ctx.camera.position.lerpVectors(tw.fromPos, tw.toPos, e);
    this.ctx.controls.target.lerpVectors(tw.fromTgt, tw.toTgt, e);
    if (tw.t >= 1) this.tween = null;
  }

  dispose() {
    this.disposed = true;
    if (this.metaTimer) clearInterval(this.metaTimer);
    this.canvas.removeEventListener("click", this.onClick);
    this.canvas.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("resize", this.onResize);
    this.unsub.forEach((u) => u());
    cancelAnimationFrame(this.raf);
    this.ctx.controls.dispose?.();
    this.ctx.renderer.dispose?.();
    this.ctx.composer.dispose?.();
  }
}
