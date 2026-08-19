// ENFORCEMENT: every ledger module that PLACES A ROW must also consult the trail's boundaries.
//
// Its sibling `domain/ledgerModel.test.ts` proves the boundaries themselves finish inside the
// glass — that the RAMPS are short enough. This one guards the other half of the same rule: that
// they are actually asked. The two are independent, and this is the half history keeps failing.
// The byte bar's SEED branch shipped without the front multiply (user, 2026-08-18: "these forming
// blocks are drawn in front, outside of the panel"), and the front formula had a second home in
// the bar at the time, which is how one write path came to miss it at all. A new instrument added
// to the chamber — another label column, another marker riding the trail — is exactly that bug
// waiting to happen again, and it costs nothing to notice at test time.
//
// THE RULE, and it is deliberately coarse: a module that imports `SLOT_SP` computes a row's X from
// its slot, so it is a trail instrument, so it must reference a boundary. Four tokens count:
//
//   · `frontAt` / `rowOnChamber` — the domain functions, asked directly;
//   · `fadeAtX`  — TrailRewind's delegate to `frontAt`, which is what the view and its objects use;
//   · `setRowFade` — the ONE honest exemption. `Ribbons` bakes its brightness into vertex colours
//     at event time, so it cannot read a per-frame fade; the view resolves `fadeAtX` for each sheet
//     and pushes it in. The module states its dependence by having the setter, and this test accepts
//     that as the consult. It is not a loophole worth closing: a module that grows a `setRowFade`
//     it never uses has gone out of its way to lie, whereas a module that grows a draw loop and no
//     boundary at all is the ordinary accident.
//
// Coarse means it can pass a module that imports SLOT_SP for something else entirely and happens to
// mention a boundary. That is fine — the cost of a false PASS here is one uncaught mistake, and the
// geometry sweep plus the pick test in ledgerModel.test.ts still hold; the cost of a false FAIL is a
// test that gets edited away. Scoped to `scene/` because that is where ink is written: the domain
// has no meshes, and `Engine.ts` places no rows.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SCENE = join(process.cwd(), "src/engine/scene");

/** What counts as consulting a boundary. See the header for why `setRowFade` is one of them. */
const BOUNDARY = /\b(frontAt|fadeAtX|rowOnChamber|setRowFade)\b/;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

/** Modules that derive a row's position from its slot — the trail's instruments. */
function rowPlacers(): { path: string; src: string }[] {
  return walk(SCENE)
    .map((path) => ({ path, src: readFileSync(path, "utf8") }))
    .filter(({ src }) => /\bSLOT_SP\b/.test(src));
}

describe("no row is drawn off the chamber", () => {
  it("finds the trail's instruments at all (a scan matching nothing passes vacuously)", () => {
    const found = rowPlacers().map((f) => f.path.slice(SCENE.length + 1));
    expect(found.length).toBeGreaterThanOrEqual(3);
    expect(found).toContain("views/LedgerView.ts");
    expect(found).toContain("objects/ByteBar.ts");
  });

  it("has every one of them consult a boundary", () => {
    const missing = rowPlacers()
      .filter(({ src }) => !BOUNDARY.test(src))
      .map((f) => f.path.slice(SCENE.length + 1));
    expect(missing).toEqual([]);
  });
});
