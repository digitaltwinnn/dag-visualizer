import * as THREE from "three";

// The ONE canvas radial-gradient sprite factory (spec A#4): white stops so the material's
// `color` tints it; the stop table is the whole difference between the geo glow-pool sprite
// and the hyper ring-fill band. Event-time (called once per texture, cached by the callers).
export function makeRadialGradientTexture(stops: [number, string][]): THREE.Texture {
  const s = 128;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  for (const [at, color] of stops) g.addColorStop(at, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
