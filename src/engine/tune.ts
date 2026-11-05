// The TUNABLE CONTRACT — the shared vocabulary behind the `?tune` dev panel (devTune.ts).
//
// PRODUCTION CODE CARRIES NO PANEL METADATA (user, 2026-11-05). A module that owns a look exports
// ONE plain constant — `FOCUS_ROWS`, `STAGE_LIGHTS`, `BAR_LOOK` — typed `Readonly<…>` and never
// `Object.freeze`d. Everything the panel needs on top of that lives on the panel side: the knob
// ranges and labels (a `TuneSchema` in devTune.ts's manifest), the shipped defaults to reset and
// diff against (snapshotted HERE at mount, before any knob can turn), persistence and export.
// The panel writes into the module's constant in place — dev-only, behind a dynamic import, so
// the read-only type is what production code sees and the panel is the one writer.
//
// Three rules hold it together:
//
//  1. NO PANEL SHAPE IN A MODULE. No `*_DEFAULTS` twin, no live copy, no schema, no panel-only
//     setter. Tests pin the constant itself — with no knob mounted it IS the shipped look.
//  2. THE HOIST RULE. A value read inside a per-node loop is loaded into a LOCAL in that loop's
//     preamble (`const rest = BAR_LOOK.rest;`), so the inner body reads a local — one property
//     load per FRAME, not per node. It is what makes a constant OBJECT as cheap as a module
//     literal, and it is the sibling discipline to `noFrameAllocations.test.ts`.
//  3. The schema is TYPED AGAINST the module's own row type (`TuneSchema<FocusRow>`), so a
//     renamed field is a compile error in the manifest rather than a silently missing slider.
//
// A value read per frame needs nothing else: the knob is live the moment it is in the manifest.
// A value BAKED at construction or event time (vertex colours, a geometry) needs a re-bake, and
// the panel has one generic lever for it — `refreshTheme`, the Engine's whole theme thread,
// which re-runs every view's `setColors` — rather than a panel-only method on the view.
import type { FolderApi, Pane } from "tweakpane";

/** One knob's presentation. `reload: true` marks a value baked into geometry at construction — the
 *  panel still offers it, but it only takes effect after a page reload (persistence makes that a
 *  workable loop: set it, reload, the panel restores it). */
interface TuneKnob {
  min: number;
  max: number;
  step?: number;
  label?: string;
  reload?: boolean;
}

/** Schema for a flat object of numbers. Partial: a values object may carry fields that are state
 *  rather than knobs, and only the schema'd keys get sliders. */
export type TuneSchema<T> = Partial<Record<keyof T, TuneKnob>>;

/** A renderable group: the module's own constant, the panel-side schema, and an optional
 *  callback for values that are baked rather than read per frame (see the header).
 *
 *  The default `object` is what lets the manifest hold groups of DIFFERENT shapes in one array:
 *  `TuneGroup<FocusRow>` and `TuneGroup<BarLook>` are both `TuneGroup`. The helpers below narrow
 *  to numbers at the point of use, so the erasure costs nothing — while each group's OWN schema
 *  stays typed against its own values, which is what makes a renamed field a compile error. */
export interface TuneGroup<T extends object = object> {
  title: string;
  /** The production constant itself. Read-only in its module's type; the panel writes it in place. */
  values: Readonly<T>;
  schema: TuneSchema<T>;
  /** Called after any knob in this group changes. */
  onChange?: () => void;
  /** Where the baked values belong, e.g. "domain/dimModel.ts · FOCUS_ROWS.hyper". Printed by
   *  EXPORT so a dumped block says where to paste it. */
  home?: string;
}

/** The panel's one write path into a module's constant. */
const live = (g: TuneGroup): Record<string, unknown> => g.values as Record<string, unknown>;

// ---- the shipped defaults ---------------------------------------------------------------------
// Snapshotted from the constant itself the FIRST time a panel mounts over it, before any restore or
// knob — so it is the shipped look without the module keeping a copy. Keyed by the values object and
// never overwritten: closing and reopening the panel must not adopt a turned knob as the default.
const shipped = new WeakMap<object, Record<string, number>>();

export function captureDefaults(groups: TuneGroup[]): void {
  for (const g of groups) {
    if (shipped.has(g.values)) continue;
    const vals: Record<string, number> = {};
    for (const [key, v] of Object.entries(live(g))) if (typeof v === "number") vals[key] = v;
    shipped.set(g.values, vals);
  }
}

const defaultOf = (g: TuneGroup, key: string): number | undefined => shipped.get(g.values)?.[key];

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
      const v = live(g)[key];
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
      if (typeof live(g)[key] !== "number") continue;
      live(g)[key] = v;
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

/** Reset a group back to its shipped defaults. */
function resetGroup(g: TuneGroup): void {
  for (const key of Object.keys(g.schema)) {
    const d = defaultOf(g, key);
    if (d !== undefined) live(g)[key] = d;
  }
  g.onChange?.();
}

// ---- export ----------------------------------------------------------------------------------
/** Format a group's current values as a paste-ready TS object literal, shaped like the module
 *  constant it came from. The whole point of the panel is that chosen numbers get BAKED, so the
 *  bake step is a copy-paste rather than transcription from a screenshot. */
function exportGroup(g: TuneGroup): string {
  const keys = Object.keys(g.schema);
  const body = keys
    .map((k) => {
      const v = live(g)[k];
      if (typeof v !== "number") return null;
      const d = defaultOf(g, k);
      const changed = d !== undefined && Math.abs(d - v) > 1e-9;
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
    if (typeof live(g)[key] !== "number") continue;
    f.addBinding(live(g) as Record<string, number>, key, {
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
