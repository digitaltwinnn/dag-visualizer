// The TUNABLE CONTRACT — the shared vocabulary behind the `?tune` dev panel (devTune.ts).
//
// A tunable is a MUTABLE VALUES OBJECT plus a COLOCATED SCHEMA, both living in the module that
// owns the constant, so a knob's range sits next to the number it bounds instead of drifting in a
// far-away panel file. `devTune.ts` holds only the MANIFEST (which groups appear in which view)
// and a generic walker that renders any group.
//
// Three rules hold it together — they are the reason this is non-intrusive:
//
//  1. `*_TUNE_DEFAULTS` is the SHIPPED LOOK and stays the thing tests pin. Tests assert the
//     DEFAULTS, never the live struct, so turning a knob can never make a test pass or fail.
//  2. THE HOIST RULE. A tunable read inside a per-node loop is loaded into a LOCAL in that loop's
//     preamble (`const hexH = GEO_SIZE_TUNE.hexH;`), so the inner body reads a local exactly as it
//     did when the value was a module const — one property load per FRAME, not per node. This is
//     what makes "literals → mutable defaults" free rather than a slow leak, and it is the sibling
//     discipline to `noFrameAllocations.test.ts`.
//  3. The schema is TYPED AGAINST its values object, so a renamed field is a compile error rather
//     than a silently missing slider.
//
// Nothing here is imported by production render paths — the values objects are, the schema and
// this module's helpers are not (devTune is the only consumer, behind a dynamic import).
import type { FolderApi, Pane } from "tweakpane";

/** One knob's presentation. `reload: true` marks a value baked into geometry at construction — the
 *  panel still offers it, but it only takes effect after a page reload (persistence makes that a
 *  workable loop: set it, reload, the panel restores it). */
export interface TuneKnob {
  min: number;
  max: number;
  step?: number;
  label?: string;
  reload?: boolean;
}

/** Schema for a flat object of numbers. Partial: a values object may carry fields that are state
 *  rather than knobs, and only the schema'd keys get sliders. */
export type TuneSchema<T> = Partial<Record<keyof T, TuneKnob>>;

/** A renderable group: the live values, the defaults to reset/compare against, the schema, and an
 *  optional callback for values that are baked rather than read per frame (a ribbon sheet's vertex
 *  colours, a light's cone angle) and so must be pushed on change.
 *
 *  The default `object` is what lets the manifest hold groups of DIFFERENT shapes in one array:
 *  `TuneGroup<FocusTune>` and `TuneGroup<BarTune>` are both `TuneGroup`. The helpers below narrow
 *  to numbers at the point of use, so the erasure costs nothing — while each group's OWN schema
 *  stays typed against its own values, which is what makes a renamed field a compile error. */
export interface TuneGroup<T extends object = object> {
  title: string;
  values: T;
  defaults: Readonly<T>;
  schema: TuneSchema<T>;
  /** Called after any knob in this group changes. */
  onChange?: () => void;
  /** Where the baked values belong, e.g. "domain/dimModel.ts · FOCUS_TUNE_DEFAULTS". Printed by
   *  EXPORT so a dumped block says where to paste it. */
  home?: string;
}

// ---- persistence -----------------------------------------------------------------------------
// OPT-IN (a toggle in the panel, default OFF) because a silently-restored session is a trap: you
// would be looking at last week's knobs believing they are the shipped look. When it IS on the
// panel says so, and RESET is always one click away.
const LS_KEY = "dagviz.tune.v1";

interface Persisted {
  on: boolean;
  groups: Record<string, Record<string, number>>;
}

function readPersisted(): Persisted {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { on: false, groups: {} };
    const p = JSON.parse(raw) as Partial<Persisted>;
    return { on: !!p.on, groups: p.groups ?? {} };
  } catch {
    return { on: false, groups: {} };
  }
}

function writePersisted(p: Persisted): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(p));
  } catch {
    /* quota / privacy mode — tuning still works, it just won't survive a reload */
  }
}

/** Snapshot every group's schema'd numbers, keyed by group title. */
function snapshot(groups: TuneGroup[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const g of groups) {
    const vals: Record<string, number> = {};
    for (const key of Object.keys(g.schema)) {
      const v = (g.values as Record<string, unknown>)[key];
      if (typeof v === "number") vals[key] = v;
    }
    out[g.title] = vals;
  }
  return out;
}

