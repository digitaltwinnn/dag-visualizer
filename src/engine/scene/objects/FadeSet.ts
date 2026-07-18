// The ONE furniture-fade mechanism (spec A#2), extracted from Globe's geoFades pattern:
// a view registers its STATIC materials (base opacity × the view alpha, nothing else) and
// FadeSet.apply() walks them; per-frame DYNAMIC writes (eased hub glow, tile brightness,
// state-dependent floors) keep their expressions but read `.alpha` from here — the single
// owner of the view's furniture alpha. Outcome: the next cross-cutting fade change (an
// easing curve, a global dim) is ONE edit here, not a per-view grep.
export class FadeSet {
  alpha = 1; // the view's current furniture alpha (transition.furnitureAlpha), read by dynamic writes
  private entries: Array<{ mat: { opacity: number }; base: number }> = [];

  // Event-time (construction/rebuild): register a material whose opacity is exactly base × alpha.
  register(mat: { opacity: number }, base: number): void {
    this.entries.push({ mat, base });
  }

  // Per frame (or per alpha change): store the alpha and walk the static entries.
  apply(a: number): void {
    this.alpha = a;
    for (const e of this.entries) e.mat.opacity = e.base * a;
  }
}
