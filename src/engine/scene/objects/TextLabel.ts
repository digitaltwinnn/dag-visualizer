import * as THREE from "three";

// The generic in-scene TEXT LABEL — canvas-texture → flat plane mesh, the FURNITURE half of the
// label split (user, 2026-08-15: "furniture can be regular threejs object text, subjects more
// 2d/3d html type of content"). Scene text blooms on the scene lane and rides group transforms
// and shader fades, which HUD DOM never could; the SUBJECT callout is the other half
// (components/SceneCallout.tsx). The chamber's `makeEdgeLabel` (SnapshotPlane.ts) predates this
// and stays the chamber-frame WRAPPER — its canvas metrics and +X-frame orientation are the
// chamber's own idiom; new call sites build here and orient themselves.
//
// The mesh is a PlaneGeometry in XY facing +Z, centered on its text, positioned at the origin —
// the CALLER owns orientation and placement. Event-time only (one canvas per label); dispose
// geometry, material and map when rebuilt.
export function makeTextLabel(toneCss: string, text: string, height: number, weight = 400): THREE.Mesh {
  const c = document.createElement("canvas");
  const SS = 2;
  c.width = 512 * SS;
  c.height = 64 * SS;
  const ctx = c.getContext("2d")!;
  ctx.font = `${weight} ${26 * SS}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = toneCss;
  ctx.fillText(text, c.width / 2, c.height / 2 + 2 * SS);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  const w = height * (c.width / c.height);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, height),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  mesh.renderOrder = 2;
  return mesh;
}

/** Dispose a label built above — geometry, material and its canvas texture. */
export function disposeTextLabel(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();
  const mat = mesh.material as THREE.MeshBasicMaterial;
  mat.map?.dispose();
  mat.dispose();
}
