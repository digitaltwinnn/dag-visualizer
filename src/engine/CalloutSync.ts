import * as THREE from "three";
import type { PickDescriptor, MetaSnapSel } from "@/src/data/types";
import type { CohortSel } from "./domain/focusLadder";
import type { Mode } from "@/src/store/store";
import { breakpointOf } from "@/src/data/breakpoint";
import type { ChromeBounds } from "./ChromeBounds";
import { calloutHangs, calloutPhonePlacement, calloutPlacement, CALLOUT_OFF_X, CALLOUT_OFF_Y, CALLOUT_LEG_INSET } from "./domain/calloutPlacement";
import { R as GEO_R, LAND_H, latLonToVec3 } from "./domain/geoLayout";
import { ledgerLens } from "@/src/data/ledgerStory";
import { UNLISTED_ID } from "@/src/data/unlistedId";
import { glideMix } from "./domain/calloutGlide";
import { calloutSubject, type CalloutSubject, type CalloutSubjectInput } from "./domain/calloutSubjects";
import type { LedgerRegister } from "@/src/store/mode";
import type { SceneCtx } from "./scene/SceneContext";
import type { Globe } from "./scene/Globe";
import type { LedgerView } from "./scene/views/LedgerView";
import type { HyperView } from "./scene/views/HyperView";

// THE SUBJECT CALLOUT'S PER-FRAME PLACEMENT, lifted out of Engine.ts (2026-08-31).
//
// It was ten methods and ~270 lines inside a 2,383-line Engine — the largest self-contained
// concern in there, and the one with the least to do with the rest of it. Every scratch field it
// used was its own (checked: only `_dofMeta` is shared, and that arrives as a host call), so this
// is a move, not a redesign: the anchor rules, the box-leads precedence and the multi-leader are
// unchanged, comments included.
//
// ⚠️ ENGINE.TS STAYS THE ONE STORE BRIDGE (rule 1). This module never imports the store as a
// VALUE — the Engine reads it once per frame and hands the slice in as `CalloutState`, which is
// deliberately narrow: it is the executable list of what the callout actually depends on, so a
// new dependency is a visible line here rather than a silent `getState()` reach.
//
// ⚠️ RULE 5 (zero-allocation render loop) governs `sync`. The host is bound ONCE at construction
// and the per-frame values arrive as primitives, so nothing here builds an object per frame.

/** Exactly the store keys the callout reads. Engine passes this in; see the bridge note above. */
export interface CalloutState {
  inspect: PickDescriptor | null;
  snap: Extract<PickDescriptor, { kind: "snapshot" }> | null;
  metaSnap: MetaSnapSel | null;
  /** Live-follow flag — the settle gate skips the rewind term for it (LedgerView.calloutSettled). */
  following: boolean;
  boxedCard: string | null;
  /** The Snapshots view's register and its two finer subjects — `calloutSubjects`' inputs. */
  register: LedgerRegister;
  hasBlock: boolean;
  hasDataBlock: boolean;
  country: string | null;
  cohort: CohortSel | null;
  sceneCoverL: number;
  sceneCoverR: number;
  /** The open PHONE sheet's height above the dock bar (the tallest of the three bottom covers). */
  sceneCoverB: number;
}

/** The engine-side values the anchors need. Bound once — these are stable object refs plus
 *  getters for the handful of things that change per frame. */
export interface CalloutHost {
  ctx: SceneCtx;
  /** The HUD bars' edges — one reading shared with the Engine's framing shift. */
  chrome: ChromeBounds;
  globe: Globe;
  ledger: LedgerView;
  layers: HyperView;
  mode: Mode;
  filter: string;
  /** The network the LEDGER resolves against — the tick-local one inside its tick, else the
   *  filter (`domain/tickNet.ledgerNetwork`). The byte-bar anchor points at ITS band. */
  ledgerNet: string;
  transitionActive(): boolean;
  /** Is the camera mid-flight to a subject? The callout waits out the whole arrival. */
  flyingNow(): boolean;
  /** The running flight moves the CAMERA but not the subject (the rails toggle's lean, the
   *  aspect re-frame) — the label rides it on its per-frame projection instead of blinking
   *  off for the arrival wait (user, 2026-09-11: the HUD⇄Scene switch "always redrew" it). */
  sameSubjectFlight(): boolean;
  calloutAllowed(): boolean;
  /** The focused metagraph's hyper group, or null (unlisted/unknown — an honest absence). */
  dofMeta(): { group: THREE.Object3D } | null;
}

