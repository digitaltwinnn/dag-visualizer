import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// The three REACT → ENGINE publish channels (2026-08-19): `boxedCard`, `sceneCoverL`/`sceneCoverR`
// and `focusRung`. Each carries a fact only the DOM can know — which card is the box, how many px
// of canvas a sheet covers, which rung a card just asked to be framed — into an imperative engine
// that renders per frame and never reads the DOM. They are one-way by construction: React writes,
// the Engine reads, and nothing writes back.
//
// This pins the shape rather than the values, because every failure mode here is SILENT. The
// channel keeps its name, tsc stays green, vitest stays green, and the symptom is a callout in the
// wrong place or a camera that stops answering a click — in the browser, days later. Three of the
// four rules below are recorded as ⚠️ comments in CLAUDE.md or at their call sites; this makes them
// executable.
//
// EXEMPTIONS: none. All three channels are covered, and adding a fourth means adding it here.
// Its consumers are separately covered — `components/calloutBoundary.test.ts` pins that both
// callout owners consult `boxedCard`, which is the READ half of that channel.
const CHANNELS = ["setBoxedCard", "setSceneCover", "requestFocusRung"] as const;

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : walk(p);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });

const read = (p: string) => readFileSync(p, "utf8");
/** Files that CALL a setter — the declaration in the store itself is not a publish. */
const callersOf = (setter: string, roots: string[]) =>
  roots
    .flatMap(walk)
    .filter((p) => p !== join("src", "store", "store.ts"))
    .filter((p) => new RegExp(`${setter}\\s*\\(`).test(read(p)))
    .sort();

describe("the React → Engine publish channels are one-way", () => {
  it("no engine module writes a publish channel", () => {
    // Rule 1 makes `Engine.ts` the only layer that touches the store at all; this says what it may
    // do there with these three. A channel the Engine could write is a feedback loop: it renders
    // from the value it just set, and the DOM's own reading arrives a commit later to fight it.
    const offenders = walk(join("src", "engine"))
      .map((p) => ({ p, src: read(p) }))
      .flatMap(({ p, src }) => CHANNELS.filter((c) => src.includes(c)).map((c) => `${p}: ${c}`));
    expect(
      offenders,
      `the engine READS these channels and must never write them: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("focusRung is a request, so nothing renders from it", () => {
    // It is a one-shot ASK, consumed by the Engine's reference bridge and never cleared. A
    // component that rendered from it would show a stale request forever and re-render on every
    // camera framing.
    const readers = ["app", "components"]
      .flatMap(walk)
      .filter((p) => /\bs\.focusRung\b|\bstate\.focusRung\b/.test(read(p)));
    expect(readers, `focusRung is write-only from React: ${readers.join(", ")}`).toEqual([]);
  });
});

describe("focusRung carries EVENT identity, not a value", () => {
  const store = read(join("src", "store", "store.ts"));
  const engine = read(join("src", "engine", "Engine.ts"));

  it("the store publishes a fresh object every call", () => {
    // ⚠️ The whole reason the channel is `{ level } | null` rather than `FocusLevel | null`:
    // re-expanding the SAME rung must reach the Engine again. Flattened to a bare level, the
    // second request is `===` the first, the bridge below never fires, and the card silently stops
    // answering with the camera — while every test and type still passes.
    const setter = /requestFocusRung:\s*\(([^)]*)\)\s*=>\s*set\(([^\n]*)\)/.exec(store);
    expect(setter, "requestFocusRung is no longer a one-line set() — re-check the object identity rule").not.toBeNull();
    expect(
      /\{\s*focusRung:\s*\{/.test(setter![2]),
      `requestFocusRung must set a fresh object literal, got: ${setter![2]}`,
    ).toBe(true);
  });

  it("the Engine bridges it by reference", () => {
    // The other half, which fails independently: a value compare (`?.level !==`, a deep equal)
    // would discard exactly the repeat requests the object identity exists to deliver.
    const bridge = /if\s*\(([^)]*focusRung[^)]*)\)/.exec(engine)?.[1] ?? "";
    expect(bridge, "no focusRung bridge found in Engine.ts").toContain("focusRung");
    expect(
      /st\.focusRung\s*!==\s*prev\.focusRung/.test(bridge),
      `the bridge must compare the OBJECT, not its contents: ${bridge}`,
    ).toBe(true);
  });
});

describe("sceneCover is measured by the dock and sided by the caller", () => {
  const dock = read(join("components", "RailDock.tsx"));

  it("RailDock reports through its prop and never touches the store channel", () => {
    // The dock is rendered by both rails and knows nothing about left vs right; the CALLER owns
    // that. A dock that wrote the store directly would need a side of its own — a second home for
    // a fact the rail already has.
    expect(dock).toContain("onCoverPx");
    expect(/setSceneCover|sceneCoverL|sceneCoverR/.test(dock), "RailDock must stay store-free about the cover").toBe(false);
  });

  it("exactly the two rails publish a side", () => {
    const callers = callersOf("setSceneCover", ["app", "components", "src"]);
    expect(callers).toEqual([join("components", "ExploreRail.tsx"), join("components", "Inspector.tsx")]);
  });

  it("the measurement is keyed on the ELEMENT, not on `open`", () => {
    // ⚠️ Radix portals the sheet's content and gates it on its own Presence state, so it mounts a
    // commit LATER than the one that opens it. An effect keyed on `open` alone therefore runs
    // against a null node and publishes 0 forever — measured with both sheets up at offsetWidth
    // 300/320 and the store still reading 0. The node has to ARRIVE, which is what a callback ref
    // held as state does and a `useRef` cannot.
    const el = /const\s*\[\s*(\w+)\s*,\s*\w+\s*\]\s*=\s*useState<HTMLDivElement \| null>/.exec(dock);
    expect(el, "the sheet node must arrive through useState (a callback ref), not useRef").not.toBeNull();

    const at = dock.indexOf("offsetWidth");
    expect(at, "no offsetWidth measurement found in RailDock").toBeGreaterThan(0);
    const deps = /\}\s*,\s*\[([^\]]*)\]\s*\)/.exec(dock.slice(at))?.[1] ?? "";
    expect(
      deps.includes(el![1]),
      `the cover effect must re-run when the node lands — deps are [${deps}], missing ${el![1]}`,
    ).toBe(true);
  });
});

describe("boxedCard has one publisher", () => {
  it("only Inspector says which card is the box", () => {
    // The box is decided by the same `present && !effCollapsed` pass that RENDERS it, so channel
    // and render cannot disagree (the `data-tier` lesson). A second publisher would be a second
    // opinion about the same thing, and the callout and the camera would take turns believing it.
    expect(callersOf("setBoxedCard", ["app", "components", "src"])).toEqual([join("components", "Inspector.tsx")]);
  });
});
