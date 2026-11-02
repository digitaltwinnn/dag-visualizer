import { expect } from "vitest";
import type { Fact } from "@/src/data/noteTypes";

// TEST-ONLY: the one `pairsOf` the four facts builders' tests share (review M5: it was copied into
// each). It lives in a subdirectory so it is no `src/data/` module: the export-coverage rule
// (`dataExportCoverage.test.ts`) reads `src/data/*.ts` only, and this is a test helper, not data
// logic, so it carries no sibling test and is never imported by app code.

/** The pairs a facts list tags (R54), by key in the order their first end appears, each as
 *  [from label, from value, to label, to value]. Fails the calling test when a key holds two of
 *  one end or only one end: a pair is exactly one earlier and one later reading. */
export function pairsOf(facts: readonly Fact[]): Map<string, [string, number, string, number]> {
  const ends = new Map<string, Partial<Record<"from" | "to", Fact>>>();
  for (const f of facts) {
    if (!f.pair) continue;
    const e = ends.get(f.pair.key) ?? {};
    expect(e[f.pair.end], `${f.pair.key}: two ${f.pair.end} ends`).toBeUndefined();
    ends.set(f.pair.key, { ...e, [f.pair.end]: f });
  }
  const out = new Map<string, [string, number, string, number]>();
  for (const [k, { from, to }] of ends) {
    expect(from && to, `${k}: one end only`).toBeTruthy();
    out.set(k, [from!.label, from!.value, to!.label, to!.value]);
  }
  return out;
}