export class CalloutSync {
  private readonly h: CalloutHost;
  private st!: CalloutState;

  // scratch — all of it was Engine-private and callout-only before the move
  private _calloutV = new THREE.Vector3();
  private _calloutSibs = [new THREE.Vector3(), new THREE.Vector3()];
  private _calloutNodeAnchor = false;
  private _geoNodePick: unknown = null;
  private _geoNodeLocal = new THREE.Vector3();
  private _geoCcKey: string | null = null;
  private _geoCcDir = new THREE.Vector3();
  private _geoCcOk = false;

  constructor(host: CalloutHost) {
    this.h = host;
  }

  /** Called once per frame from the Engine's scene-write phase. */
  sync(st: CalloutState): void {
    this.st = st;
    // The Snapshots view's label subjects, resolved ONCE per frame into reused structs (rule 5).
    if (this.h.mode === "ledger") {
      const i = this._subjIn;
      const net = this.h.ledgerNet;
      i.register = st.register; i.boxedCard = st.boxedCard; i.hasSnap = !!st.snap;
      i.hasMetaSnap = !!st.metaSnap; i.hasBlock = st.hasBlock; i.hasDataBlock = st.hasDataBlock;
      i.lane = net !== "all" && net !== "dag" && net !== UNLISTED_ID;
      this._subject = calloutSubject(i);
    }
    this._syncCallout();
  }


