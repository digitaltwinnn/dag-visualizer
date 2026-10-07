// THE FREE CANVAS, MEASURED ONCE (2026-10-04, review item 5). The HUD's three bars are React's — the
// command bar on top, the vitals band (with the footer under it) at the bottom, the phone's dock bar
// — and two engine consumers need their edges: the callout's placement (CalloutSync) and the
// framing centre's shift (Engine, `chromeShiftPx`). Each used to read the DOM on its own clock with
// its own idea of when the band "counts"; they now share this one reading.
//
// A DOM read, so it is taken every thirtieth frame rather than every frame: the bars move only on a
// resize, a strip opening or the SCENE toggle, and a half-second-late answer costs nothing — the
// shift is eased and the callout is re-placed per frame from cached numbers. Engine layer, not
// `scene/`: it reads React's DOM, never the store.

const EVERY = 30;

export class ChromeBounds {
  /** The command bar's bottom edge (any open strip included), or 0 with no bar. */
  top = 0;
  /** The vitals band's top edge while it is IN the lane — on screen and visible — else the
   *  viewport's bottom (the phone, where its vitals ride the dock; the SCENE toggle, which slides it
   *  away). */
  bandTop = 0;
  /** Whether `bandTop` is the band's (true) or the viewport's (false). */
  bandOn = false;
  /** The top of the phone's BOTTOM CHROME — the footer row that rides above the dock bar, else the
   *  dock bar itself (an open sheet stands on it), else the viewport's bottom. The phone callout's
   *  floor: the footer row is chrome too, and a label dropped to "just above the dock" landed on its
   *  links (2026-10-07). */
  dockTop = 0;

  private _in = 0;

  /** Refresh at most every EVERY calls; cheap to call per frame, from every consumer. */
  read(): this {
    if (this._in-- > 0) return this;
    this._in = EVERY;
    const h = window.innerHeight;
    const bar = document.getElementById("topbar");
    this.top = bar ? bar.getBoundingClientRect().bottom : 0;
    const band = document.getElementById("vitalsband");
    const br = band?.getBoundingClientRect();
    this.bandOn = !!br && br.height > 0 && br.top < h && getComputedStyle(band!).visibility !== "hidden";
    this.bandTop = this.bandOn ? br!.top : h;
    const dock = document.querySelector("[data-phone-dock]");
    const dr = dock?.getBoundingClientRect();
    this.dockTop = dr && dr.height > 0 ? dr.top : h;
    const foot = document.getElementById("sitefoot")?.getBoundingClientRect();
    if (dr && dr.height > 0 && foot && foot.height > 0 && foot.top < this.dockTop) this.dockTop = foot.top;
    return this;
  }
}
