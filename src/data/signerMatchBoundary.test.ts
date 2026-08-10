import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// SIGNER MATCHING HAS ONE HOME (2026-08-09 — the unlistedBoundary idiom), and the reason is a bug
// that hid in plain sight for a session: a peer id belongs to a LAYER, not to a machine. Each layer
// process runs its own keypair, so a hybrid answers with a different id on its l0 port than on its
// dl1 port — snapshot proofs are sealed by the l0 cluster, data blocks by the dL1 cluster. Matching
// a signer against `NodeInfo.id` alone therefore rendered every hybrid data-block signer as "not in
// live set" while the machine sat right there in the list.
//
// The fix is `NodeInfo.ids` (every layer id, primary first) plus ONE private matcher over it:
// `carriesSigner` in src/data/network.ts, which `resolveSignerIps` (the scene glow), `matchSignerRow`
// and `resolveSigner` (the three signer surfaces) all route through. A second, local prefix compare
// anywhere else would silently reintroduce the per-layer blind spot for that surface only — the
// truncated-id shape makes it look like an ordinary string test, which is exactly why it needs a
// test rather than a comment.
//
// So: a prefix comparison lives in the home, or it is EXEMPT here with a reason.
const ROOTS = ["components", "src", "app"];
const HOME = "src/data/network.ts";
const EXEMPT: Record<string, string> = {
  // A CSS value sniff, not an identifier: does the resolved accent read `var(...)` (unresolvable
  // in an SVG stroke attribute) rather than a hex? Nothing to do with peer ids.
  "components/RailThread.tsx": "CSS value sniff (`var(` prefix), not an id comparison",
};

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : walk(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const posix = (p: string) => p.replace(/\\/g, "/");

describe("signer-matching one-home boundary", () => {
  it("prefix comparison lives in src/data/network.ts, or is exempt with a reason", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const rel = posix(file);
        if (rel === HOME || rel in EXEMPT) continue;
        if (/\.startsWith\(/.test(stripComments(readFileSync(file, "utf8")))) offenders.push(rel);
      }
    }
    expect(
      offenders,
      `a truncated signer must be resolved through network.ts (resolveSigner / matchSignerRow / ` +
        `resolveSignerIps) so it matches EVERY layer id — or add an exemption with a reason: ${offenders.join(", ")}`
    ).toEqual([]);
  });

  it("the home matches against the layer id SET, and every surface routes through it", () => {
    // Behaviour is pinned in network.test.ts ("matches a hybrid machine's SECONDARY layer id");
    // this pins the SHAPE that keeps the three surfaces from drifting apart — one matcher, fed by
    // `ids` with `id` only as the fallback for a node the route predates.
    const home = stripComments(readFileSync(HOME, "utf8"));
    expect(home, "the matcher must read the id set, not a single id").toMatch(
      /idsOfNode\s*=[\s\S]*?\bids\b[\s\S]*?:\s*n\.id\s*\?/
    );
    expect(home.match(/\.startsWith\(/g)?.length, "exactly one prefix comparison in the home").toBe(1);
    // Each surface's entry point, and what it must route through. The `(` matters: without it
    // `resolveSigner` would match `resolveSignerIps` first and assert nothing.
    const bodyOf = (fn: string): string => {
      const i = home.indexOf(`function ${fn}(`);
      expect(i, `${fn} is gone from the home`).toBeGreaterThan(-1);
      return home.slice(i).split("\n}")[0];
    };
    expect(bodyOf("resolveSignerIps"), "the scene glow must match through carriesSigner").toContain("carriesSigner");
    expect(bodyOf("matchSignerRow"), "the row lookup must match through carriesSigner").toContain("carriesSigner");
    expect(bodyOf("resolveSigner"), "the known/unknown decision must reuse matchSignerRow").toContain("matchSignerRow");
  });
});
