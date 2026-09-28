import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// The four REACT → ENGINE publish channels (2026-08-19; the fourth 2026-09-18): `boxedCard`,
// the `sceneCover*` family, `focusRung` and `trendIds`. The cover family is five scalars since
// 2026-09-28: `sceneCoverL`/`R` (a tablet side sheet's MEASURED width) and `sceneCoverBExplore`/
// `BDetails`/`BVitals` (each phone dock's bottom height, published from the dock's own target-height
// STATE, so the scene shift eases once rather than chasing a grow). Each carries a fact only React can know
// — which card is the box, how many px of canvas a sheet covers, which rung a card just asked to
// be framed, and which networks the trend stack shows in which order (the busiest-first rank over
// FETCHED trends data, which lives in React's cache and nowhere the engine can reach) — into an
// imperative engine that renders per frame and never reads the DOM. They are one-way by
// construction: React writes, the Engine reads, and nothing writes back.
//
// This pins the shape rather than the values, because every failure mode here is SILENT. The
// channel keeps its name, tsc stays green, vitest stays green, and the symptom is a callout in the
// wrong place or a camera that stops answering a click — in the browser, days later. Three of the
// four rules below are recorded as ⚠️ comments in CLAUDE.md or at their call sites; this makes them
// executable.
//
// EXEMPTIONS: none. All four channels are covered, and adding a fifth means adding it here.
// Their consumers are separately covered — `components/calloutBoundary.test.ts` pins that both
// callout owners consult `boxedCard`, which is the READ half of that channel.
const CHANNELS = ["setBoxedCard", "setSceneCover", "requestFocusRung", "setTrendIds"] as const;

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
    // Rule 1 makes the engine layer the only one that touches the store at all; this says what it
    // may do there with these four. A channel the Engine could write is a feedback loop: it renders
    // from the value it just set, and React's own reading arrives a commit later to fight it.
    const offenders = walk(join("src", "engine"))
      .map((p) => ({ p, src: read(p) }))
      .flatMap(({ p, src }) => CHANNELS.filter((c) => src.includes(c)).map((c) => `${p}: ${c}`));
    expect(
      offenders,
      `the engine READS these channels and must never write them: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("trendIds is published, never subscribed — React must not render from it", () => {
    // The feedback loop this file's header warns about, in its most literal form: the roster is
    // DERIVED from fetched data by the one component that renders the planes, so a second surface
    // reading it back out of the store would be rendering from its own publish — one commit late,
    // and re-rendering every time the rank moved. `focusRung` has the analogous rule above.
    const readers = ["app", "components"]
      .flatMap(walk)
      .filter((p) => /\bs\.trendIds\b|\bstate\.trendIds\b|\btrendIds\s*[,}]/.test(read(p)));
    expect(readers, `trendIds is write-only from React: ${readers.join(", ")}`).toEqual([]);
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

  it("exactly the rails and the vitals dock publish a cover — the two sides, and the three phone bottoms", () => {
    // The bottom covers joined 2026-09-28 (the phone sheet shifts the scene up into the band it
    // leaves free): each phone dock publishes its own height under its own key, so the Vitals
    // dock is a publisher too. Still no one else — RailDock reports, the owner sides it.
    const callers = callersOf("setSceneCover", ["app", "components", "src"]);
    expect(callers).toEqual([
      join("components", "ExploreRail.tsx"),
      join("components", "Inspector.tsx"),
      join("components", "VitalsDock.tsx"),
    ]);
  });

  it("the measurement is keyed on the ELEMENT, not on `open`", () => {
    // ⚠️ Radix portals the sheet's content and gates it on its own Presence state, so it mounts a
    // commit LATER than the one that opens it. An effect keyed on `open` alone therefore runs
    // against a null node and publishes 0 forever — measured with both sheets up at offsetWidth
    // 300/320 and the store still reading 0. The node has to ARRIVE, which is what a callback ref
    // held as state does and a `useRef` cannot.
    // Several nodes now arrive through this pattern (the content-fit measurement adopted it for
    // the same trap, 2026-09-03), so collect EVERY callback-ref name and require the cover
    // effect to key on one of them — the first-match form silently pinned whichever declaration
    // happened to come first in the file.
    const els = [...dock.matchAll(/const\s*\[\s*(\w+)\s*,\s*\w+\s*\]\s*=\s*useState<HTMLDivElement \| null>/g)].map((m) => m[1]);
    expect(els.length, "the sheet node must arrive through useState (a callback ref), not useRef").toBeGreaterThan(0);

    const at = dock.indexOf("offsetWidth");
    expect(at, "no offsetWidth measurement found in RailDock").toBeGreaterThan(0);
    const deps = /\}\s*,\s*\[([^\]]*)\]\s*\)/.exec(dock.slice(at))?.[1] ?? "";
    expect(
      els.some((name) => deps.includes(name)),
      `the cover effect must re-run when the node lands — deps are [${deps}], none of [${els.join(", ")}] present`,
    ).toBe(true);
  });
});

describe("trendIds carries the ranked roster, by reference", () => {
  const store = read(join("src", "store", "store.ts"));

  it("only TrendStack publishes the roster", () => {
    // The rank is decided by the same pass that RENDERS the planes, so channel and render cannot
    // disagree about which network sits in which slot (the `boxedCard` lesson). A second publisher
    // would be a second opinion about the order, and the projector would take turns believing it.
    expect(callersOf("setTrendIds", ["app", "components", "src"])).toEqual([join("components", "TrendStack.tsx")]);
  });

  it("the store stores the array it is handed, unchanged", () => {
    // ⚠️ The Engine's change signal is `!==` on this array. A setter that copied, sorted or
    // normalised would mint a fresh reference on every publish — the projector would retarget its
    // ease every frame and the stack would never settle, while every type and test stayed green.
    const setter = /setTrendIds:\s*\(([^)]*)\)\s*=>\s*set\(([^\n]*)\)/.exec(store);
    expect(setter, "setTrendIds is no longer a one-line set() — re-check the by-reference rule").not.toBeNull();
    expect(
      // `[,}]`: the setter may write the paging that keeps a focus on screen BESIDE the array
      // (one atomic set) — what it may never do is store anything but the array it was handed.
      /\{\s*trendIds\s*[,}]/.test(setter![2]),
      `setTrendIds must store the array as given, got: ${setter![2]}`,
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
