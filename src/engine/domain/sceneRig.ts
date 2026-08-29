// THE LIGHTING RIG — per-view three-point staging constants, the STAGE_LIGHTS idiom applied to the
// scene's own key/fill/rim instead of to the focus spot. One row per 3D view, consumed by
// `scene/objects/SceneRig.ts`'s per-frame blend. The per-view VALUES are deliberate tuning; the
// MECHANISM is shared.
//
// WHY A RIG AT ALL. The scene used to carry three fixed lights built once in SceneContext — an
// ambient, a point light hanging at (0, 8, 0) and a second point out at (40, -20, -30). A point
// light inside the field lights every node from a DIFFERENT direction (a node on the far shell is
// lit from below-and-inward), so the field never resolved into one lit scene: every sphere took a
// slightly different smear of the same wash and the whole population read as flat coloured discs —
// the "uniform boring colour" the day pass kept running into. THE THREE LIGHTS ARE DIRECTIONAL NOW,
// which is the actual fix: one direction for the whole field, so every sphere has the SAME lit side
// and the same core-shadow side, and a stack of chips reads as a stack of objects.
//
// ⚠️ THE RIG IS AIMED FROM THE CAMERA, NOT FROM THE WORLD (the studio convention: the rig follows
// the actor). Every azimuth below is an OFFSET from the camera's own bearing, resolved per frame, so
// orbiting can never swing the lit side out of view and leave the audience looking at the shadow
// side. Elevation is world-absolute — up is up in both a studio and a solar system.
//
// A LIGHT IS A TEMPERATURE, NOT A PALETTE HUE. Lighting is a rendering technicality, deliberately
// decoupled from the CSS design tokens (changing the palette must not change the lighting, and vice
// versa) — but it was expressed as three raw hex literals, which cost the no-hardcoded-colours guard
// three allowlist entries and said nothing about what the numbers meant. A row carries a `temp` on a
// −1 (cool) … 0 (neutral white) … +1 (warm) axis instead, resolved by `tempTint` below: no colour
// literal anywhere, the guard's allowlist shrinks by three, and the knob a lighting session actually
// wants to turn ("cooler fill") is the one the panel offers.
import type { View3D } from "./viewTransition";
import type { TuneSchema } from "../tune";

/** One view's three-point staging. Azimuths are radians OFFSET FROM THE CAMERA's bearing (+ = to
 *  camera-right); elevations are radians above the horizon; temps ride the −1…+1 axis above. */
export interface RigRow {
  /** KEY — the sculpting light: the one that decides where the lit side is. */
  keyAz: number;
  keyEl: number;
  keyInt: number;
  keyTemp: number;
  /** FILL — staged OPPOSITE the key (`fillAz` offsets from that opposite), weaker and cooler: it
   *  opens the shadow side up without flattening it back out. A directional fill rather than more
   *  ambient is the whole point — ambient lifts every face equally, which is exactly the flatness
   *  this rig exists to undo. */
  fillAz: number;
  fillEl: number;
  fillInt: number;
  fillTemp: number;
  /** RIM — behind the subject (az ≈ π is straight backlight), separating node from backdrop. */
  rimAz: number;
  rimEl: number;
  rimInt: number;
  rimTemp: number;
  /** AMBIENT — the floor under all three. Kept LOW on purpose (see fill). */
  ambInt: number;
  ambTemp: number;
}

// The rows. Read them as three ratios rather than as absolute numbers: key:fill decides how deep the
// core shadow goes, key:amb how black it bottoms out, rim:key how hard the silhouette separates.
export const SCENE_RIG: Record<View3D, RigRow> = {
  // hyper — the sphere field, so the strongest sculpt in the app: the deepest key:fill ratio and the
  // lowest ambient. These are round emissive orbs and the emissive already carries their identity;
  // what the rig adds is the shading gradient across each one that says "ball", not "dot".
  hyper: {
    keyAz: 0.72, keyEl: 0.52, keyInt: 2.1, keyTemp: -0.22,
    fillAz: 0.25, fillEl: 0.1, fillInt: 0.5, fillTemp: -0.95,
    rimAz: 2.85, rimEl: 0.42, rimInt: 1.05, rimTemp: -0.85,
    ambInt: 0.3, ambTemp: -1,
  },
  // geo — the chips on the globe. Its key is ALSO THE SUN (see Globe's terminator): the one lit
  // direction shades the sphere and the chips standing on it, which is why this row's key is the
  // warmest of the three and its fill the coolest — daylight warm, sky-shadow cool, the oldest
  // trick there is for making a sphere read as a sphere.
  geo: {
    keyAz: 0.62, keyEl: 0.4, keyInt: 2.0, keyTemp: 0.16,
    fillAz: 0.2, fillEl: 0.12, fillInt: 0.55, fillTemp: -1,
    rimAz: 2.95, rimEl: 0.3, rimInt: 1.15, rimTemp: -0.9,
    ambInt: 0.32, ambTemp: -1,
  },
  // ledger — the chamber is lit by its own glass and emissive snapshots, and its focus lamp is the
  // StageLight's own claim, so the rig here only has to keep the TRAY CHIPS from going flat. Softer
  // key, higher ambient: sculpt without competing with the light the chamber already stages.
  ledger: {
    keyAz: 0.8, keyEl: 0.6, keyInt: 1.45, keyTemp: -0.2,
    fillAz: 0.3, fillEl: 0.15, fillInt: 0.42, fillTemp: -0.95,
    rimAz: 2.7, rimEl: 0.5, rimInt: 0.7, rimTemp: -0.9,
    ambInt: 0.42, ambTemp: -1,
  },
};

