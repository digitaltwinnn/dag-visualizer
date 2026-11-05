import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  captureDefaults, resetGroup, exportGroup, exportAll,
  restoreTuned, setPersist, savePersisted, tuningPersisted,
  type TuneGroup, type TuneSchema,
} from "./tune";

// THE `?tune` FRAMEWORK'S SPECIFICATION. The manifest is empty (devTune.ts), so nothing in the app
// exercises this today; these tests are what keep it a working placeholder rather than dead code
// that rots until the next tuning session finds it broken. A fixture stands in for a module's
// look constant — the shape a real one has: a plain object, read-only in its module's type, that
// the panel writes in place.

interface Look { rest: number; ink: number; halo: number }
const schema: TuneSchema<Look> = {
  rest: { min: 0, max: 1 },
  ink: { min: 0, max: 1, label: "ink floor" },
  // `halo` deliberately unschema'd: a field with no knob is never exported, reset or persisted.
};

// A fresh constant per test: the defaults snapshot is keyed by the object, so each test owns its own.
let look: Look;
let group: TuneGroup<Look>;
const write = (k: keyof Look, v: number) => { look[k] = v; };

// node has no localStorage — a Map-backed stand-in, so persistence runs for real.
const store = new Map<string, string>();
const fakeStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

beforeEach(() => {
  look = { rest: 0.12, ink: 0.25, halo: 2.4 };
  group = { title: "bar", values: look, schema, home: "scene/objects/ByteBar.ts · BAR_LOOK" };
  store.clear();
  (globalThis as { localStorage?: unknown }).localStorage = fakeStorage;
});
afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe("the shipped defaults", () => {
  it("are snapshotted from the constant itself, so reset returns a turned knob to the shipped look", () => {
    captureDefaults([group]);
    write("rest", 0.5);
    resetGroup(group);
    expect(look.rest).toBe(0.12);
  });

  it("are captured ONCE per constant — reopening the panel never adopts a turned knob as the default", () => {
    captureDefaults([group]);
    write("rest", 0.5);
    captureDefaults([group]); // a second mount over the same constant
    resetGroup(group);
    expect(look.rest).toBe(0.12);
  });

  it("reset touches schema'd fields only, and calls the group's re-bake", () => {
    let rebakes = 0;
    group.onChange = () => { rebakes++; };
    captureDefaults([group]);
    write("halo", 9);
    resetGroup(group);
    expect(look.halo).toBe(9);
    expect(rebakes).toBe(1);
  });
});

describe("export", () => {
  it("prints a paste-ready block naming its home, marking what moved and only the schema'd fields", () => {
    captureDefaults([group]);
    write("ink", 0.3);
    expect(exportGroup(group)).toBe(
      "// bar — scene/objects/ByteBar.ts · BAR_LOOK\n{\n  rest: 0.12,\n  ink: 0.3, // was 0.25\n}",
    );
  });

  it("trims slider float noise to four decimals", () => {
    captureDefaults([group]);
    write("rest", 0.1 + 0.2);
    expect(exportGroup(group)).toContain("rest: 0.3, // was 0.12");
  });

  it("joins every group, and an empty manifest exports nothing", () => {
    const other: TuneGroup<Look> = { title: "tiles", values: { rest: 0.1, ink: 0.3, halo: 2.5 }, schema };
    captureDefaults([group, other]);
    expect(exportAll([group, other]).split("\n\n")).toHaveLength(2);
    expect(exportAll([])).toBe("");
  });
});

describe("persistence", () => {
  it("is OFF by default: nothing is saved or restored until it is switched on", () => {
    expect(tuningPersisted()).toBe(false);
    write("rest", 0.5);
    savePersisted([group]);
    write("rest", 0.12);
    expect(restoreTuned([group])).toBe(false);
    expect(look.rest).toBe(0.12);
  });

  it("once on, a turned knob survives a reload — restored by group title and key", () => {
    setPersist(true, [group]);
    write("ink", 0.4);
    savePersisted([group]);
    write("ink", 0.25); // the reload: the module boots at its shipped value
    expect(restoreTuned([group])).toBe(true);
    expect(look.ink).toBe(0.4);
    expect(tuningPersisted()).toBe(true);
  });

  it("ignores a stored key the schema no longer has, so a renamed knob can't write a stray field", () => {
    store.set("dagviz.tune.v1", JSON.stringify({ on: true, groups: { bar: { halo: 9, gone: 1 } } }));
    expect(restoreTuned([group])).toBe(false);
    expect(look.halo).toBe(2.4);
    expect("gone" in look).toBe(false);
  });

  it("switching it off forgets the session", () => {
    setPersist(true, [group]);
    write("ink", 0.4);
    savePersisted([group]);
    setPersist(false, [group]);
    write("ink", 0.25);
    expect(restoreTuned([group])).toBe(false);
    expect(look.ink).toBe(0.25);
  });
});
