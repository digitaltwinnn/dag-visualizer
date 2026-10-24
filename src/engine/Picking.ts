import * as THREE from "three";
import { useStore, type Mode } from "@/src/store/store";
import { applyClickActions } from "@/src/store/applyClickActions";
import { countrySubject, hoverKeyOf, tooltipSubject } from "@/src/data/hoverSubject";
import { metaSnapHoverKey, type PickDescriptor } from "@/src/data/types";
import { VIEW_POLICIES } from "./domain/viewPolicy";
import { R as GEO_R, LAND_H } from "./domain/geoLayout";
import { clickActions, pickActive, metaSnapSelectActions, bandSelectActions } from "./domain/pickActions";
import type { CohortSel, CompositionSel } from "./domain/focusLadder";
import type { SceneCtx } from "./scene/SceneContext";
import type { Globe } from "./scene/Globe";
import type { HyperView } from "./scene/views/HyperView";
import type { LedgerView } from "./scene/views/LedgerView";

// PICKING — the raycast, the hover channels and the click's decision table (split out of Engine.ts
// on 2026-10-24, the way CalloutSync and TrendStackSync were: ~250 lines that shared no state with
// the render loop beyond what the host hands over). The Engine keeps every GATE a pick runs behind
// (the transition's misleading window, a drag's drift, a double-tap's eaten click, the long-press
// disarm) and calls `move` / `click` for a pointer event that passed them.
//
// ⚠️ ENGINE-LAYER STORE BRIDGE, by name (rule 1, `layerBoundaries.test.ts`'s STORE_BRIDGE): this
// module writes the hover channels and applies click actions through the one executor. The scene
// modules it raycasts never see the store.
//
// Rule 5 governs `move`: the raycaster, the pointer, the land sphere and the pick buffer are
// allocated once; a move writes the store only when the hovered subject changes.

/** The engine-side values picking needs. Bound once — stable refs plus getters for what changes. */
export interface PickHost {
  canvas: HTMLCanvasElement;
  ctx: SceneCtx;
  globe: Globe;
  layers: HyperView;
  ledger: LedgerView;
  mode: Mode;
  filter: string;
  /** The hyper→geo morph; country hover and drill resolve only on the settled globe (> 0.9). */
  morph: number;
  /** Metagraphs with a located node — `pickActive` skips the others' hubs. */
  activeMetaIds: Set<string> | null;
  cohortSel: CohortSel | null;
  /** The network the LEDGER resolves against — `domain/tickNet.ledgerNetwork`, one home. */
  ledgerNet(): string;
  /** The composition group a node pick belongs to in the current view's ladder. */
  compositionOf(p: PickDescriptor | null): CompositionSel | null;
}

