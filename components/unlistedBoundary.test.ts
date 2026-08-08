import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// The ONE-HOME rule for the unlisted pseudo-network, made executable (2026-08-08 — the
// selectionBoundary idiom). Every scattered `filter === "unlisted"` branch grew its own bug
// during the 2026-08-07 session; the id string may exist as a LITERAL only in its two homes:
//
//   · src/data/unlisted.ts            — UNLISTED_ID + the display/data helpers (the one home)
//   · src/engine/domain/ledgerBands.ts — UNLISTED_KEY (the domain twin; the ledger's lane/band
//     machinery matches the filter id by construction and the domain layer may not import the
//     data-layer home)
//
// Everything else imports one of the two. Comments may say the word; CODE may not carry the
// quoted literal.
const ROOTS = ["components", "src"];
const HOMES = new Set(["src/data/unlisted.ts", "src/engine/domain/ledgerBands.ts"]);

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : walk(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("unlisted one-home boundary", () => {
  it('the "unlisted" id literal lives only in its two homes', () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        if (HOMES.has(file.replace(/\\/g, "/"))) continue;
        const code = stripComments(readFileSync(file, "utf8"));
        if (code.includes('"unlisted"') || code.includes("'unlisted'")) offenders.push(file);
      }
    }
    expect(offenders, `import UNLISTED_ID (data) or UNLISTED_KEY (domain) instead: ${offenders.join(", ")}`).toEqual([]);
  });
});
