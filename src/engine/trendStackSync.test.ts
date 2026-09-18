import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { TrendStackSync, type TrendPlaneEl, type TrendStackState } from "./TrendStackSync";
import { FOCI } from "./domain/cameraRig";

// THE PROJECTOR'S CONTRACT, made executable. `TrendStackSync` is `CalloutSync`'s sibling — narrow
// state in, a CSS `matrix3d` out — and every one of its rules fails SILENTLY in the browser: a
// stack that never settles, a plane flashing at the top-left corner, a frame budget quietly spent
// projecting a camera that has not moved. So each is pinned here rather than looked at.
//
// ⚠️ NODE ENV, NO DOM. vitest runs `environment: "node"` in this repo, so there is no `document`
// and no jsdom to borrow one from. That is not a limitation worked around — it is the reason the
// host owns element RESOLUTION (`plane(id)`): the projector never queries the DOM, it is handed an
// object with a `style` and an `isConnected`, and the Engine is the only place a `querySelector`
// lives. The fakes below are exactly that contract's surface, which is why they are three fields.
//
// EXEMPTIONS: none.

/** A stand-in for one `[data-plane]` anchor — precisely the surface `TrendPlaneEl` declares. */
const mkEl = (): TrendPlaneEl => ({ style: { transform: "", visibility: "" }, isConnected: true });

function fakeHost(opts: { pos?: THREE.Vector3; target?: THREE.Vector3 } = {}) {
  // The real resting pose, so the numbers below are the ones the view actually renders.
  const camera = new THREE.PerspectiveCamera(55, 1500 / 1000, 0.1, 2000);
  camera.position.copy(opts.pos ?? FOCI.trend.pos);
  camera.lookAt(opts.target ?? FOCI.trend.target);
  camera.updateMatrixWorld();

  const els = new Map<string, TrendPlaneEl>();
  let active = true;
  let dt = 1 / 60;
  const root = { dataset: {} as { on?: string } };
  const host = {
    camera,
    width: () => 1500,
    height: () => 1000,
    dt: () => dt,
    // Lazily minted, so every id the projector asks for resolves — the Engine's own cache does
    // the same thing against the real DOM.
    plane: (id: string): TrendPlaneEl | null => {
      let e = els.get(id);
      if (!e) { e = mkEl(); els.set(id, e); }
      return e;
    },
    root: () => root,
    active: () => active,
  };
  return {
    host, els, camera, root,
    setActive: (v: boolean) => { active = v; },
    setDt: (v: number) => { dt = v; },
  };
}

const state = (over: Partial<TrendStackState> = {}): TrendStackState => ({
  layout: "stack", scroll: 0, focus: null, ids: ["a", "b", "c"], ...over,
});

/** The uniform scale out of a `matrix3d(s,0,0,0, 0,s,0,0, 0,0,1,0, tx,ty,0,1)` string. */
const scaleOf = (tf: string): number => Number(tf.slice("matrix3d(".length).split(",")[0]);

