import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// AN INSTANCED MESH WHOSE INSTANCES MOVE MUST BE HANDED ITS BOUNDS. Made executable 2026-09-01,
// after this cost a user-reported bug that looked like anything but what it was.
//
// three's `InstancedMesh.raycast` opens with:
//
//     if ( this.boundingSphere === null ) this.computeBoundingSphere();
//     if ( raycaster.ray.intersectsSphere( sphere ) === false ) return;
//
// — computed LAZILY, exactly once, from whatever the instance matrices happened to be on the FIRST
// raycast this mesh ever received, and never invalidated. Every instanced pool in this app moves
// constantly (the view morph, the hyper structure flattening on a commit, the hub orbits, the
// ledger trail sliding a slot per tick), so that frozen sphere goes stale almost immediately and
// the ray is then tested against where the instances USED to be. When it misses, the whole mesh
// returns before a single per-instance test runs.
//
// ⚠️ IT IS A SILENT FAILURE, which is the entire reason this test exists. Nothing throws, nothing
// warns, the mesh keeps rendering perfectly, and `frustumCulled = false` — already set at every
// site — does NOT help, because that governs drawing rather than raycasting. The only symptom is
// that clicking stops working, somewhere, sometimes, depending on where the camera was the first
// time anything was hovered. The reported form was "in hyper, click a metagraph, then its node
// spheres don't select": the hub is a separate object and still picked, while the shared node mesh
// was skipped wholesale, so the ray carried on to whichever pool's stale sphere still covered it
// and landed on ANOTHER network's node.
//
// The fix at every site is the same: assign bounds three cannot reject with, so the early-out is a
// no-op and the accurate per-instance loop does the work. That loop is O(count), but picking is
// EVENT-TIME only — a hover or a click, never the render loop — whereas recomputing the sphere per
// frame would pay O(count) every frame to serve the occasional click.
const ROOT = join("src", "engine", "scene");

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [p] : [];
  });

describe("instanced meshes carry explicit bounds (raycast would otherwise go stale)", () => {
  // ⚠️ COUNT CODE, NOT PROSE. The notes at these sites necessarily QUOTE three's own API — the
  // paragraph above contains `this.boundingSphere === null` — and a naive `\.boundingSphere\s*=`
  // matches that, which silently inflated the count until this test passed with the fix removed.
  // Comments are stripped before anything is counted.
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const files = walk(ROOT).map((path) => ({ path, src: strip(readFileSync(path, "utf8")) }));

  it("finds the construction sites it is meant to police", () => {
    // Guards the guard: if InstancedMesh stops being used, or the constructor is renamed/wrapped,
    // this test would pass vacuously forever. It must keep matching something real.
    const withMeshes = files.filter((f) => f.src.includes("new THREE.InstancedMesh("));
    expect(withMeshes.length).toBeGreaterThan(0);
  });

  for (const { path, src } of files) {
    const builds = (src.match(/new THREE\.InstancedMesh\(/g) ?? []).length;
    if (builds === 0) continue;
    it(`${path} assigns boundingSphere for each of its ${builds} instanced mesh(es)`, () => {
      // ⚠️ COUNT THE ACTIONS, NOT THE MENTIONS. A first cut summed every `openBounds(` and every
      // `.boundingSphere =` in the file, and passed with the fix deliberately removed — because the
      // helper's own DEFINITION and its own internal assignment were being counted as if they were
      // call sites. Subtracting the definition is what makes this test able to fail.
      const helperDefs = (src.match(/function openBounds\(/g) ?? []).length;
      const calls = (src.match(/\bopenBounds\(/g) ?? []).length - helperDefs;
      const direct = (src.match(/\.boundingSphere\s*=/g) ?? []).length - helperDefs;
      const assigns = calls + direct;
      expect(
        assigns,
        `${path} builds ${builds} InstancedMesh(es) but assigns bounds ${assigns} time(s). ` +
          `three computes boundingSphere once, lazily, and never invalidates it — a moving pool ` +
          `then raycasts against a stale sphere and silently stops being pickable.`,
      ).toBeGreaterThanOrEqual(builds);
    });
  }
});
