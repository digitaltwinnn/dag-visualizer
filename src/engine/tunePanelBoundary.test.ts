import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// THE `?tune` PANEL IS ONE SEALED CORNER (user, 2026-11-05: "structure it so that in future
// production code no longer carries panel metadata"). A module that owns a look exports a plain
// constant and nothing else; the knob ranges, labels, the shipped-defaults snapshot, persistence and
// export all live in the panel's three files (src/engine/tune.ts is the contract, devTune.ts the
// manifest, DevTunePanel.ts the Engine's handle). The shape this replaced — a `*_TUNE_SCHEMA` and a
// `*_TUNE_DEFAULTS` twin beside every constant, plus panel-only setters on the views — reached
// thirteen production modules through a type-only `import { TuneSchema } from "../tune"`, which is
// exactly the import that would bring it back.
//
// So: only the panel's own files import the contract or tweakpane, and only DevTunePanel loads the
// manifest. A knob is added by naming the module's constant in devTune.ts's manifest — never by an
// edit in the module.
const ROOTS = ["components", "src", "app", "lib"];
const PANEL = new Set(["src/engine/tune.ts", "src/engine/devTune.ts", "src/engine/DevTunePanel.ts"]);

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : walk(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });

const posix = (p: string) => p.replace(/\\/g, "/");

/** Every module specifier a file imports (static, type-only and dynamic alike). */
const specifiers = (src: string): string[] =>
  [...src.matchAll(/(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g)].map((m) => m[1]);

const files = ROOTS.flatMap((r) => walk(r)).map(posix);

describe("the ?tune panel boundary", () => {
  it("only the panel's own files import the tune contract", () => {
    const offenders = files.filter(
      (f) => !PANEL.has(f) && specifiers(readFileSync(f, "utf8")).some((s) => /(^|\/)tune$/.test(s)),
    );
    expect(offenders, `a look is a plain constant; its knob belongs in devTune.ts's manifest: ${offenders.join(", ")}`).toEqual([]);
  });

  it("only the panel's own files import tweakpane", () => {
    const offenders = files.filter(
      (f) => !PANEL.has(f) && specifiers(readFileSync(f, "utf8")).some((s) => s === "tweakpane" || s.startsWith("tweakpane/")),
    );
    expect(offenders, `tweakpane is dev-only panel code: ${offenders.join(", ")}`).toEqual([]);
  });

  it("only DevTunePanel loads the manifest", () => {
    const offenders = files.filter(
      (f) => f !== "src/engine/DevTunePanel.ts" && specifiers(readFileSync(f, "utf8")).some((s) => /(^|\/)devTune$/.test(s)),
    );
    expect(offenders, `the manifest is reached through DevTunePanel's dynamic import alone: ${offenders.join(", ")}`).toEqual([]);
  });

  it("the guard sees what it guards — the panel files exist and DevTunePanel does load the manifest", () => {
    for (const f of PANEL) expect(files, f).toContain(f);
    expect(specifiers(readFileSync("src/engine/DevTunePanel.ts", "utf8"))).toContain("./devTune");
    expect(specifiers(readFileSync("src/engine/devTune.ts", "utf8"))).toContain("./tune");
  });
});