/** Restore a snapshot into the live values objects. Unknown groups/keys are ignored, so a stored
 *  session survives a knob being renamed or removed. Call BEFORE the panel binds, so the sliders
 *  render at the restored values. Returns true if anything was applied. */
export function restoreTuned(groups: TuneGroup[]): boolean {
  const p = readPersisted();
  if (!p.on) return false;
  let applied = false;
  for (const g of groups) {
    const stored = p.groups[g.title];
    if (!stored) continue;
    for (const [key, v] of Object.entries(stored)) {
      if (!(key in g.schema)) continue;
      if (typeof (g.values as Record<string, unknown>)[key] !== "number") continue;
      (g.values as Record<string, number>)[key] = v;
      applied = true;
    }
    g.onChange?.();
  }
  return applied;
}

/** Whether persistence is currently switched on (read at mount to seed the toggle). */
export const tuningPersisted = (): boolean => readPersisted().on;

export function setPersist(on: boolean, groups: TuneGroup[]): void {
  writePersisted({ on, groups: on ? snapshot(groups) : {} });
}

export function savePersisted(groups: TuneGroup[]): void {
  if (!readPersisted().on) return;
  writePersisted({ on: true, groups: snapshot(groups) });
}

/** Reset a group (or every group) back to its shipped defaults. */
export function resetGroup(g: TuneGroup): void {
  for (const key of Object.keys(g.schema)) {
    const d = (g.defaults as Record<string, unknown>)[key];
    if (typeof d === "number") (g.values as Record<string, number>)[key] = d;
  }
  g.onChange?.();
}

// ---- export ----------------------------------------------------------------------------------
/** Format a group's current values as a paste-ready TS object literal, shaped like the defaults
 *  constant it came from. The whole point of the panel is that chosen numbers get BAKED, so the
 *  bake step is a copy-paste rather than transcription from a screenshot. */
export function exportGroup(g: TuneGroup): string {
  const keys = Object.keys(g.schema);
  const body = keys
    .map((k) => {
      const v = (g.values as Record<string, unknown>)[k];
      if (typeof v !== "number") return null;
      const d = (g.defaults as Record<string, unknown>)[k];
      const changed = typeof d === "number" && Math.abs(d - v) > 1e-9;
      // Trim float noise: sliders step in hundredths, so 4 decimals is always enough.
      return `  ${k}: ${parseFloat(v.toFixed(4))},${changed ? ` // was ${d}` : ""}`;
    })
    .filter(Boolean)
    .join("\n");
  return `// ${g.title}${g.home ? ` — ${g.home}` : ""}\n{\n${body}\n}`;
}

export function exportAll(groups: TuneGroup[]): string {
  return groups.map(exportGroup).join("\n\n");
}

/** Dump to the console AND the clipboard (clipboard can reject without a user gesture or over
 *  http — the console copy is the one that always lands, so it is never the fallback). */
export function dump(text: string): void {
  console.info(`[tune] export\n${text}`);
  void navigator.clipboard?.writeText(text).catch(() => {});
}

// ---- the generic walker ----------------------------------------------------------------------
/** Render one group as a tweakpane folder. Every knob comes from the schema, so adding a knob is
 *  one line next to the constant — the panel needs no edit. Returns the folder so a caller can
 *  add group-specific extras (a capture button, a note) beneath the sliders. */
export function renderGroup(
  pane: Pane | FolderApi,
  g: TuneGroup,
  onAnyChange: () => void,
  expanded = false,
): FolderApi {
  const f = pane.addFolder({ title: g.title, expanded });
  for (const [key, knob] of Object.entries(g.schema) as [string, TuneKnob][]) {
    if (typeof (g.values as Record<string, unknown>)[key] !== "number") continue;
    f.addBinding(g.values as Record<string, number>, key, {
      min: knob.min,
      max: knob.max,
      step: knob.step ?? 0.01,
      // A reload-only knob says so in its own label — the panel must never imply an instant effect
      // it cannot deliver.
      label: (knob.label ?? key) + (knob.reload ? " ⟳" : ""),
    });
  }
  f.on("change", () => {
    g.onChange?.();
    onAnyChange();
  });
  f.addButton({ title: "export" }).on("click", () => dump(exportGroup(g)));
  f.addButton({ title: "reset" }).on("click", () => {
    resetGroup(g);
    f.refresh();
    onAnyChange();
  });
  return f;
}