export class Picking {
  readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly _pickBuf: THREE.Object3D[] = [];
  private readonly _landSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), GEO_R + LAND_H);
  private readonly _landHit = new THREE.Vector3();
  /** The object the last pick hit (a band's `bandKey`, a ring arc's `country` ride on it). */
  private _hitObj: THREE.Object3D | null = null;
  private _hoverKey: string | null = null;

  constructor(private readonly h: PickHost) {}

  // Resolve the view policy's pick sources to the actual mesh pools. Unlisted sources / flat views
  // (empty pickSources) raycast nothing. Order is immaterial — the raycaster sorts hits by distance.
  pickablesFor(): THREE.Object3D[] {
    const out = this._pickBuf;
    out.length = 0;
    for (const src of VIEW_POLICIES[this.h.mode].pickSources) {
      if (src === "globe") out.push(...this.h.globe.pickables);
      // The base ring's arcs pick as the hubs do (`kind: "meta"`): a hover previews the network
      // through hoverFilter, a click commits it through the table's filter arm. Its own source
      // (review, 2026-10-24): the fleet's "globe" pool is picked in every 3D view, but the rings
      // are drawn only in Geography, and the raycaster does not read `visible`.
      else if (src === "baseRing") out.push(...this.h.globe.baseRing.pickables);
      else if (src === "layers") out.push(...this.h.layers.pickables);
      else if (src === "ledger") out.push(...this.h.ledger.pickables);
    }
    return out;
  }

  private pickAt(e: MouseEvent): PickDescriptor | null {
    const r = this.h.canvas.getBoundingClientRect();
    this.pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    this.pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    const list = this.pickablesFor();
    if (!list.length) return null;
    this.raycaster.setFromCamera(this.pointer, this.h.ctx.camera);
    const hits = this.raycaster.intersectObjects(list, false);
    // Return the first hit that's part of the current selection — nodes filtered out of the
    // geo view are hidden, so they shouldn't be clickable/hoverable either (Three's raycaster
    // ignores scale/visibility, so the inactive ones must be skipped explicitly).
    this._hitObj = null;
    for (const h of hits) {
      // A BLOCKER (the ledger's floor glass) is a normal surface: the ray stops here, and the
      // glass itself is no subject — content underneath must not pick through it (user,
      // 2026-08-07). Hits are distance-sorted, so anything before the glass already returned.
      if (h.object.userData.blocker) return null;
      const pick: PickDescriptor | undefined = h.object.userData.picks
        ? h.object.userData.picks[h.instanceId as number]
        : h.object.userData.pick;
      // A COUNTRY-tagged object (the base ring's outer arcs and wedges) is a hit with no
      // descriptor: `countryUnderCursor` reads it where it would otherwise resolve the land.
      if (!pick && h.object.userData.country) {
        this._hitObj = h.object;
        return null;
      }
      if (!pick || !pickActive(pick, this.h.mode, this.h.filter, this.h.activeMetaIds)) continue;
      this._hitObj = h.object;
      return pick;
    }
    return null;
  }

  /** THE COUNTRY UNDER THE CURSOR with nothing picked (one home for the hover and the click,
   *  review 2026-10-24): the base ring's country arc or wedge when the hit object carries one,
   *  else the land under the ray — the sphere hit is analytic, and the Globe resolves WHICH
   *  country in its rotated frame. Reads the raycaster as the pick left it. */
  private countryUnderCursor(): string | null {
    const arcCc = this._hitObj?.userData.country as string | undefined;
    if (arcCc) return arcCc;
    const hit = this.raycaster.ray.intersectSphere(this._landSphere, this._landHit);
    return hit ? this.h.globe.countryCcAtPoint(hit) : null;
  }

  // Drop every transient hover: the tooltip subject + all the hover channels (each store write
  // also resets its 3D effect via the command-bridge subscription). Event-driven only (a view
  // switch, the pointer leaving the canvas, a long-press's read window ending) — never per frame.
  clearHover(): void {
    const st = useStore.getState();
    if (st.hoverNodeId != null) st.setHoverNodeId(null);
    if (st.hoverSnapOrd != null) st.setHoverSnapOrd(null);
    if (st.hoverMetaSnap != null) st.setHoverMetaSnap(null);
    if (st.hoverFilter != null) st.setHoverFilter(null);
    if (st.hoverCountry != null) st.setHoverCountry(null);
    if (st.hoverCohort != null) st.setHoverCohort(null);
    if (this._hoverKey != null || st.hover != null) {
      this._hoverKey = null;
      st.setHover(null);
    }
    this.h.canvas.style.cursor = "grab";
  }

  /** A pointer move that passed the Engine's gates: hover tooltip + the hover channels. Only
   *  writes the store when the hovered target changes (not per pixel); the Tooltip component
   *  positions itself from the pointer. */
  move(e: MouseEvent): void {
    const p = this.pickAt(e);
    this.h.canvas.style.cursor = p ? "pointer" : "grab";
    const st = useStore.getState();

    // Route the hovered subject to ITS channel (each already drives a 3D effect + now the paired
    // card/row). Only the channel for the hovered kind is set; the others clear — so exactly one
    // subject is "hovered" at a time. Write only on change (mousemove is high-frequency).
    const nodeKey = hoverKeyOf(p);                                   // node → globe shell glow
    // snapshot → its ledger row. A metagraph-snapshot TILE routes to the SNAPSHOT channel instead
    // (user, 2026-08-09): it is one snapshot, not its tick, so hovering it must not light every
    // sibling that anchored into the same global tick — in the scene OR in the explorer/raw rows.
    const snapOrd = p?.kind === "snapshot" ? p.data.ordinal : null;
    const metaSnapKey = p?.kind === "metaSnap" ? metaSnapHoverKey(p.sel.metaId, p.sel.ordinal) : null;
    const metaId = p?.kind === "meta" ? p.cfg?.id ?? null : null;    // hub → metagraph dim preview
    // Country under the cursor (policy-gated): the SCENE side of the bidirectional country
    // pairing — writes the same hoverCountry channel the explorer rows use, so the border
    // preview + the row wash light from either end. Hovering a NODE hovers its country too
    // (user); with no object hit, the land point under the cursor resolves analytically
    // (ray→sphere — the sphere is rotation-invariant; the Globe resolves WHICH country).
    let countryCc: string | null = null;
    if (VIEW_POLICIES[this.h.mode].countryHover && this.h.morph > 0.9) {
      if (p && (p.kind === "l0" || p.kind === "l1" || p.kind === "metanode")) {
        countryCc = p.geo?.cc ?? null;
      } else if (!p) {
        countryCc = this.countryUnderCursor();
      }
    }
    if (countryCc) this.h.canvas.style.cursor = "pointer"; // the border preview invites the drill
    if (nodeKey !== st.hoverNodeId) st.setHoverNodeId(nodeKey);
    if (snapOrd !== st.hoverSnapOrd) st.setHoverSnapOrd(snapOrd);
    if (metaSnapKey !== st.hoverMetaSnap) st.setHoverMetaSnap(metaSnapKey);
    if (metaId !== st.hoverFilter) st.setHoverFilter(metaId);
    if (countryCc !== st.hoverCountry) st.setHoverCountry(countryCc);

    // The lean tooltip label — re-write the store only when the subject's identity changes so
    // following the cursor never re-renders React.
    // Land with nothing on it still names itself: the country whose border the pointer lit.
    const subj = tooltipSubject(p) ?? (countryCc ? countrySubject(countryCc) : null);
    const key = subj ? `${subj.kind}|${subj.ident}|${subj.name}|${subj.color}` : null;
    if (key === this._hoverKey) return;
    this._hoverKey = key;
    st.setHover(subj);
  }

  /** A click that passed the Engine's gates: resolve the pick and the country under the cursor,
   *  then let the decision table say what it means. `say` is the Engine's `?clickdebug` voice. */
  click(e: MouseEvent, say: (verdict: string, extra?: Record<string, unknown>) => void): void {
    const p = this.pickAt(e);
    // The pick's NETWORK matters as much as its kind here: "the node spheres are not clickable"
    // could mean nothing picks, or that the ray keeps reaching PAST the committed network onto
    // somebody else's nodes — two different bugs that look identical from the outside.
    say(p ? `PICKED ${p.kind}` : "NO HIT — the ray met nothing pickable here", {
      pickables: this._pickBuf.length,
      net: p ? (p.kind === "metanode" ? p.meta?.id : p.kind === "l0" || p.kind === "l1" ? "dag" : p.kind === "meta" ? p.cfg.id : undefined) : undefined,
    });
    // With nothing picked, resolve the drillable country under the cursor (geo only — the
    // land-sphere hit is analytic; the Globe resolves WHICH country in its rotated frame).
    let countryCc: string | null = null;
    if (!p && VIEW_POLICIES[this.h.mode].countryHover && this.h.morph > 0.9) countryCc = this.countryUnderCursor();
    // The SEMANTICS live in the pure, tested decision table (domain/pickActions) — what a
    // click means per view × pick kind, including the ordering contracts. This handler only
    // resolves inputs above and executes the actions below.
    const st = useStore.getState();
    // The two Snapshots subjects that resolve to a PAIR (a metagraph + a tick) have their own
    // builders in the same table, because a single descriptor can't express both halves.
    // A metagraph-snapshot TILE: commit the tile AND pin the global tick it anchored into.
    if (p?.kind === "metaSnap") {
      applyClickActions(
        metaSnapSelectActions(p.sel, p.global, { metaSnap: st.metaSnap, following: st.following, inspect: st.inspect }),
      );
      return;
    }
    // A byte-bar BAND: the tick descriptor rides `userData.pick`, the band's metagraph key rides
    // `userData.bandKey` on the same mesh (a band is a slice of a tick, not a subject of its own).
    const bandKey = this._hitObj?.userData.bandKey as string | undefined;
    if (p?.kind === "snapshot" && bandKey) {
      applyClickActions(
        bandSelectActions(bandKey, p, {
          metaSnap: st.metaSnap,
          hasInspect: st.inspect != null,
          net: this.h.ledgerNet(),
        }),
      );
      return;
    }
    applyClickActions(
      clickActions({
        mode: this.h.mode,
        pick: p,
        countryCc,
        // Hyper's node ancestry (FULL-ANCESTRY rule): a node click commits the composition group
        // it belongs to. The group is derivable from the node itself — its make-up IS the group
        // key — so no list lookup.
        compositionSel: this.h.compositionOf(p),
        current: {
          filter: st.filter,
          country: st.country,
          hasInspect: !!st.inspect,
          cohort: this.h.cohortSel,
          pinnedOrdinal: !st.following ? st.snap?.data?.ordinal ?? null : null,
          metaSnap: st.metaSnap,
          tickNet: st.tickNet,
        },
      }),
    );
  }
}
