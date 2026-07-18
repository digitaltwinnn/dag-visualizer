// src/engine/domainExportCoverage.test.ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ENFORCEMENT (spec Part B #1): every VALUE export of a domain module must be referenced by its
// sibling <name>.test.ts — the executable form of "new domain behaviour lands WITH a colocated
// test". Type-only exports (interface/type) carry no behaviour and are skipped. A house grep,
// same idiom as layerBoundaries.test.ts.
const DOMAIN = join(import.meta.dirname, "domain");

// Value exports (functions/consts/classes) declared on `export` lines, excluding `export type`
// and `export interface`. Also skips re-exports (`export { x } from`) — those are covered where
// defined. Returns the exported identifiers.
function valueExports(src: string): string[] {
  const out: string[] = [];
  const re = /^export\s+(?:(const|let|var|function|class|async function)\s+([A-Za-z0-9_]+)|\{([^}]*)\})/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[2]) out.push(m[2]);
    else if (m[3] && !/from\s+["']/.test(src.slice(m.index, m.index + 200))) {
      for (const part of m[3].split(",")) {
        const id = part.trim().split(/\s+as\s+/)[0].trim();
        if (id && !id.startsWith("type ")) out.push(id);
      }
    }
  }
  return out;
}

describe("domain export coverage", () => {
  const files = readdirSync(DOMAIN)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

  for (const f of files) {
    it(`${f}: every value export is referenced by ${f.replace(".ts", ".test.ts")}`, () => {
      const src = readFileSync(join(DOMAIN, f), "utf8");
      const exports = valueExports(src);
      if (exports.length === 0) return; // a types-only module (e.g. records.ts) needs no test
      const testPath = join(DOMAIN, f.replace(".ts", ".test.ts"));
      expect(existsSync(testPath), `${f} has value exports but no sibling test file`).toBe(true);
      const testSrc = readFileSync(testPath, "utf8");
      const missing = exports.filter((e) => !new RegExp(`\\b${e}\\b`).test(testSrc));
      expect(missing, `${f}: exports not referenced in its test: ${missing.join(", ")}`).toEqual([]);
    });
  }
});
