import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// SELECTION-WRITE BOUNDARY (user, 2026-07-11 — set ahead of future rail cards): components
// must not write the SELECTION channels directly. Selection intent flows through the tested
// decision table (src/engine/domain/pickActions — builders per interaction) and the ONE
// executor (src/store/applyClickActions), so every card/row/bar added later inherits the
// same semantics and every new behaviour lands as a tested table entry.
//
// The rule is WRITE-based, not card-based — it maps onto the card categories by itself:
//   - EXPLORER cards (left rail: GeoExplore, LedgerPanel) + the strip/picker/scene are the
//     interactive category — they SELECT, so they run the table;
//   - FACTS cards (right rail) are read-only — the rule costs them nothing; their one
//     interaction (the "Clear selection" ×) is still a selection write and goes through the
//     executor like everything else.
//
// In scope: the selection setters (setFilter / setCountry / setInspect / setSnap / setLayer /
// setFollowing). NOT in scope: the hover channels (subjectPairing's lane), view/mode
// navigation, phone-UI chrome, and data-bridge setters — those are not selections.
//
// Cheap grep over real source (the house pattern — see engine/layerBoundaries.test.ts and
// engine/noHardcodedColors.test.ts).

const COMPONENTS = join(import.meta.dirname, ".");

// The one legitimate direct writer: the follow SYSTEM (auto-follow is programmatic behaviour,
// not a user pick). Anything else that needs an exemption should instead get a table entry.
const ALLOW = new Set(["FollowController.tsx"]);

const SELECTION_SETTERS = /\bset(Filter|Country|Inspect|Snap|Layer|Following|Cohort)\b/;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

describe("selection-write boundary (components → pickActions table → applyClickActions)", () => {
  it("no component writes a selection setter directly", () => {
    const bad: string[] = [];
    for (const file of sourceFiles(COMPONENTS)) {
      const name = file.slice(COMPONENTS.length + 1);
      if (ALLOW.has(name)) continue;
      const src = readFileSync(file, "utf8");
      for (const [i, line] of src.split("\n").entries()) {
        if (SELECTION_SETTERS.test(line)) bad.push(`${name}:${i + 1}  ${line.trim()}`);
      }
    }
    expect(bad, "selection writes must go through applyClickActions — add a pickActions builder instead").toEqual([]);
  });

  it("the allowlist only names files that still exist (no stale exemptions)", () => {
    for (const name of ALLOW) {
      expect(existsSync(join(COMPONENTS, name)), `${name} vanished — drop it from ALLOW`).toBe(true);
    }
  });

  it("the channel state panel reads the store and never writes a selection", () => {
    const src = readFileSync("components/datasection/ChannelStatePanel.tsx", "utf8");
    expect(src).not.toMatch(/set(Inspect|Snap|MetaSnap|Layer|Filter|Country|Cohort|Composition)\(/);
  });
});