  // ---- the subject callout (policy.callout) --------------------------------------------------
  // components/SceneCallout.tsx renders the label; `#callout` is the marker contract, and the
  // Engine owns only its per-frame PLACEMENT: the committed subject's rendered anchor projected
  // to screen, written straight to the DOM — the Tooltip discipline, so following the subject
  // never triggers a React render (getElementById survives the component's own remounts). The
  // anchor reads the RENDERED world transform on purpose: a label must track where the object is
  // THIS frame — orbit spin, structure tilt and morph included — this is not framing math.
  // render-state OK. Hidden during the view transition (mid-flight positions mislead, same reason
  // picking is suppressed), behind the camera, and wherever the policy or subject says no; the
  // component independently declines to render the same cases from store state, so `data-on` is
  // belt on top of braces, never the only gate.
  //
  // ON A PHONE THE LABEL STANDS STRAIGHT ABOVE ITS SUBJECT (user, 2026-10-04 — reversing
  // 2026-08-18's "drop the callout when in mobile mode": "it should fit, can also shorten the line").
  // The old ruling's reason still governs: a label's value is CO-LOCATION, and the diagonal
  // standoff could only point sideways at nothing under 700px. Vertically it can't: the panel is
  // centred over the anchor and nudged inward at an edge, on a short leader that runs straight
  // into the subject (`calloutPhonePlacement`, tested), inside the canvas the open sheet leaves.
  // `breakpointOf` is the ONE home for the tier (the component reads the same call through
  // `useBreakpoint`), so the two owners cannot drift apart at the boundary.
  private _syncCallout(): void {
    // ONE LABEL (user, 2026-11-08: "Two callouts is too much in the snapshot view"): the second
    // anchor the Snapshots pair carried from 2026-10-03, `callout-2` on the global's bar, is retired;
    // the global's bar is now one of the subjects `callout` itself may point at.
    const el = document.getElementById("callout");
    if (!el) return;
    // A NEW SUBJECT ON A STANDING LABEL GLIDES (user, 2026-11-09 — `domain/calloutGlide.ts`): the
    // wrapper is no longer remounted per subject; React writes the subject's exact identity to
    // `data-subject`, and a change while the label is shown moves the anchor from where it stood. A
    // change while it is hidden (a camera flight, a view switch) rewinds the entrance instead, so the
    // label draws in at its new subject when it appears, as a fresh mount did.
    const subj = el.dataset.subject ?? null;
    if (subj !== this._subjKey) {
      this._subjKey = subj;
      this._ppIn = 0; // the panel's words changed: re-measure its reach now, not on the cadence
      if (el.dataset.on === "1" && this._placedEl === el) {
        this._glideAt = performance.now();
        this._glideFromX = this._placedX;
        this._glideFromY = this._placedY;
      } else this._replayEntrance(el);
    }
    const allowed =
      this.h.calloutAllowed() &&
      !this.h.transitionActive() &&
      // …and not while the camera is still FLYING to the subject (user, 2026-09-04: the label
      // appeared "a bit too quickly" — it points at a settled scene, so it waits for the whole
      // arrival, the commit flight included; the view transition above is the other half).
      // A SAME-SUBJECT flight is exempt (see the host field): nothing is arriving, only the
      // camera leans, and the label tracks its unchanged subject per frame.
      (!this.h.flyingNow() || this.h.sameSubjectFlight());
    const phone = breakpointOf(window.innerWidth) === "phone";
    const v = this._calloutV;
    const on =
      allowed &&
      (this.h.mode === "geo"
        ? this._geoCalloutAnchor(v)
        : this.h.mode === "ledger"
          ? this._ledgerCalloutAnchor(v)
          : this._hyperCalloutAnchor(v)) &&
      // The global snapshot's label HANGS below its bar where the strip has room (design A,
      // 2026-10-03: standing up from the floor it covered the ribbons); every other subject stands.
      this._placeCallout(el, v, this.h.mode === "ledger" && this._subject === "global", phone);
    // The multi-leader on a phone fans from the VERTICAL leader's panel end (user, 2026-10-08: a
    // hybrid node "should be multiple" spheres there too) — `_placePhone`'s own length, not the
    // diagonal standoff's corner.
    // A glide the label is hidden through (the commit's flight began a frame after the change) ends,
    // and the label draws in fresh where it reappears.
    if (!on && this._glideAt >= 0) {
      this._glideAt = -1;
      this._replayEntrance(el);
    }
    if (on) this._syncCalloutMulti(el, this._placedX, this._placedY, this._placedRect, this._placedFlip, this._placedDrop, phone ? this._ppLen : 0);
    else this._syncCalloutMulti(el, 0, 0, null, false, false, 0);
    // Guard on the ELEMENT's own attribute, not a cached flag: React mounts the wrapper fresh
    // (data-on="0") whenever the label returns from absence, so a field would go stale exactly then.
    const flag = on ? "1" : "0";
    if (el.dataset.on !== flag) el.dataset.on = flag;
  }

  // The glide's state: the subject identity last seen, and when the running glide began (−1: none).
  // It starts from `_placedX/_placedY`, the anchor as last drawn.
  private _subjKey: string | null = null;
  private _glideAt = -1;
  private _glideFromX = 0;
  private _glideFromY = 0;
  private _placedEl: HTMLElement | null = null;

  /** Rewind the label's entrance (panel roll, leader draw, ring landing) to its start: the CSS
   *  animations hold paused while `data-on` is 0 (globals.css), so they play from the top when the
   *  label is next shown. Event-time (a subject change), never per frame. */
  private _replayEntrance(el: HTMLElement): void {
    for (const a of el.getAnimations({ subtree: true })) if (a instanceof CSSAnimation) a.currentTime = 0;
  }

  // Where the last `_placeCallout` put its anchor — read back by the multi-leader, which draws
  // from the same point with the same flips. Fields, not a returned object (rule 5).
  private _placedX = 0;
  private _placedY = 0;
  private _placedRect: DOMRect | null = null;
  private _placedFlip = false;
  private _placedDrop = false;

