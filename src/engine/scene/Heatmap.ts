// The geo density heatmap — soft radial glow sprites + encircling rings, one pair per
// co-located cluster. Split out of js/globe.js (lines 311-350 + the glow-texture/heat-colour
// helpers 1163-1191) as a self-contained adapter over the pure `Cluster` records from
// spreadCoLocated (domain/nodeLayout). Owns its own group + cached geometries/texture; the
// morph loop fades it via `fade(mix)` (the traverse callback is stored, not re-created per
// frame — the plan's allocation fix).

import * as THREE from "three";
import { R, LAND_H } from "../domain/geoMath";
import type { Cluster } from "../domain/nodeLayout";

const Z_AXIS = new THREE.Vector3(0, 0, 1);

export class Heatmap {
  private parent: THREE.Group;
  private heatGroup: THREE.Group | null = null;
  private _glowTex: THREE.CanvasTexture | null = null;
  private _heatGeo: THREE.PlaneGeometry | null = null;
  private _ringGeo: THREE.RingGeometry | null = null;

  // fade() stores the mix and reuses one traverse callback (never re-allocated per frame).
  private _mix = 0;
  private readonly _fadeCb = (o: THREE.Object3D) => {
    if (o.userData && o.userData.baseOpacity != null) {
      ((o as THREE.Mesh).material as THREE.Material & { opacity: number }).opacity =
        o.userData.baseOpacity * this._mix;
    }
  };

  constructor(parent: THREE.Group) {
    this.parent = parent;
  }

  // `clusters` come from spreadCoLocated: { center, count, spread (radians) }.
  rebuild(clusters: Cluster[]): void {
    if (this.heatGroup) {
      this.heatGroup.children.forEach((s) => (s as THREE.Mesh).material && ((s as THREE.Mesh).material as THREE.Material).dispose());
      this.parent.remove(this.heatGroup);
    }
    this.heatGroup = new THREE.Group();
    this.parent.add(this.heatGroup);
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

  // js/globe.js `_fade(this.heatGroup, m)` — scale every sprite's opacity by the eased morph.
  fade(mix: number): void {
    if (!this.heatGroup) return;
    this._mix = mix;
    this.heatGroup.traverse(this._fadeCb);
  }
}

// Soft radial glow sprite used for the heatmap.
function makeGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.4)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// Cool -> hot gradient for density (blue -> green -> yellow -> red).
const HEAT_STOPS: [number, THREE.Color][] = [
  [0.0, new THREE.Color(0x1a6cff)],
  [0.35, new THREE.Color(0x36e29a)],
  [0.65, new THREE.Color(0xffd166)],
  [1.0, new THREE.Color(0xff5a3c)],
];
function heatColor(t: number): THREE.Color {
  for (let i = 0; i < HEAT_STOPS.length - 1; i++) {
    const [a, ca] = HEAT_STOPS[i];
    const [b, cb] = HEAT_STOPS[i + 1];
    if (t <= b) return ca.clone().lerp(cb, (t - a) / (b - a));
  }
  return HEAT_STOPS[HEAT_STOPS.length - 1][1].clone();
}
