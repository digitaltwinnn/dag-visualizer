"use client";

import { useEffect, useRef } from "react";

// Mounts the imperative Three.js engine onto a persistent canvas. The engine owns
// its own render loop and never re-renders through React — React only mounts/disposes
// it here, and (in later phases) sends commands + receives pick/hover events.
//
// The engine module is dynamically imported inside the effect so Three.js never
// enters the server bundle (it touches `window`/WebGL). The `disposed` guard makes
// React 18/19 StrictMode's double-invoke in dev safe.
export default function SceneCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let disposed = false;
    let engine: { dispose: () => void } | undefined;

    (async () => {
      const { Engine } = await import("@/src/engine/Engine");
      if (disposed || !canvasRef.current) return;
      engine = new Engine(canvasRef.current);
    })();

    return () => {
      disposed = true;
      engine?.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className="scene-canvas" />;
}