  /** Project a WORLD anchor to the screen and write one callout's transform and flips. False
   *  when the point is behind the camera or the panel has no room on either side. */
  private _placeCallout(el: HTMLElement, v: THREE.Vector3, hangs = false, phone = false): boolean {
    v.applyMatrix4(this.h.ctx.camera.matrixWorldInverse); // world → view (camera looks −z)
    if (v.z > -0.1) return false; // behind (or grazing) the camera plane
    v.applyMatrix4(this.h.ctx.camera.projectionMatrix); // view → NDC (w-divide included)
    const r = this.h.ctx.renderer.domElement.getBoundingClientRect();
    let x = r.left + (v.x * 0.5 + 0.5) * r.width;
    let y = r.top + (-v.y * 0.5 + 0.5) * r.height;
    // GLIDING: the label stands between where it was and its subject's anchor this frame (the target
    // keeps moving with the scene, so the glide closes on it rather than on a stale point).
    if (this._glideAt >= 0) {
      const k = glideMix((performance.now() - this._glideAt) / 1000);
      x = this._glideFromX + (x - this._glideFromX) * k;
      y = this._glideFromY + (y - this._glideFromY) * k;
      if (k >= 1) this._glideAt = -1;
    }
    // Placement is `domain/calloutPlacement.ts` — the flip/drop rules and the panel's reach
    // live there with their test, and globals.css mirrors the geometry off the attributes
    // written below (guarded writes, like data-on).
    // ⚠️ MEASURE THE FREE CANVAS BAND, NOT THE CANVAS. Below 1100px the rails are
    // sheets that OVERLAY a still-viewport-sized canvas, so `r.left`/`r.right` describe room
    // the callout does not have: at 900px with both sheets open a geo node's panel rendered
    // as a ~25px fragment in the strip between them. `sceneCoverL`/`sceneCoverR` are what the
    // open sheets measured off themselves (0 on desktop and phone, so this is a no-op there).
    // …AND NOT UNDER THE DESKTOP RAILS EITHER (2026-10-18): the columns are fixed over the same
    // viewport-sized canvas, so the band is pulled in by their inner edges while they are on
    // screen (`ChromeBounds.railL/railR`) — and keeps the whole canvas when the SCENE toggle has
    // slid them away.
    const chrome = this.h.chrome.read();
    const bandL = Math.max(r.left + this.st.sceneCoverL, chrome.railL);
    const bandR = Math.min(r.right - this.st.sceneCoverR, chrome.railR);
    if (phone) return this._placePhone(el, x, y, r, bandL, bandR);
    if (el.dataset.phone != null) delete el.dataset.phone;
    // THE GLOBAL SNAPSHOT'S LABEL HANGS (`calloutHangs`, with its test): below-left of the bar,
    // on the standing label's own diagonal turned half a circle, where the strip under the floor
    // has room for it. Where it has not, the label stands as every callout does.
    const hang = hangs && calloutHangs(x, y, bandL, bandR, this._freeBottom());
    let flip = true;
    let drop = true;
    if (!hang) {
      // The panel's REAL reach where it has been measured (the phone's cadence, below), and a
      // SOFT band where the rails — not the sheets — pulled it in (`calloutPlacement`'s note).
      this._measurePanel(el);
      const p = calloutPlacement(x, y, bandL, bandR, Math.max(r.top, this._freeTop()), {
        reachX: this._ppW ? CALLOUT_OFF_X + this._ppW : undefined,
        overrun: this.st.sceneCoverL === 0 && this.st.sceneCoverR === 0,
      });
      if (!p.show) return false;
      flip = p.flip;
      drop = p.drop;
    }
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    if ((el.dataset.flip != null) !== flip) {
      if (flip) el.dataset.flip = "";
      else delete el.dataset.flip;
    }
    if ((el.dataset.drop != null) !== drop) {
      if (drop) el.dataset.drop = "";
      else delete el.dataset.drop;
    }
    if ((el.dataset.hang != null) !== hang) {
      if (hang) el.dataset.hang = "";
      else delete el.dataset.hang;
    }
    this._placedEl = el;
    this._placedX = x;
    this._placedY = y;
    this._placedRect = r;
    this._placedFlip = flip;
    this._placedDrop = drop;
    return true;
  }

