"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/src/store/store";
import { useBootPhase } from "@/components/useBootPhase";

// Mounts the imperative Three.js engine onto a persistent canvas. The engine owns
// its own render loop and never re-renders through React — React only mounts/disposes
// it here, and (in later phases) sends commands + receives pick/hover events.
//
// The engine module is dynamically imported inside the effect so Three.js never
// enters the server bundle (it touches `window`/WebGL). The `disposed` guard makes
// React 18/19 StrictMode's double-invoke in dev safe.
export default function SceneCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phase = useBootPhase();
  // The canvas stays visible in the FLAT ("soon") views too: the transition choreography
  // parks the node fleet at the staging grids there (user, 2026-07-17 — the parked squares
  // are the "the network is still here" element above the Blueprint schematic; every view's
  // furniture is alpha'd to 0, so only the nodes and backdrop render). Mode no longer gates
  // the canvas fade — only the boot handoff does.

  useEffect(() => {
    let disposed = false;
    let engine: { dispose: () => void } | undefined;

    (async () => {
      const { Engine } = await import("@/src/engine/Engine");
      if (disposed || !canvasRef.current) return;
      try {
        engine = new Engine(
          canvasRef.current,
          () => useStore.getState().setEngineReady(true),
          () => useStore.getState().setSceneReady(true),
        );
      } catch (err) {
        // WebGL context creation (or any engine-construction step) threw — the scene can't run.
        // Flag it so the boot phase resolves to "no-engine" instead of hanging on "booting"
        // forever (engineReady would never fire). Data + flat views still work.
        console.error("[SceneCanvas] engine failed to start:", err);
        useStore.getState().setEngineFailed(true);
      }
    })();

    return () => {
      disposed = true;
      engine?.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className={"scene-canvas" + (phase === "live" ? " scene-in" : "")} />;
}
