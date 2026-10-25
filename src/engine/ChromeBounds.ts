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
  /** The height of the command bar's open grow-down row (`#filter-strip`), 0 while folded —
   *  eased with the row's own grid-rows transition, so the push rides it. */
  strip = 0;
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
  /** The DESKTOP rails' inner edges — the right edge of `#leftcol` and the left edge of
   *  `#rightcol` — while a column is on screen; 0 / +∞ while it is not (narrower tiers hide the
   *  columns, and the SCENE toggle slides them away). The callout's band is pulled in by them
   *  (2026-10-18, user: the label "is sometimes placed behind the right rail cards … when a
   *  metagraph on the right side of the panels is chosen"; and "in scene mode it could use the
   *  entire space as no cards are shown"). Measured here, not published by the rails: the
   *  `sceneCover*` channel is the tablet sheets' and single-publisher by rule. */
  railL = 0;
  railR = Infinity;

  private _in = 0;
  /** The row's open state at the last full read — an attribute read per call (no layout) that
   *  forces a fresh read the frame it flips, so a strip toggle answers at once, not up to 30 frames late. */
  private _rowOpen = false;

  /** Refresh at most every EVERY calls; cheap to call per frame, from every consumer. */
  read(): this {
    const rowOpen = document.getElementById("filter-strip")?.getAttribute("aria-hidden") === "false";
    if (rowOpen !== this._rowOpen) { this._rowOpen = rowOpen; this._in = 0; }
    if (this._in-- > 0) return this;
    this._in = EVERY;
    const h = window.innerHeight;
    const bar = document.getElementById("topbar");
    this.top = bar ? bar.getBoundingClientRect().bottom : 0;
    const row = document.getElementById("filter-strip");
    // The row's SETTLED height, not its live one (user, 2026-10-25: the scene "moves, pauses then
    // moves a bit more"): read every 30th frame, the live height caught the 250ms grid-rows grow
    // part-way, so the shift eased to a mid value, held, then jumped on. Open → the content's full
    // height, folded → 0, so the target is final from the first read and the shift's own ease is
    // the one motion. A bar slid away (SCENE) pushes nothing.
    const rr = row?.getBoundingClientRect();
    const open = !!row && row.getAttribute("aria-hidden") !== "true";
    const inner = row?.firstElementChild?.firstElementChild as HTMLElement | null | undefined;
    this.strip = open && rr && rr.bottom > 0 ? (inner?.offsetHeight ?? rr.height) : 0;
    // The bar's bottom edge as it WILL settle (desktop/tablet's chrome shift reads it): the live
    // edge less the row's live height plus its settled one — the same mid-grow catch otherwise.
    if (bar && rr) this.top += this.strip - rr.height;
    const band = document.getElementById("vitalsband");
    const br = band?.getBoundingClientRect();
    this.bandOn = !!br && br.height > 0 && br.top < h && getComputedStyle(band!).visibility !== "hidden";
    this.bandTop = this.bandOn ? br!.top : h;
    const dock = document.querySelector("[data-phone-dock]");
    const dr = dock?.getBoundingClientRect();
    this.dockTop = dr && dr.height > 0 ? dr.top : h;
    const foot = document.getElementById("sitefoot")?.getBoundingClientRect();
    if (dr && dr.height > 0 && foot && foot.height > 0 && foot.top < this.dockTop) this.dockTop = foot.top;
    const w = window.innerWidth;
    const col = (id: string) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const cr = el.getBoundingClientRect();
      // Off screen (slid away, hidden by a tier) or invisible counts as absent.
      if (cr.width <= 0 || cr.right <= 0 || cr.left >= w || getComputedStyle(el).visibility === "hidden") return null;
      return cr;
    };
    const lc = col("leftcol");
    const rc = col("rightcol");
    this.railL = lc ? lc.right : 0;
    this.railR = rc ? rc.left : Infinity;
    return this;
  }
}