  /** The phone's placement: straight above (or below) the anchor, centred and clamped into the
   *  band, between the command bar and the open sheet. The panel's size is measured — its content
   *  varies by subject — and re-read on the bounds clock, not per frame. */
  /** The panel's size, re-read on the bounds clock rather than per frame (its content varies by
   *  subject). Shared by the phone placement and the desktop fit test since 2026-10-18. */
  private _measurePanel(el: HTMLElement): void {
    if (this._ppEl !== el || this._ppIn-- <= 0) {
      const panel = el.querySelector<HTMLElement>(".co-panel");
      this._ppEl = el;
      this._ppIn = 30;
      this._ppW = panel ? panel.offsetWidth : 0;
      this._ppH = panel ? panel.offsetHeight : 0;
    }
  }
  private _placePhone(el: HTMLElement, x: number, y: number, r: DOMRect, bandL: number, bandR: number): boolean {
    this._measurePanel(el);
    if (!this._ppW) return false;
    const bottom = this._phoneBottom() - this.st.sceneCoverB;
    const p = calloutPhonePlacement(x, y, bandL, bandR, Math.max(r.top, this._freeTop()), bottom, this._ppW, this._ppH);
    if (!p.show) return false;
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    if (el.dataset.phone == null) el.dataset.phone = "";
    if (el.dataset.flip != null) delete el.dataset.flip;
    if (el.dataset.hang != null) delete el.dataset.hang;
    if ((el.dataset.drop != null) !== p.drop) {
      if (p.drop) el.dataset.drop = "";
      else delete el.dataset.drop;
    }
    const left = `${Math.round(p.left)}px`;
    if (el.style.getPropertyValue("--co-left") !== left) el.style.setProperty("--co-left", left);
    // THE LEADER RUNS TO THE FREE STRIP (user, 2026-10-07): its length varies with where the
    // subject sits, so the panel's distance rides `--co-phone-len` and the leader's panel end is
    // written here, on the three lines SceneCallout draws (mask ink, casing, dashes) — the
    // multi-leader's own discipline: position never renders React.
    const len = Math.round(p.leader);
    if (len !== this._ppLen || el !== this._ppLenEl) {
      this._ppLen = len;
      this._ppLenEl = el;
      el.style.setProperty("--co-phone-len", `${len}px`);
      const end = String(-(len - CALLOUT_LEG_INSET));
      for (const line of el.querySelectorAll<SVGLineElement>(".co-leader line")) {
        line.setAttribute(line.classList.contains("co-draw") ? "y1" : "y2", end);
      }
    }
    this._placedEl = el;
    this._placedX = x;
    this._placedY = y;
    this._placedRect = r;
    this._placedFlip = false;
    this._placedDrop = p.drop;
    return true;
  }
  private _ppEl: HTMLElement | null = null;
  private _ppLen = -1;
  private _ppLenEl: HTMLElement | null = null;
  private _ppIn = 0;
  private _ppW = 0;
  private _ppH = 0;

  // The free canvas, from the one reading the Engine's framing shift shares (`ChromeBounds`).
  // Where it ENDS: the bottom band's top edge less a little air, or the viewport's where no band is
  // in the lane. Where it BEGINS: the command bar's bottom edge — the canvas runs behind the bar, so
  // a top measured from y = 0 let a 220px label stand up into it (user, 2026-10-03, suggestion 5 of
  // the callout review). On a phone the floor is the dock bar's top edge.
  private _freeBottom(): number {
    return this.h.chrome.read().bandTop - 4;
  }
  private _phoneBottom(): number {
    return this.h.chrome.read().dockTop - 4;
  }
  private _freeTop(): number {
    // Under the bar — and under the register switch where it stands on the scene (D3).
    return this.h.chrome.read().sceneTop;
  }

