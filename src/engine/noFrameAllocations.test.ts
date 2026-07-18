// src/engine/noFrameAllocations.test.ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ENFORCEMENT (spec Part B #3): the per-frame render path allocates nothing. We scan the BODIES
// of per-frame methods in scene/ + Engine.ts and flag `new THREE.*` / `.clone()` on any line
// lacking an `event-time` marker (the escape hatch for genuine event-driven allocation inside a
// branch). Heuristic — the markers ARE the documentation of every intentional allocation.
// The regex's known holes (object/array literals, un-namespaced constructors) are DELIBERATE
// (Plan 2 Task 9 triage): the scene imports THREE as a namespace everywhere (an un-namespaced
// `new Vector3()` would need an import-style change layerBoundaries.test.ts flags), and
// object-literal detection is too noisy for a grep gate.
const HERE = import.meta.dirname;
const SCENE = join(HERE, "scene");
// Engine.ts's render-loop phase methods (Task 7, spec C#1) join the scan: the loop closure used
// to hide this code from the gate entirely (its body lived in a closure, not a method the walk
// could see) — extracting it into named phases brings it under the same enforcement.
const ENGINE_FILE = join(HERE, "Engine.ts");
// Method names whose bodies run every frame (or per-record within a frame).
const PER_FRAME = /^\s*(?:private\s+|public\s+)?(update|updateRotation|setMorph|write\w+|place\w+|_apply\w+|_integrate\w+|_derive\w+|_write\w+)\s*\(/;
const ALLOC = /new\s+THREE\.\w+\(|\.clone\(\)/;

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...tsFiles(p));
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

// Extract the line ranges of per-frame method bodies via brace matching.
function perFrameBodies(lines: string[]): [number, number][] {
  const ranges: [number, number][] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!PER_FRAME.test(lines[i])) continue;
    let depth = 0, started = false;
    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === "{") { depth++; started = true; }
        else if (ch === "}") depth--;
      }
      if (started && depth === 0) { ranges.push([i, j]); i = j; break; }
    }
  }
  return ranges;
}

describe("no per-frame allocations in scene/ + Engine.ts", () => {
  for (const file of [...tsFiles(SCENE), ENGINE_FILE]) {
    const label = file.slice(HERE.length + 1); // "scene/objects/NodeFabric.ts" / "Engine.ts"
    it(`${label} allocates nothing in per-frame bodies (or marks it event-time)`, () => {
      const lines = readFileSync(file, "utf8").split("\n");
      const offenders: string[] = [];
      for (const [a, b] of perFrameBodies(lines)) {
        for (let i = a; i <= b; i++) {
          const code = lines[i].split("//")[0];
          if (ALLOC.test(code) && !lines[i].includes("event-time")) {
            offenders.push(`  line ${i + 1}: ${lines[i].trim()}`);
          }
        }
      }
      expect(offenders, `per-frame allocation without an \`event-time\` marker:\n${offenders.join("\n")}`).toEqual([]);
    });
  }
});