describe("TrendStackSync", () => {
  it("allocates nothing per frame — the scratch is bound once", () => {
    // Rule 5. The vector and the camera-matrix cache are fields, not locals: a `new THREE.Vector3()`
    // inside `sync` is five allocations a frame at 60fps in the one view that already runs five
    // composited DOM layers.
    const { host } = fakeHost();
    const sync = new TrendStackSync(host);
    const peek = sync as unknown as { _v: unknown; _cam: unknown };
    sync.sync(state());
    const v = peek._v;
    const cam = peek._cam;
    expect(v).toBeDefined();
    expect(cam).toBeDefined();
    for (let i = 0; i < 10; i++) sync.sync(state({ ids: ["a", "b", "c"] }));
    expect(peek._v).toBe(v);
    expect(peek._cam).toBe(cam);
  });

  it("writes a matrix3d onto every plane, front-facing, nearest largest", () => {
    const { host, els } = fakeHost();
    const ids = ["a", "b", "c"];
    new TrendStackSync(host).sync(state({ ids }));
    const tfs = ids.map((id) => els.get(id)!.style.transform);
    for (const tf of tfs) {
      // FRONT-FACING IS THE WHOLE POINT (the plane hosts real text): the matrix is a uniform scale
      // plus a translate, with every rotation/skew term zero, so the compositor never re-rasters.
      expect(tf).toMatch(/^matrix3d\(-?[\d.]+,0,0,0,0,-?[\d.]+,0,0,0,0,1,0,-?[\d.]+,-?[\d.]+,0,1\)$/);
    }
    // Depth reads as size: slot 0 sits nearest, so its scale is the largest and it falls monotonically.
    const s = tfs.map(scaleOf);
    expect(s[0]).toBeGreaterThan(s[1]!);
    expect(s[1]).toBeGreaterThan(s[2]!);
    for (const id of ids) expect(els.get(id)!.style.visibility).toBe("visible");
  });

  it("hides a plane behind the camera rather than writing it a garbage matrix", () => {
    // A point at or behind the near plane projects through a non-positive w — the NDC that comes
    // back is not "off screen", it is mirrored and arbitrarily huge. Hiding is the only honest
    // answer; a clamped matrix parks a chart in a corner as though it had been placed there.
    const { host, els, camera } = fakeHost();
    const sync = new TrendStackSync(host);
    sync.sync(state({ ids: ["a", "b", "c"] }));
    expect(els.get("a")!.style.visibility).toBe("visible");
    const placed = els.get("a")!.style.transform;

    // Dive past slot 0's own depth, still looking down the stack: "a" is now behind the lens.
    camera.position.set(0, 2, -1);
    camera.lookAt(0, 2, -18);
    camera.updateMatrixWorld();
    sync.sync(state({ ids: ["a", "b", "c"] }));
    expect(els.get("a")!.style.visibility).toBe("hidden");
    expect(els.get("a")!.style.transform, "a hidden plane keeps its last matrix, it is never given a bogus one").toBe(placed);
    // Its neighbours are genuinely in front and keep tracking.
    expect(els.get("b")!.style.visibility).toBe("visible");
    expect(els.get("b")!.style.transform).toMatch(/^matrix3d\(/);
  });

  it("leaves a plane alone until it has something true to say about it", () => {
    // The anchor mounts hidden by its own class, so a plane that has NEVER been placeable is not
    // written at all — no transform, no inline visibility. Writing `hidden` onto an already-hidden
    // element is a style invalidation for nothing, five times a frame.
    const { host, els } = fakeHost({
      pos: new THREE.Vector3(0, 2, 0),       // sits exactly ON slot 0's depth
      target: new THREE.Vector3(0, 2, -18),
    });
    new TrendStackSync(host).sync(state({ ids: ["a", "b"] }));
    expect(els.get("a")!.style.transform).toBe("");
    expect(els.get("a")!.style.visibility).toBe("");
  });

  it("goes quiet when the camera and the state both hold still", () => {
    // THE MAIN PERFORMANCE LEVER. The trends feed refreshes every five minutes and the camera parks
    // between gestures, so the steady state of this view is "nothing to say" — and five DOM style
    // writes a frame for nothing is exactly the cost this whole approach has to avoid.
    const { host, els } = fakeHost();
    const sync = new TrendStackSync(host);
    const s = state();
    sync.sync(s);
    sync.sync(s); // settle whatever the first frame started
    els.get("a")!.style.transform = "";
    els.get("b")!.style.transform = "";
    sync.sync(s);
    sync.sync(s);
    expect(els.get("a")!.style.transform).toBe("");
    expect(els.get("b")!.style.transform).toBe("");
  });

  it("travels to a new layout and then goes quiet again", () => {
    const { host, els } = fakeHost();
    const sync = new TrendStackSync(host);
    const stacked = state();
    sync.sync(stacked);
    sync.sync(stacked);
    // A plane SEEN FOR THE FIRST TIME starts at its target — no fly-in from the origin — so the
    // stack is already settled here, which is what makes the travel below attributable to the ease.
    const rest = els.get("c")!.style.transform;

    const flat = state({ layout: "flat" });
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) { sync.sync(flat); seen.push(els.get("c")!.style.transform); }
    expect(seen[0]).not.toBe(rest);              // it moved
    expect(new Set(seen).size).toBe(seen.length); // and kept moving — a jump would repeat at once
    // Converging: each step is smaller than the last (an exponential ease, not a linear ramp).
    const sc = seen.map(scaleOf);
    expect(Math.abs(sc[1]! - sc[0]!)).toBeLessThan(Math.abs(sc[0]! - scaleOf(rest)));

    for (let i = 0; i < 400; i++) sync.sync(flat);
    els.get("c")!.style.transform = "";
    sync.sync(flat);
    expect(els.get("c")!.style.transform, "the ease must settle and the idle skip re-engage").toBe("");
  });

  it("hides the whole stack while the view is not live, and announces it on the root", () => {
    const { host, els, root, setActive } = fakeHost();
    const sync = new TrendStackSync(host);
    sync.sync(state());
    expect(root.dataset.on).toBe("1");
    setActive(false);
    sync.sync(state());
    expect(root.dataset.on).toBe("0");
    expect(els.get("a")!.style.visibility).toBe("hidden");
  });

  it("stops reaching for a root that has gone away, but keeps waiting for one that has not arrived", () => {
    // ⚠️ Asymmetric on purpose — see `_announce`. Symmetric, this is a `getElementById` every frame
    // in hyper, geo and the ledger, which is exactly the cost the idle skip exists to remove.
    const { host, setActive } = fakeHost();
    let looks = 0;
    const sync = new TrendStackSync({ ...host, root: () => { looks++; return null; } });

    // ON with no root yet: it keeps looking, because the stack mounts a commit late.
    for (let i = 0; i < 3; i++) sync.sync(state());
    expect(looks).toBe(3);

    // OFF with no root: the stack has been unmounted, and a remount carries no attribute — so it
    // settles after ONE look rather than asking again every frame for the rest of the session.
    setActive(false);
    looks = 0;
    for (let i = 0; i < 5; i++) sync.sync(state());
    expect(looks).toBe(1);
  });

  it("never imports the store as a value", () => {
    // Rule 1: the engine LAYER is the one store bridge, and this module is not it — the Engine reads
    // the slice once per frame and hands it in. `layerBoundaries.test.ts` says the same thing from
    // the other side; this says it at the point where the temptation lives.
    const src = readFileSync("src/engine/TrendStackSync.ts", "utf8");
    expect(/^\s*import\s+(?!type\b)[^;]*from\s+["']@\/src\/store\//m.test(src)).toBe(false);
    expect(/from\s+["']react["']/.test(src)).toBe(false);
  });
});