/** THE GROUND'S OWN ANSWER — per-channel multipliers over whichever row won the frame.
 *
 *  Dark is 1 by definition: the rows above ARE the dark look. On paper every channel comes down,
 *  and the reason is that a 0.72-L page is itself an enormous bounce card — the ground is already
 *  doing the ambient's job, so re-adding it in the rig only lifts ink off its token lane and turns
 *  the day look pastel (the exact failure the ink doctrine exists to prevent). AMBIENT drops hardest
 *  and KEY least, which is the same statement in ratio form: on paper the rig's job is narrowed to
 *  FORM alone, and presence keeps riding the ink/alpha system as it always has. */
export interface RigGround {
  amb: number;
  key: number;
  fill: number;
  rim: number;
}

export const RIG_PAPER: RigGround = { amb: 0.5, key: 0.82, fill: 0.7, rim: 0.42 };

/** A light's colour from its temperature. −1 is the cool blue-grey the scene has always used, 0 is
 *  neutral white, +1 is a warm daylight amber; the cool end's coefficients are the old ambient
 *  literal's own channel ratios, so "fully cool" is the tone the app already had a name for. Writes
 *  into `out` (a THREE.Color is structurally exactly this) — no allocation, no THREE import, so the
 *  domain layer stays renderer-free. */
export function tempTint(k: number, out: { r: number; g: number; b: number }): void {
  const c = k < 0 ? -k : 0;
  const w = k > 0 ? k : 0;
  out.r = 1 - c * 0.47;
  out.g = 1 - c * 0.34 - w * 0.09;
  out.b = 1 - w * 0.26;
}

// ---- the `?tune` surface (contract: src/engine/tune.ts) --------------------------------------
// The rows are plain mutable objects, so the panel binds them directly; the adapter re-reads the
// blended row every frame, so no group here needs an onChange.
export const SCENE_RIG_DEFAULTS: Readonly<Record<View3D, RigRow>> = {
  hyper: { ...SCENE_RIG.hyper },
  geo: { ...SCENE_RIG.geo },
  ledger: { ...SCENE_RIG.ledger },
};

export const RIG_PAPER_DEFAULTS: Readonly<RigGround> = { ...RIG_PAPER };

const AZ = { min: -Math.PI, max: Math.PI, step: 0.01 };
const EL = { min: -1.4, max: 1.4, step: 0.01 };
const INT = { min: 0, max: 4, step: 0.05 };
const TEMP = { min: -1, max: 1, step: 0.02 };

export const RIG_ROW_SCHEMA: TuneSchema<RigRow> = {
  keyAz: { ...AZ, label: "key · bearing" },
  keyEl: { ...EL, label: "key · height" },
  keyInt: { ...INT, label: "key" },
  keyTemp: { ...TEMP, label: "key · temp" },
  fillAz: { ...AZ, label: "fill · bearing" },
  fillEl: { ...EL, label: "fill · height" },
  fillInt: { ...INT, label: "fill" },
  fillTemp: { ...TEMP, label: "fill · temp" },
  rimAz: { ...AZ, label: "rim · bearing" },
  rimEl: { ...EL, label: "rim · height" },
  rimInt: { ...INT, label: "rim" },
  rimTemp: { ...TEMP, label: "rim · temp" },
  ambInt: { ...INT, label: "ambient" },
  ambTemp: { ...TEMP, label: "ambient · temp" },
};

export const RIG_PAPER_SCHEMA: TuneSchema<RigGround> = {
  amb: { min: 0, max: 2, step: 0.02, label: "ambient ×" },
  key: { min: 0, max: 2, step: 0.02, label: "key ×" },
  fill: { min: 0, max: 2, step: 0.02, label: "fill ×" },
  rim: { min: 0, max: 2, step: 0.02, label: "rim ×" },
};
