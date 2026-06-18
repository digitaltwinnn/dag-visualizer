import * as THREE from "three";
// Existing vanilla modules, reused untouched. They use bare specifiers ("three",
// "three/addons/...") which now resolve via npm. No types yet — typed wrappers come
// in a later phase as the engine API is formalized.
// @ts-expect-error - vanilla JS module, no type declarations yet
import { createScene } from "../../js/scene.js";
// @ts-expect-error - vanilla JS module, no type declarations yet
import { Layers } from "../../js/layers.js";

// Imperative engine: owns the scene, the render loop, and (later) the command/event
// surface that React drives. Phase 0 renders the Hypergraph (core + metagraph hubs +
// starfield) so we can prove the engine-in-React pattern and npm Three before wiring
// live data, the globe, and panels.
export class Engine {
  private ctx: ReturnType<typeof createScene>;
  private layers: InstanceType<typeof Layers>;
  private clock = new THREE.Clock();
  private raf = 0;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = createScene(canvas);
    this.layers = new Layers(this.ctx.scene);
    this.start();
  }

  private start() {
    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      // morph = 0 (Hypergraph). Globe/ledger/DoF land in later phases.
      this.ctx.background.update(dt, 0);
      this.layers.update(dt, 0);
      this.ctx.controls.update();
      this.ctx.composer.render();
    };
    loop();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ctx.controls.dispose?.();
    this.ctx.renderer.dispose?.();
    this.ctx.composer.dispose?.();
  }
}
