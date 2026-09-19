// A DRAG THAT STARTS ON A HUD SURFACE OVER THE SCENE BECOMES THE SCENE'S OWN ORBIT (user,
// 2026-09-19: the History cards' header "should also be draggable and rotate the scene like when
// we click & drag on the actual scene").
//
// The chart planes are DOM laid over the canvas, and the parts of them that take pointer events —
// each header strip, and the whole front card — are exactly where a reader's hand lands. A press
// there that turns into a drag used to go nowhere: the card swallowed it, and the scene under the
// reader's pointer refused to turn.
//
// The handoff is one synthetic `pointerdown` on the canvas, carrying the REAL pointer's id. Three's
// OrbitControls answers a pointerdown by capturing that pointer and listening on the document for
// its moves — so from that instant the browser delivers the rest of the gesture to the controls
// natively: the same damping, the same limits, the same touch handling as a drag begun on the
// scene. Nothing here knows about the camera, and no component imports the engine (rule 1): it is
// DOM speaking to DOM through the canvas's own class, which `SceneCanvas` owns.
//
// ⚠️ CALL IT ONCE THE PRESS HAS TRAVELLED PAST THE CLICK SLOP, NEVER ON POINTERDOWN. A press that
// stays put is a click and belongs to the surface it landed on; capturing the pointer away at
// pointerdown would retarget its pointerup — and with it the click.

/** Hand a pointer that is already DOWN over to the scene's orbit controls. Returns false when
 *  there is no canvas to hand it to (the engine failed to boot), so the caller can carry on. */
export function handOrbitToScene(e: {
  pointerId: number;
  pointerType: string;
  isPrimary: boolean;
  clientX: number;
  clientY: number;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}): boolean {
  const canvas = document.querySelector<HTMLCanvasElement>("canvas.scene-canvas");
  if (!canvas) return false;
  canvas.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      isPrimary: e.isPrimary,
      button: 0,
      buttons: 1,
      clientX: e.clientX,
      clientY: e.clientY,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
    }),
  );
  return true;
}