  // THE MULTI-LEADER (user, 2026-08-30): a machine is SEVERAL beads in hyper — one per layer it
  // runs — and its callout points at each of them, not just the primary. Projects the sibling
  // beads (Globe.selectedNodeHyperAnchors) and writes the extra dashed legs in PANEL-LOCAL
  // pixels (the wrapper's origin IS the primary anchor). DOM writes only — position never
  // renders React (the Tooltip discipline). `r == null` (or a non-node anchor, or any other
  // view) hides every leg.
  //
  // EVERY LEG FANS FROM THE PANEL'S OWN CORNER (user, same day, second round: "connect the
  // anchor itself to all spheres — they are considered equal"): the first cut ran the extra
  // legs bead-to-bead from the primary, which read as one privileged sphere chained to the
  // others. The corner is the .co-leader's own panel end (CALLOUT_OFF_X/Y, mirrored by the
  // flip/drop the placement just decided), so the primary's leader and the sibling legs all
  // meet at one point and the beads read as peers.
  // The legs are STATIC children React renders once per wrapper mount, so the DOM refs are
  // cached per element identity (a label returning from absence mounts a fresh wrapper — fresh
  // cache, every leg back at its hidden default; a subject change keeps it) and the hidden steady state — most frames, in
  // every view — costs one flag check with NO DOM reads. querySelectorAll ran here per frame
  // before, on the !on path included (review, 2026-08-31 — rule-5 discipline applied to DOM).
  private _mlegHost: HTMLElement | null = null;
  private _mlegs: { g: SVGGElement; line: SVGLineElement; ring: SVGCircleElement }[] = [];
  private _mlegShown = 0;
  private _syncCalloutMulti(el: HTMLElement, ax: number, ay: number, r: DOMRect | null, flip: boolean, drop: boolean, phoneLen: number): void {
    const want = r != null && this.h.mode === "hyper" && this._calloutNodeAnchor;
    if (!want && this._mlegShown === 0 && this._mlegHost === el) return;
    if (this._mlegHost !== el) {
      this._mlegHost = el;
      this._mlegs = Array.from(el.querySelectorAll<SVGGElement>(".co-mleg"), (g) => ({
        g, line: g.querySelector("line")!, ring: g.querySelector("circle")!,
      }));
      this._mlegShown = 0; // a fresh mount renders every leg hidden
    }
    const legs = this._mlegs;
    if (legs.length === 0) return;
    // The panel end of the leader: the diagonal standoff's corner, or — on a phone (`phoneLen` > 0,
    // the vertical leader's written length) — straight above or below the anchor.
    const cx = phoneLen > 0 ? 0 : flip ? -CALLOUT_OFF_X : CALLOUT_OFF_X;
    const cy = phoneLen > 0 ? (drop ? phoneLen - CALLOUT_LEG_INSET : -(phoneLen - CALLOUT_LEG_INSET)) : drop ? CALLOUT_OFF_Y - CALLOUT_LEG_INSET : -(CALLOUT_OFF_Y - CALLOUT_LEG_INSET);
    let n = 0;
    if (want && r) {
      const count = this.h.globe.selectedNodeHyperAnchors(this._calloutSibs);
      for (let i = 0; i < count && n < legs.length; i++) {
        const v = this._calloutSibs[i]!;
        this.h.globe.group.localToWorld(v); // the rendered structure transform — a label read. render-state OK
        v.applyMatrix4(this.h.ctx.camera.matrixWorldInverse);
        if (v.z > -0.1) continue; // behind the camera plane — this bead gets no leg this frame
        v.applyMatrix4(this.h.ctx.camera.projectionMatrix);
        const sx = r.left + (v.x * 0.5 + 0.5) * r.width - ax;
        const sy = r.top + (-v.y * 0.5 + 0.5) * r.height - ay;
        const { g, line, ring } = legs[n]!;
        line.setAttribute("x1", cx.toFixed(1));
        line.setAttribute("y1", cy.toFixed(1));
        line.setAttribute("x2", sx.toFixed(1));
        line.setAttribute("y2", sy.toFixed(1));
        ring.setAttribute("cx", sx.toFixed(1));
        ring.setAttribute("cy", sy.toFixed(1));
        if (n >= this._mlegShown) g.setAttribute("visibility", "visible");
        n++;
      }
    }
    for (let i = n; i < this._mlegShown; i++) legs[i]!.g.setAttribute("visibility", "hidden");
    this._mlegShown = n;
  }

