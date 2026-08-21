import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// EVERY own-server fetch goes through netUrl() (src/net/current.ts) — the one place the
// ?net= param is appended. A direct fetch("/api/…") behaves identically on mainnet (netUrl
// appends nothing there) and silently talks to MAINNET's routes under ?net=integrationnet /
// ?net=testnet: the page styles itself for one network while plotting another's data. The
// mistake is invisible in every mainnet test and every mainnet browser check, which is why
// it needs a fence rather than a review note.
//
// So: fetch(netUrl("/api/…")), or an exemption here with a reason.
const ROOTS = ["components", "src", "app"];
const EXEMPT: Record<string, string> = {};

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : walk(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("netUrl one-home boundary", () => {
  it("no file fetches an /api/ literal directly — route it through netUrl()", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const rel = file.replace(/\\/g, "/");
        if (rel in EXEMPT) continue;
        if (/fetch\(\s*["'`]\/api\//.test(stripComments(readFileSync(file, "utf8")))) offenders.push(rel);
      }
    }
    expect(
      offenders,
      `call fetch(netUrl("/api/…")) so the ?net= param rides every own-server request — or add an exemption with a reason: ${offenders.join(", ")}`
    ).toEqual([]);
  });
});