  // HYPER anchors the committed NODE's own bead when one is committed (user, 2026-08-15 —
  // clickable, has a card, so it gets its callout; the CAMERA still answers a node with its
  // network's framing, but the label points at the thing itself), else the network's hub or
  // the core. The label needs the RENDERED position, not a layout anchor — not framing math.
  private _hyperCalloutAnchor(v: THREE.Vector3): boolean {
    const st = this.st;
        const p = st.inspect;
    this._calloutNodeAnchor = false;
    // THE BOX LEADS (user, 2026-08-15): re-boxing an ancestor card (clicking a committed
    // node's hub) steps the callout up to the network — the box is the subject, exactly as
    // the camera answers it. SceneCallout mirrors this preference for the content.
    if (
      st.boxedCard !== "context" &&
      p && (p.kind === "l0" || p.kind === "l1" || p.kind === "metanode") &&
      this.h.globe.selectedNodeHyperAnchor(v)
    ) {
      this.h.globe.group.localToWorld(v); // the rendered structure transform — a label read. render-state OK
      this._calloutNodeAnchor = true;
      return true;
    }
    if (this.h.filter === "all") return false;
    if (this.h.filter === "dag") {
      this.h.layers.coreGroup.getWorldPosition(v); // render-state OK
      return true;
    }
    const meta = this.h.dofMeta();
    if (!meta) return false; // unlisted / unknown: no 3D anchor — honest absence
    meta.group.getWorldPosition(v); // render-state OK
    return true;
  }

  // GEO anchors the finest committed rung with a POINT to point at — node > cohort > country >
  // network. The network rung had none until 2026-10-24 (a filtered fleet is spread across the
  // globe, and a single surface point would lie about where it is); it now points at the
  // network's own arc on the BASE RING under the globe (user: "currently it's a nice place to
  // anchor the metagraph callout which is missing in this view") — the one object that stands
  // for the whole network rather than one of its places. Surface anchors are globe-LOCAL points
  // lifted just above the land, carried into world space through the rotating globe group each
  // frame — a render-path label read, the same justification as the hyper anchors above; the
  // ring anchor is ring-local and rides the ring group, which does not spin.
  private _geoCalloutAnchor(v: THREE.Vector3): boolean {
    const st = this.st;
        const lift = GEO_R + LAND_H + 0.5;
    // THE BOX LEADS (user, 2026-08-15), then the default finest-first order — a boxed rung
    // whose anchor can't resolve falls through rather than blanking the callout.
    const boxed = st.boxedCard;
    const ok =
      (boxed === "cohort" && this._geoAnchorCohort(st, v, lift)) ||
      (boxed === "country" && this._geoAnchorCountry(st, v, lift)) ||
      this._geoAnchorNode(st, v, lift) ||
      this._geoAnchorCohort(st, v, lift) ||
      this._geoAnchorCountry(st, v, lift);
    if (ok) {
      this.h.globe.group.localToWorld(v); // the rendered globe rotation — a label read. render-state OK
      return true;
    }
    if (this.h.filter === "all" || !this.h.globe.baseRing.networkAnchor(this.h.filter, v)) return false;
    this.h.globe.baseRing.group.localToWorld(v); // the ring's base-plane pose — a label read. render-state OK
    return true;
  }

  private _geoAnchorNode(st: CalloutState, v: THREE.Vector3, lift: number): boolean {
    const p = st.inspect;
    if (!p || (p.kind !== "l0" && p.kind !== "l1" && p.kind !== "metanode") || p.geo?.lat == null || p.geo.lon == null)
      return false;
    // THE chip, not the stack's base (user, 2026-08-15): the spotlight's own per-record
    // resolution, exposed by Globe. The lat/lon surface point stays as the fallback for the
    // brief window before the selection record resolves on fresh data.
    if (!this.h.globe.selectedNodeAnchor(v)) {
      if (this._geoNodePick !== p) {
        this._geoNodePick = p;
        this._geoNodeLocal.copy(latLonToVec3(p.geo.lat, p.geo.lon, lift)); // event-time
      }
      v.copy(this._geoNodeLocal);
    }
    return true;
  }

  private _geoAnchorCohort(st: CalloutState, v: THREE.Vector3, lift: number): boolean {
    if (!st.cohort) return false;
    const d = this.h.globe.cohortAnchorDir;
    if (!d) return false;
    v.copy(d).multiplyScalar(lift);
    return true;
  }

  private _geoAnchorCountry(st: CalloutState, v: THREE.Vector3, lift: number): boolean {
    if (!st.country) return false;
    if (this._geoCcKey !== st.country) {
      this._geoCcKey = st.country;
      this._geoCcOk = this.h.globe.countryAnchorDir(st.country, this._geoCcDir); // event-time
    }
    if (!this._geoCcOk) return false;
    v.copy(this._geoCcDir).multiplyScalar(lift);
    return true;
  }

  // LEDGER anchors the pinned SNAPSHOT — the metagraph snapshot's lane lead, or the committed
  // global tick's byte-bar lead one storey down. The rewind brings a committed row to the lead
  // position, so the lead slot IS where the subject settles (LedgerView.calloutAnchor is pure
  // layout data). An uncataloged channel's rows live on the unlisted lane.
  /** THE SUBJECTS THE SNAPSHOTS VIEW LABELS — `domain/calloutSubjects`, the ONE chain both owners
   *  consult (2026-11-07): `SceneCallout` draws the label it names, this projector anchors it.
   *  Resolved once per `sync` (perf review: two calls a frame allocated six objects). */
  private readonly _subjIn: CalloutSubjectInput = { register: "snapshots", boxedCard: null, hasSnap: false, hasMetaSnap: false, hasBlock: false, hasDataBlock: false, lane: false };
  private _subject: CalloutSubject = null;

  private _ledgerCalloutAnchor(v: THREE.Vector3): boolean {
    const st = this.st;
    const subject = this._subject;
    if (subject === null) return false;
    // Every label rides the chamber's trail: it waits until its row is FIXED on the plane
    // (LedgerView.calloutSettled — the chamber's own clocks).
    if (!this.h.ledger.calloutSettled(st.following)) return false;
    // The GLOBAL SNAPSHOT's bar (or the resolved network's own segment of it); the TRANSACTION BLOCK
    // (D3) at its own place in the chamber; the DATA BLOCK on its snapshot's tile (one label per tile
    // — the snapshot's steps aside); the METAGRAPH SNAPSHOT's tile; the network's LANE head (user,
    // 2026-10-03: "the dossier on snapshots page has no callout on the scene") — layout data, fixed
    // for the session; false when the lane isn't in the field, and then the label stays down rather
    // than borrow another subject's point.
    if (subject === "global") this._ledgerBarAnchor(v);
    else if (subject === "block") { if (!this.h.ledger.selectedBlockAnchor(v)) return false; }
    else if (subject === "dataBlock" || subject === "metaSnap") { if (!st.metaSnap || !this._ledgerTileAnchor(st.metaSnap, v)) return false; }
    else if (!this.h.ledger.calloutAnchor(this.h.ledgerNet, v)) return false;
    this.h.ledger.group.localToWorld(v); // the rendered chamber transform — a label read. render-state OK
    return true;
  }

  // THE committed snapshot's tile (user, 2026-08-15), rewind offsets included; the lane lead
  // stays as the fallback while the tile is off-trail (aged out of the window or not drawn this
  // frame). Chamber-local, like every LedgerView anchor.
  private _ledgerTileAnchor(sel: MetaSnapSel, v: THREE.Vector3): boolean {
    if (this.h.ledger.selectedTileAnchor(v)) return true;
    return this.h.ledger.calloutAnchor(sel.metaId, v) || this.h.ledger.calloutAnchor(UNLISTED_ID, v);
  }

  // The GLOBAL SNAPSHOT's bar, or the resolved network's own segment of it.
  private _ledgerBarAnchor(v: THREE.Vector3): void {
    const lens = ledgerLens(this.h.ledgerNet);
    if (lens !== "all" && this.h.ledger.bandAnchor(lens, v)) return;
    this.h.ledger.calloutAnchor(null, v);
  }

}
