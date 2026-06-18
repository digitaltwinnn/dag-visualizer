// UI layer: raycast-based hover tooltips & click inspector, the "Learn" panel
// with camera focus, a guided tour, and live stat readouts.

import * as THREE from "three";
import { shortHash } from "./api.js";
import { COLORS, METAGRAPHS } from "./config.js";

const FOCI = {
  overview:   { pos: new THREE.Vector3(0, 15, 60),  target: new THREE.Vector3(0, 2, 0) },
  l0:         { pos: new THREE.Vector3(0, 6, 20),   target: new THREE.Vector3(0, 1, 0) },
  l1:         { pos: new THREE.Vector3(14, 10, 26), target: new THREE.Vector3(0, 0, 0) },
  metagraphs: { pos: new THREE.Vector3(0, 30, 70),  target: new THREE.Vector3(0, 0, 0) },
  geo:        { pos: new THREE.Vector3(0, 11, 36),  target: new THREE.Vector3(0, 2, 0) },
};

export class UI {
  constructor({ camera, renderer, controls, layers, globe, getAnchor, getSnapshots, onFilter, onSnapSelect }) {
    this.camera = camera;
    this.renderer = renderer;
    this.controls = controls;
    this.layers = layers;
    this.globe = globe;
    // Per-tick derived DAG fee lookup (tracked metagraphs); null until polled.
    this.getAnchor = getAnchor || (() => null);
    // Returns the rolling global-snapshot buffer (oldest -> newest), for "follow
    // latest relevant snapshot".
    this.getSnapshots = getSnapshots || (() => []);
    // Notified (id, hexColor|null) when the network filter changes, so the snapshot
    // ribbon can cue which chips the selected metagraph anchored into.
    this.onFilter = onFilter || (() => {});
    // Notified with the snapshot now shown in the inspector (or null), so the ribbon
    // can mirror it as the selected chip — click, follow-latest, and filter alike.
    this.onSnapSelect = onSnapSelect || (() => {});
    this.mode = "hyper";

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.hovered = null;
    this.tween = null; // { fromPos, toPos, fromTgt, toTgt, t, dur }

    this.el = {
      tooltip: document.getElementById("tooltip"),
      inspector: document.getElementById("inspector"),
      inspContent: document.getElementById("inspector-content"),
      metapane: document.getElementById("metapane"),
      metapaneContent: document.getElementById("metapane-content"),
      source: document.getElementById("stat-source"),
      metagraphs: document.getElementById("stat-metagraphs"),
      nodes: document.getElementById("stat-nodes"),
      rate: document.getElementById("stat-rate"),
      anchors: document.getElementById("stat-anchors"),
      blocks: document.getElementById("stat-blocks"),
      sparkRate: document.getElementById("spark-rate"),
      sparkAnchors: document.getElementById("spark-anchors"),
      sparkBlocks: document.getElementById("spark-blocks"),
      fees: document.getElementById("stat-fees"),
      feesDag: document.getElementById("stat-fees-dag"),
      feesWrap: document.getElementById("stat-fees-wrap"),
      sparkFees: document.getElementById("spark-fees"),
      learn: document.getElementById("learn"),
      steps: [...document.querySelectorAll(".learn-step")],
      leaderboard: document.getElementById("leaderboard"),
      lbList: document.getElementById("lb-list"),
      lbTotal: document.getElementById("lb-total"),
      lbScore: document.getElementById("lb-score"),
      mfChips: document.getElementById("mf-chips"),
      mfSub: document.getElementById("mf-sub"),
      leftcol: document.getElementById("leftcol"),
      ledger: document.getElementById("ledger-view"),
    };

    this.filter = "all";
    this.country = null; // optional country drill-down within the network filter (geo view)
    this.lbExpanded = false; // whether the leaderboard's "Other countries" tail is expanded
    this._priceUsd = null;   // live $DAG/USD price (conversion for Fees/hr)
    this._activity = null;   // last NetworkData.getActivity(), for fee re-render
    this._metaPaneId = null; // metagraph id currently shown in the context pane
    this._followSnap = false; // snapshot card follows the latest relevant snapshot
    this._shownSnap = null;   // the snapshot currently in the inspector card
    this._pulse = false;      // beat the live heartbeat on the next render (new snapshot)
    this._wire();
  }

  _wire() {
    const dom = this.renderer.domElement;
    dom.addEventListener("pointermove", (e) => this._onMove(e));
    dom.addEventListener("click", (e) => this._onClick(e));

    document.getElementById("inspector-close").onclick = () => this._closeInspector();
    const mpClose = document.getElementById("metapane-close");
    if (mpClose) mpClose.onclick = () => this.selectFilter("all"); // clearing selection hides the pane

    // Expand/collapse long descriptions (clamped to a few lines by default). Delegated
    // so it survives the card re-rendering its innerHTML.
    [this.el.inspContent, this.el.metapaneContent].forEach((c) => c?.addEventListener("click", (e) => {
      const btn = e.target.closest(".desc-more");
      if (!btn) return;
      const expanded = btn.previousElementSibling.classList.toggle("expanded");
      btn.textContent = expanded ? "Show less" : "Show more";
    }));

    this.el.steps.forEach((step) => {
      step.onclick = () => {
        this._ensureHyper();
        const focus = step.dataset.focus;
        this.focus(focus);
        this._activateStep(step);
        this._highlight(focus);
      };
    });

    document.getElementById("learn-toggle").onclick = (e) => {
      this.el.learn.classList.toggle("collapsed");
      e.target.textContent = this.el.learn.classList.contains("collapsed") ? "+" : "–";
    };
    document.getElementById("reset-view").onclick = () => { this._ensureHyper(); this.controls.autoRotate = true; this.focus("overview"); this._activateStep(null); this._highlight(null); };
    document.getElementById("tour-btn").onclick = () => { this._ensureHyper(); this._startTour(); };
  }

  // If the globe view is active, flip back to the Hypergraph view.
  _ensureHyper() {
    if (this.mode !== "geo") return;
    document.querySelector('#viewtoggle [data-view="hyper"]')?.click();
  }

  // ---------------------------------------------------------- picking
  _setPointer(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    this.pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }

  // Objects each view raycasts for hover/click — declared per view so a view only
  // ever picks its OWN elements, never another view's (the raycaster ignores
  // `visible`, so hidden meshes would otherwise still be hit). A new/unlisted view
  // is non-pickable by default; register its targets here when it gets some.
  _pickablesFor(mode) {
    switch (mode) {
      case "hyper":  return this.layers.pickables.concat(this.globe.pickables); // core, hubs, nodes
      case "geo":    return this.globe.pickables;                               // node discs only
      default:       return [];                                                 // e.g. ledger placeholder
    }
  }

  // Returns the pick descriptor of the front-most hit, or null. The validator
  // nodes are a single InstancedMesh, so a node hit is resolved via instanceId;
  // the core & metagraphs are ordinary meshes carrying userData.pick directly.
  _pick() {
    const list = this._pickablesFor(this.mode);
    if (!list.length) return null;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(list, false);
    if (!hits.length) return null;
    const h = hits[0];
    if (h.object.userData.picks) return h.object.userData.picks[h.instanceId] || null;
    return h.object.userData.pick || null;
  }

  _onMove(e) {
    this._setPointer(e);
    const p = this._pick();
    const tip = this.el.tooltip;
    if (p) {
      tip.innerHTML = `<div class="tt-title">${p.title}</div><div class="tt-sub">${p.sub}</div>`;
      tip.style.left = e.clientX + "px";
      tip.style.top = e.clientY + "px";
      tip.classList.remove("hidden");
      this.renderer.domElement.style.cursor = "pointer";
    } else {
      tip.classList.add("hidden");
      this.renderer.domElement.style.cursor = "grab";
    }
  }

  _onClick(e) {
    this._setPointer(e);
    const p = this._pick();
    if (!p) return;
    // Clicking a metagraph hub selects it (filter) — that opens its context pane and
    // frames it — rather than opening a one-off inspector card.
    if (p.kind === "meta") { this.selectFilter(p.cfg.id); return; }
    this.controls.autoRotate = false;
    this._showInspector(p);
  }

  // ---------------------------------------------------------- inspector
  _showInspector(p) {
    this.el.inspContent.innerHTML = this._cardHTML(p);
    this.el.inspector.classList.remove("hidden");
    // Showing anything other than a snapshot drops the ribbon highlight and stops
    // following, so a new global snapshot won't yank this card back to a snapshot.
    if (p.kind !== "snapshot") { this._followSnap = false; this.onSnapSelect(null); }
  }

  // A description paragraph that's clamped to a few lines (CSS adds the "…") with a
  // "Show more" toggle — but only when the text is long enough to need it. The toggle
  // is handled by the delegated listener wired in _wire().
  _descHTML(text) {
    if (!text) return "";
    if (text.length <= 180) return `<p>${text}</p>`;
    return `<p class="desc">${text}</p><button type="button" class="desc-more">Show more</button>`;
  }

  // Full inspector-card HTML (tag + title + sub + body) for a pick descriptor —
  // shared by the click inspector and the persistent metagraph context pane.
  _cardHTML(p) {
    const tagColor = { core: COLORS.core, l0: COLORS.l0, l1: COLORS.l1, snapshot: COLORS.core, meta: p.cfg?.color, metanode: p.meta?.color }[p.kind];
    const hex = "#" + new THREE.Color(tagColor || COLORS.core).getHexString();
    const label = p.kind === "meta" ? "Metagraph" : p.kind === "metanode" ? "Metagraph node" : p.kind === "snapshot" ? "DAG snapshot" : p.kind.toUpperCase();
    // Live/pin cue next to the tag (snapshot card only): "● Live" while following the
    // latest relevant snapshot, "↻ Go live" once pinned (click to resume).
    const live = p.kind === "snapshot"
      ? `<button id="snap-follow" class="snap-pulse${this._followSnap ? " on" : ""}${this._pulse ? " beat" : ""}" title="${this._followSnap ? "Live — following the latest snapshot. Click to pin this one." : "Pinned. Click to go live."}">
           <svg class="hb" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
           <span>${this._followSnap ? "Live" : "Go live"}</span>
         </button>`
      : "";
    // Metagraph cards carry their colour-coded token tag (matching the filter chip)
    // next to the "Metagraph" pill.
    // Token badge next to the tag — the metagraph context pane shows its ticker, and
    // the node card matches it: the coloured ticker if the metagraph runs a currency-L1
    // cluster, else a muted "no token" badge (it's a data metagraph).
    let token = "";
    if (p.kind === "meta" && p.cfg) {
      token = `<span class="mg-tag mg-tag--sel" style="--mg:${hex};margin:0 0 10px 6px">${p.cfg.ticker || p.cfg.name}</span>`;
    } else if (p.kind === "metanode" && p.meta) {
      const hasCurrency = (p.meta.nodes || []).some((n) => (n.roles || [n.layer]).includes("cl1"));
      token = hasCurrency
        ? `<span class="mg-tag mg-tag--sel" style="--mg:${hex};margin:0 0 10px 6px">${p.meta.symbol || "—"}</span>`
        : `<span class="mg-tag mg-tag--other" style="margin:0 0 10px 6px">no token</span>`;
    }
    return `
      <span class="insp-tag" style="background:${hex}22;color:${hex};border:1px solid ${hex}55">${label}</span>${token}${live}
      <h3>${p.title}</h3>
      ${p.sub ? `<p class="insp-sub">${p.sub}</p>` : ""}
      ${this._cardBody(p)}`;
  }

  _cardBody(p) {
    let body = "";

    if (p.kind === "core") {
      const d = this.layers._latest;
      body = `
        <p>The <b>Global L0</b> is Constellation's base layer — the shared source of truth. L0 validators continuously bundle network activity into <b>global snapshots</b>, each cryptographically referencing the last to form the DAG.</p>
        ${row("Latest ordinal", d ? d.ordinal : "—")}
        ${row("Snapshot height", d ? d.height : "—")}
        ${row("Metagraphs anchored", d ? d.metagraphSnapshotCount ?? "—" : "—")}
        <p style="margin-top:14px">Because validation happens in parallel across the Hypergraph, the network scales horizontally and stays <b>feeless</b> for end users.</p>`;
    } else if (p.kind === "l0") {
      body = `
        ${nodeRows(p.node)}${geoRows(p.geo)}
        <p>This is one of the <b>${this.globe.l0Count}</b> validators in the Global L0 cluster. Each participates in <b>PRO consensus</b> (Proof of Reputable Observation): nodes observe each other's behaviour and build reputation, so honest validators converge on the next snapshot without energy-hungry mining.</p>
        <p>${p.geo ? "Validators are spread across many countries and providers — that geographic distribution is what makes the network hard to censor or shut down." : "The bright wave sweeping the shell is consensus settling snapshots into Global L0, round after round."}</p>`;
    } else if (p.kind === "l1") {
      body = `
        ${nodeRows(p.node)}${geoRows(p.geo)}
        <p>One of the <b>${this.globe.l1Count}</b> nodes in the DAG L1 cluster. <b>L1</b> is where transactions and application data enter the network — it validates them locally, then submits the result up to L0 for final settlement.</p>
        <p>Separating L1 from L0 keeps the secure base layer lean while apps stay fast.</p>`;
    } else if (p.kind === "snapshot") {
      const d = p.data;
      const anchored = typeof d.metagraphSnapshotCount === "number" ? d.metagraphSnapshotCount : null;
      const when = d.timestamp ? new Date(d.timestamp).toLocaleTimeString() : "—";
      // Derived DAG fee for this tick (from tracked metagraphs). The anchored COUNT
      // is exact (Global L0 reports it); the FEE is a floor when we can't attribute
      // every anchored snapshot (unlisted metagraphs anchor too — no fee source).
      const a = this.getAnchor(d.timestamp);
      const identified = a ? a.count : 0;
      const feeDag = a ? a.fee / 1e8 : 0;
      const full = anchored != null && a != null && identified >= anchored;
      const pct = anchored ? Math.round((identified / anchored) * 100) : 0;
      // Keep this panel simple: what the snapshot settles + the fee. The DAG mechanics
      // (ordinal vs height vs sub-height, parent-hash links forming the DAG edges) are
      // intentionally NOT explained here — they belong in the Snapshot DAG (ledger)
      // view, which can show the structure visually rather than in prose. See
      // [[dag-ledger-view-plan]].
      // Height = depth of the block DAG; sub-height orders snapshots that share a
      // height — two coordinates of the same position, so shown as one "h · sub" row.
      const heightTxt = d.subHeight != null
        ? `${(d.height ?? 0).toLocaleString()} · ${d.subHeight}`
        : (d.height ?? 0).toLocaleString();
      body = `
        <div class="insp-time"><span class="insp-time-label">Snapshot time</span><span class="insp-time-val">${when}</span></div>
        ${this._anchoredTags(a, anchored)}
        ${a && a.fee > 0 ? row("Settlement fees", `${feeDag.toFixed(4)} DAG ${full ? `<span class="insp-mini ok">complete</span>` : `<span class="insp-mini approx">at least</span>`}`) : ""}
        ${row(d.subHeight != null ? "Height · sub-height" : "Height", heightTxt)}
        ${a && a.fee > 0 && !full ? `<p style="margin-top:14px">Each anchored snapshot pays a <b>$DAG fee</b> set by its size. We can attribute <b>${identified} of ${anchored}</b> (${pct}%) to publicly listed metagraphs, so the total is <b>at least ${feeDag.toFixed(4)} $DAG</b>.</p>` : ""}
        ${full ? `<p style="margin-top:14px">Every anchored snapshot here is publicly listed, so the <b>${feeDag.toFixed(4)} DAG</b> fee total is complete.</p>` : ""}`;
    } else if (p.kind === "metanode") {
      const m = p.meta;
      // A metagraph node often serves several roles at once (consensus L0, plus
      // currency-L1 and/or data-L1) — show every role this machine actually runs.
      const ROLE = { l0: "L0 (consensus)", cl1: "Currency L1", dl1: "Data L1" };
      const roles = (p.node.roles && p.node.roles.length ? p.node.roles : [p.node.layer])
        .map((r) => ROLE[r] || r).join(" · ");
      // Token is shown as a header badge (see _cardHTML), so it's not repeated here.
      body = `
        ${row("Runs", roles)}
        ${nodeRows(p.node, false)}${geoRows(p.geo, false)}
        <p style="margin-top:14px">${metaNetworkText(m)}</p>`;
    } else if (p.kind === "meta") {
      const cfg = p.cfg;
      // The metagraph context pane is static identity only — its live anchoring (and
      // the global snapshot ordinal) are shown in the snapshot card beneath it, so we
      // don't repeat a separate, ever-changing metagraph ordinal here.
      // Data-driven facts from the live-baked metagraph (nodes, roles, locations).
      const mg = this.globe.metaList?.find((x) => x.id === cfg.id) || null;
      const nodes = (mg && mg.nodes) || [];
      let facts = "";
      if (nodes.length) {
        const present = _ROLE_ORDER.filter((r) => nodes.some((n) => _rolesOf(n).includes(r)));
        const hybrid = nodes.filter((n) => _rolesOf(n).length > 1).length;
        const dedBy = {};
        nodes.forEach((n) => { const r = _rolesOf(n); if (r.length === 1) dedBy[r[0]] = (dedBy[r[0]] || 0) + 1; });
        const parts = (hybrid ? [`${hybrid} hybrid`] : [])
          .concat(present.filter((r) => dedBy[r]).map((r) => `${dedBy[r]} dedicated ${_ROLE_FR[r]}`));
        const countries = new Set((this.globe.metaNodes || [])
          .filter((r) => r.metaId === cfg.id)
          .map((r) => r.pick.geo && r.pick.geo.country).filter(Boolean)).size;
        facts =
          row("Layers", present.map((r) => _ROLE_FR[r]).join(", ")) +
          row("Nodes", nodes.length) +
          row("Make-up", _joinList(parts)) +
          (countries ? row("Countries", countries) : "");
      }

      // Reuse the live, richer metagraph description (same source as the node
      // inspector); fall back to the hand-written config blurb only if absent.
      const blurb = (mg && mg.description) || cfg.blurb;
      body = `
        ${this._descHTML(blurb)}
        ${facts}
        ${siteRow(mg && mg.siteUrl)}`;
    }
    return body;
  }

  // Persistent "context" card for the selected metagraph — shown automatically
  // whenever a metagraph is the active filter, in every view. Static identity only
  // (its live anchoring shows in the snapshot card beneath it), so it never needs
  // re-rendering as snapshots arrive.
  showMetaPane(filterId) {
    const meta = this.layers.metas?.find((m) => m.cfg.id === filterId);
    if (!meta) return this.hideMetaPane();
    this._metaPaneId = filterId;
    this.el.metapaneContent.innerHTML = this._cardHTML({
      kind: "meta", cfg: meta.cfg,
      title: meta.cfg.name, sub: "", // identity is in the header pills (Metagraph + token)
    });
    this.el.metapane.classList.remove("hidden");
  }

  hideMetaPane() {
    this._metaPaneId = null;
    this.el.metapane?.classList.add("hidden");
  }

  // Show a snapshot in the inspector card. `following` = track the latest relevant
  // snapshot live (updated on each new global snapshot); otherwise it's pinned to
  // this one (e.g. the user clicked a ribbon chip).
  showSnapshot(data, following = false) {
    if (!data) return;
    // Beat the live heartbeat only when the followed card advances to a NEW snapshot —
    // not on pins or no-op re-renders of the same one. Consumed by _cardHTML's button.
    this._pulse = following && !!this._shownSnap && data.ordinal !== this._shownSnap.ordinal;
    this._followSnap = following;
    this._shownSnap = data;
    const blocks = Array.isArray(data.blocks) ? data.blocks.length : 0;
    const anchored = typeof data.metagraphSnapshotCount === "number" ? data.metagraphSnapshotCount : null;
    this._showInspector({
      kind: "snapshot",
      title: `Global snapshot #${data.ordinal}`,
      sub: anchored != null
        ? `${anchored} metagraph snapshot${anchored === 1 ? "" : "s"} anchored · ${blocks} block${blocks === 1 ? "" : "s"}`
        : `${blocks} block${blocks === 1 ? "" : "s"} · height ${data.height}`,
      data,
    });
    const btn = document.getElementById("snap-follow");
    if (btn) btn.onclick = () => this._toggleFollow();
    // Mirror this snapshot as the selected chip in the ribbon (highlight + scroll-in).
    this.onSnapSelect(data);
  }

  // Re-evaluate the followed snapshot — used when the anchor index fills in just
  // after a snapshot arrives, so a metagraph filter lands on the chip it anchored.
  refreshFollow() {
    if (this._followSnap) this._followLatest();
  }

  // The latest snapshot worth showing: when a metagraph is selected, the newest one
  // it anchored into (falling back to the newest global snapshot if it hasn't
  // anchored in the buffered window); otherwise just the newest global snapshot.
  _latestRelevantSnapshot() {
    const list = this.getSnapshots() || [];
    if (!list.length) return null;
    const mgSelected = this.layers.metas?.some((m) => m.cfg.id === this.filter);
    if (mgSelected) {
      for (let i = list.length - 1; i >= 0; i--) {
        const an = this.getAnchor(list[i].timestamp);
        if (an && an.metaIds && an.metaIds.has(this.filter)) return list[i];
      }
    }
    return list[list.length - 1];
  }

  _followLatest() {
    const snap = this._latestRelevantSnapshot();
    if (snap) this.showSnapshot(snap, true);
  }

  _toggleFollow() {
    if (this._followSnap) this.showSnapshot(this._shownSnap, false); // pin current
    else this._followLatest();                                       // resume following
  }

  // Colour-coded tags of the publicly listed metagraphs that anchored into a
  // snapshot (from the anchor index). Adds a muted "+ unlisted" tag when the
  // authoritative anchored count exceeds what we could attribute. Empty until the
  // tick's metagraph snapshots have been polled.
  _anchoredTags(a, anchored) {
    if (!a || !a.metaIds || !a.metaIds.size) return "";
    const cfgById = new Map((this.layers.metas || []).map((m) => [m.cfg.id, m.cfg]));
    let tags = "";
    for (const id of a.metaIds) {
      const cfg = cfgById.get(id);
      if (!cfg) continue;
      const hex = "#" + new THREE.Color(cfg.color).getHexString();
      const sel = id === this.filter ? " mg-tag--sel" : "";
      const n = (a.metaCounts && a.metaCounts.get(id)) || 1;
      tags += `<span class="mg-tag${sel}" style="--mg:${hex}">${cfg.ticker || cfg.name} (${n})</span>`;
    }
    if (anchored != null && anchored > a.count) tags += `<span class="mg-tag mg-tag--other">unlisted (${anchored - a.count})</span>`;
    return `<div class="insp-mgs"><span class="insp-mgs-label">Metagraph snapshots anchored here</span><div class="insp-mgs-tags">${tags}</div></div>`;
  }

  _closeInspector() {
    this.el.inspector.classList.add("hidden");
    this._followSnap = false;
    this.onSnapSelect(null); // drop the ribbon highlight
  }

  // ---------------------------------------------------------- camera focus
  _tweenTo(toPos, toTgt) {
    this.tween = {
      fromPos: this.camera.position.clone(), toPos: toPos.clone(),
      fromTgt: this.controls.target.clone(), toTgt: toTgt.clone(),
      t: 0, dur: 1.4,
    };
  }

  focus(name) {
    const f = FOCI[name];
    if (f) this._tweenTo(f.pos, f.target);
  }

  // Geography framing scaled by the selection's concentration R (0 = spread,
  // 1 = co-located): only near-co-located selections zoom in close; spread ones
  // stay at the wide "All" framing.
  _focusGeo(R) {
    const t = THREE.MathUtils.smoothstep(R, 0.7, 1.0);
    this._tweenTo(
      new THREE.Vector3(0, THREE.MathUtils.lerp(11, 9, t), THREE.MathUtils.lerp(36, 27, t)),
      new THREE.Vector3(0, THREE.MathUtils.lerp(2, 2.7, t), 0),
    );
  }

  // Hypergraph: fly the camera to frame the selected network instead of dimming.
  // Metagraphs fly to their orbiting hub; L0/L1/All use the preset framings.
  // Uses the hub's local (unscaled) position so it's correct even mid-morph.
  _focusFilter(filter) {
    this.layers.focusId = null; // resume all hub orbits unless we lock onto one
    if (filter === "all") { this.controls.autoRotate = true; this.focus("overview"); return; }
    this.controls.autoRotate = false;
    if (filter === "l0" || filter === "l1") { this.focus(filter); return; }
    const meta = this.layers.metas?.find((x) => x.cfg.id === filter);
    if (!meta) { this.focus("overview"); return; }
    this.layers.focusId = filter;                     // anchor this hub so it stays framed
    const hub = meta.group.position.clone();          // hypergraph position (root scale aside)
    const out = hub.clone().normalize();              // radial (hub -> away from core)
    // View the hub from slightly off the radial line (to the side + above) so the
    // blurred core sits to the upper-left of it instead of directly behind.
    const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), out).normalize();
    const camPos = hub.clone()
      .addScaledVector(out, 12)   // back off radially
      .addScaledVector(side, -6)  // shift sideways -> core swings to the upper-left
      .addScaledVector(new THREE.Vector3(0, 1, 0), 5.5); // raise -> core drops toward the top
    this._tweenTo(camPos, hub);
  }

  _activateStep(step) {
    this.el.steps.forEach((s) => s.classList.toggle("active", s === step));
  }

  // Emphasise the selected topic in the 3D scene and dim the rest.
  _highlight(focus) {
    this.layers.setHighlight(focus);
    this.globe.setHighlight(focus);
  }

  // Switch between the abstract Hypergraph view and the globe (geography) view.
  setMode(mode) {
    this.mode = mode;
    this._closeInspector();
    this._activateStep(null);
    this._highlight(null);
    this.el.tooltip.classList.add("hidden");
    const geo = mode === "geo";
    const ledger = mode === "ledger";
    // The left column (filter + learn/leaderboard) is hidden in the ledger view,
    // which shows its own placeholder panel instead.
    this.el.leftcol?.classList.toggle("hidden", ledger);
    this.el.ledger?.classList.toggle("hidden", !ledger);
    this.el.learn.classList.toggle("hidden", geo);
    this.el.leaderboard.classList.toggle("hidden", !geo); // #netfilter stays in both
    if (this.el.mfSub) this.el.mfSub.textContent = geo ? "Click to isolate a metagraph" : "Click to focus a metagraph";

    if (ledger) {
      // Placeholder: drop any focus/filter and show the calm overview Hypergraph
      // behind the explainer; the live snapshot ribbon stays along the bottom.
      this.layers.focusId = null;
      this.globe.setFilter("all");
      this.globe.focusDensest(false);
      this.controls.autoRotate = true;
      this.focus("overview");
      document.getElementById("hint").textContent = "Snapshot DAG · ledger — work in progress · live ribbon below";
      return;
    }

    if (geo) {
      this.controls.autoRotate = false;
      document.getElementById("hint").textContent = "Drag to spin the globe · click a node to inspect · filter by metagraph at left";
    } else {
      document.getElementById("hint").textContent = "Drag to orbit · Scroll to zoom · filter by metagraph at left";
    }
    this._applyFilter(); // re-assert the active filter in this view's way
  }

  // Apply the active filter the way the current view wants it: geography isolates
  // & dims the selection (and refreshes the leaderboard); the Hypergraph keeps
  // every node lit and instead flies the camera to the selected network.
  _applyFilter() {
    if (this.mode === "geo") {
      this.country = null;            // switching network clears the country drill-down
      this.lbExpanded = false;        // and collapses the country tail
      this.globe.setFilter(this.filter); // (also clears globe.countryFilter)
      this.refreshLeaderboard();
      this._applyGeoFocus();
    } else {
      this.country = null;
      this.globe.setFilter("all"); // no dimming in the Hypergraph
      this.globe.focusDensest(false); // idle spin (globe sits behind the morph here)
      this._focusFilter(this.filter);
    }
  }

  // Aim/zoom the globe for the current network + country selection: swing the
  // densest part of the active set to the front (north stays up) and zoom IN
  // PROPORTION to its concentration. A spread-out "All" stays wide so it doesn't
  // look like the densest cluster is the only place there are nodes.
  _applyGeoFocus() {
    const narrowed = this.filter !== "all" || this.country != null;
    const R = this.globe.focusDensest(narrowed);
    if (narrowed && R != null) this._focusGeo(R);
    else this.focus("geo");
  }

  // Drill the geo view into one country within the current network (toggle).
  selectCountry(cc) {
    if (!cc) return;
    this.country = this.country === cc ? null : cc;
    this.globe.setCountry(this.country);
    this.refreshLeaderboard(); // update the highlighted row
    this._applyGeoFocus();     // fly to the country (or back to the network)
  }

  // Recompute the country leaderboard + distribution score for the active filter.
  // Cheap; safe to call on every filter change or data refresh.
  refreshLeaderboard() {
    this.setLeaderboard(this.globe.countryStats(this.filter));
    this._renderScore();
  }

  // The "distribution score" for the selected network: how globally spread its
  // nodes are, 0–100, relative to the most distributed network (typically L0).
  _renderScore() {
    const el = this.el.lbScore;
    if (!el) return;
    const { scores, refId } = this.globe.distributionScores();
    const score = scores[this.filter];
    if (score == null) { el.innerHTML = ""; return; }
    const note = this.filter === "all"
      ? "Full validator network footprint"
      : this.filter === refId
        ? "★ Most globally distributed network"
        : `Global reach vs ${this._filterLabel(refId)} — currently the most distributed`;
    const info = `<span class="lb-info" tabindex="0">i<span class="lb-info-pop">Measures how widely a network's nodes are spread across countries — both how many countries they sit in and how evenly (Shannon entropy of the per-country share). It's scored relative to whichever network is currently the most globally distributed; any network can hold that top spot — right now it's <b>${this._filterLabel(refId)}</b>, which sets the 100.</span></span>`;
    // Coloured like the "Nodes by country" section (not the metagraph), so the
    // score reads as part of the geographic stats rather than a per-network badge.
    el.innerHTML = `
      <div class="lb-score-top">
        <span class="lb-score-title">Distribution score${info}</span>
        <span class="lb-score-val">${score}<span class="lb-score-max">/100</span></span>
      </div>
      <div class="lb-score-bar"><span style="width:${score}%"></span></div>
      <div class="lb-score-note">${note}</div>`;
  }

  _filterLabel(id) {
    if (id === "all") return "All validators";
    if (id === "l0") return "Global L0";
    if (id === "l1") return "DAG L1";
    const m = this.globe.metaList.find((x) => x.id === id);
    return m ? (m.name || m.symbol || id) : id;
  }


  // Render the per-country leaderboard for the current selection.
  setLeaderboard(list) {
    if (!list.length) {
      this.el.lbList.innerHTML = "";
      this.el.lbTotal.textContent = "0 countries";
      return;
    }
    const max = list[0].count;
    const TOP = 9;
    const top = list.slice(0, TOP);
    const others = list.slice(TOP);
    // Each named country is a click-to-drill bar row.
    const rowEl = (c) => `
      <div class="lb-row lb-row--btn${c.cc === this.country ? " active" : ""}" data-cc="${c.cc}">
        <span class="lb-flag">${ccToFlag(c.cc)}</span>
        <span class="lb-name" title="${c.country}">${c.country}</span>
        <span class="lb-bar"><span style="width:${Math.round((c.count / max) * 100)}%"></span></span>
        <span class="lb-count">${c.count}</span>
      </div>`;
    let html = top.map(rowEl).join("");

    // The long tail is collapsed under one toggle row; expanding it shows every
    // remaining country as a compact, wrap-able flag chip — reachable without a
    // scrollbar.
    if (others.length) {
      const restCount = others.reduce((s, c) => s + c.count, 0);
      html += `
        <div class="lb-row lb-row--btn lb-toggle" data-toggle="1">
          <span class="lb-flag">🌐</span>
          <span class="lb-name">${this.lbExpanded ? "Show fewer" : `${others.length} more ${others.length === 1 ? "country" : "countries"}`}</span>
          <span class="lb-bar">${this.lbExpanded ? "" : `<span style="width:${Math.round((restCount / max) * 100)}%"></span>`}</span>
          <span class="lb-count">${this.lbExpanded ? "▾" : "▸"}</span>
        </div>`;
      if (this.lbExpanded) {
        html += `<div class="lb-more">` + others.map((c) => `
          <button class="lb-chip${c.cc === this.country ? " active" : ""}" data-cc="${c.cc}" title="${c.country}">
            <span class="lb-chip-flag">${ccToFlag(c.cc)}</span><span class="lb-chip-n">${c.count}</span>
          </button>`).join("") + `</div>`;
      }
    }

    this.el.lbList.innerHTML = html;
    this.el.lbTotal.textContent = `${list.length} countries`;
    this.el.lbList.querySelectorAll("[data-cc]").forEach((el) => {
      el.onclick = () => this.selectCountry(el.dataset.cc);
    });
    this.el.lbList.querySelectorAll("[data-toggle]").forEach((el) => {
      el.onclick = () => { this.lbExpanded = !this.lbExpanded; this.refreshLeaderboard(); };
    });
  }

  // Build the "Filter network" chips for the geography view: All / Global L0 /
  // DAG L1, then one chip per metagraph (coloured to match its globe markers).
  setMetagraphList(list) {
    if (!this.el.mfChips) return;
    const hex = (c) => "#" + new THREE.Color(c).getHexString();
    const chip = (filter, color, label, count) =>
      `<button class="mf-chip${filter === this.filter ? " active" : ""}" data-filter="${filter}">
         <span class="mf-dot" style="background:${color}"></span>
         <span class="mf-label">${label}</span>
         ${count != null ? `<span class="mf-count">${count}</span>` : ""}
       </button>`;

    let html =
      chip("all", "linear-gradient(135deg,var(--core),var(--l1))", "All", null) +
      chip("l0", hex(COLORS.l0), "Global L0", null) +
      chip("l1", hex(COLORS.l1), "DAG L1", null);
    for (const m of list) {
      html += chip(m.id, hex(m.color), m.symbol || m.name, m.nodes.length);
    }
    // Config metagraphs with no locatable nodes are shown in the 3D Hypergraph (their
    // hub is config-driven) but can't be plotted/filtered on the globe. Surface them
    // as disabled chips so the two views stay consistent — greyed and non-clickable,
    // with a (0) node count matching the others — rather than dropping them silently.
    const shown = new Set(list.map((m) => m.id));
    for (const c of METAGRAPHS) {
      if (shown.has(c.id)) continue;
      html += `<button class="mf-chip mf-chip--off" disabled title="No live nodes found at last data refresh — shown in the Hypergraph but not locatable on the globe">
         <span class="mf-dot" style="background:${hex(c.color)}"></span>
         <span class="mf-label">${c.ticker || c.name}</span>
         <span class="mf-count">0</span>
       </button>`;
    }
    this.el.mfChips.innerHTML = html;
    this.el.mfChips.querySelectorAll(".mf-chip:not(.mf-chip--off)").forEach((btn) => {
      btn.onclick = () => this.selectFilter(btn.dataset.filter);
    });
  }

  selectFilter(filter) {
    this.filter = filter;
    this.el.mfChips?.querySelectorAll(".mf-chip").forEach((b) =>
      b.classList.toggle("active", b.dataset.filter === filter));
    this._applyFilter();
    // Tell the ribbon which metagraph (+colour) is selected; only metagraph filters
    // carry a colour — All / L0 / L1 clear the cue.
    const mg = this.layers.metas?.find((m) => m.cfg.id === filter);
    this.onFilter(filter, mg ? "#" + new THREE.Color(mg.cfg.color).getHexString() : null);
    // Auto-show the metagraph context pane + a live "following" snapshot card when a
    // metagraph is selected; clearing the filter hides the pane and stops following.
    if (mg) {
      this.showMetaPane(filter);
      this._followLatest();
    } else {
      this.hideMetaPane();
      if (this._followSnap) { this._followSnap = false; this._closeInspector(); }
    }
  }

  _startTour() {
    const order = ["overview", "l0", "l1", "metagraphs"];
    this.controls.autoRotate = false;
    let i = 0;
    const next = () => {
      if (i >= order.length) { this.controls.autoRotate = true; this.focus("overview"); this._activateStep(null); this._highlight(null); return; }
      const name = order[i];
      const step = this.el.steps.find((s) => s.dataset.focus === name);
      this.focus(name);
      this._activateStep(step);
      this._highlight(name);
      i++;
      this._tourTimer = setTimeout(next, 4200);
    };
    clearTimeout(this._tourTimer);
    next();
  }

  // ---------------------------------------------------------- live stats
  setStatus(live) {
    this.el.source.textContent = live ? "LIVE · mainnet" : "SIMULATED";
    this.el.source.className = "data-pill " + (live ? "live" : "sim");
  }

  setNodeCounts(l0, l1) {
    this.el.nodes.textContent = `${l0.length} / ${l1.length}`;
  }

  // $DAG market data (from CoinGecko). The price isn't shown on its own — it's the
  // conversion rate for Fees/hr (USD). Store it and re-render the fee stat.
  setPrice(p) {
    this._priceUsd = (p && typeof p.usd === "number") ? p.usd : null;
    this._renderFees();
  }

  // `activity` is NetworkData.getActivity() — header rates + per-snapshot trends.
  onGlobal(latest, activity) {
    this.layers._latest = latest;
    // "Public metagraphs" = the publicly listed metagraphs we track (filter footnote).
    this.el.metagraphs.textContent = this.layers.metas.length;
    if (activity) {
      const fmt = (v) => (v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString());
      this.el.rate.textContent = fmt(activity.snapsPerHour);
      if (this.el.anchors) this.el.anchors.textContent = fmt(activity.anchorsPerHour);
      if (this.el.blocks) this.el.blocks.textContent = fmt(activity.blocksPerHour);
      this._spark(this.el.sparkRate, activity.cadenceSeries, "#2af5ff");
      this._spark(this.el.sparkAnchors, activity.anchoredSeries, "#6ee7b0");
      this._spark(this.el.sparkBlocks, activity.blocksSeries, "#ffd166");
    }
    this.updateFees(activity);
    // Keep the snapshot card on the latest relevant snapshot while following.
    if (this._followSnap) this._followLatest();
  }

  // Store the latest activity and re-render the fee stat. Called from onGlobal and
  // (debounced) from the `anchor` event, since the anchor index fills in just after
  // a snapshot arrives.
  updateFees(activity) {
    if (activity) this._activity = activity;
    this._renderFees();
  }

  // Fees/hr in USD (DAG fees × live $DAG price), with the DAG amount as a muted
  // secondary. "≥" because only publicly listed metagraphs' fees are visible (a
  // lower bound). Falls back to showing DAG as primary until the price loads.
  _renderFees() {
    const a = this._activity;
    if (!a || !this.el.fees || a.feesPerHour == null) return;
    const dag = a.feesPerHour;
    const dagTxt = `≥${dag >= 1 ? dag.toFixed(2) : dag.toFixed(3)} DAG`;
    if (this._priceUsd != null) {
      const usd = dag * this._priceUsd;
      const usdTxt = usd >= 1 ? usd.toFixed(2) : usd >= 0.01 ? usd.toFixed(3) : usd.toFixed(4);
      this.el.fees.textContent = `≥$${usdTxt}`;
      if (this.el.feesDag) this.el.feesDag.textContent = dagTxt;
    } else {
      this.el.fees.textContent = dagTxt;
      if (this.el.feesDag) this.el.feesDag.textContent = "";
    }
    this._spark(this.el.sparkFees, a.feesSeries, "#f5c451");
    if (this.el.feesWrap) this.el.feesWrap.title =
      "DAG settlement fees per hour (converted to USD at the live $DAG price) — summed from publicly listed metagraphs, so it's a lower bound (others anchor too).";
  }

  // Update a sparkline <svg>, easing from the currently-shown series to the new one
  // (~500ms) so the line morphs smoothly each snapshot instead of snapping. First
  // render (or a length change) draws instantly.
  _spark(el, target, color) {
    if (!el) return;
    if (!target || target.length < 2) { el.replaceChildren(); el._poly = el._area = null; el._cur = null; return; }
    cancelAnimationFrame(el._raf);
    const from = (el._cur && el._cur.length === target.length) ? el._cur : null;
    if (!from) { el._cur = target.slice(); this._drawSpark(el, el._cur, color); return; }
    const startT = performance.now(), dur = 500;
    const step = (now) => {
      const t = Math.min(1, (now - startT) / dur);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
      const cur = target.map((v, i) => from[i] + (v - from[i]) * e);
      this._drawSpark(el, cur, color);
      if (t < 1) el._raf = requestAnimationFrame(step);
      else el._cur = target.slice();
    };
    el._raf = requestAnimationFrame(step);
  }

  // Create the sparkline's <polygon>/<polyline> once; later frames only mutate
  // their `points` (no innerHTML reparse).
  _ensureSpark(el) {
    if (el._poly) return;
    const NS = "http://www.w3.org/2000/svg";
    el.setAttribute("viewBox", "0 0 46 15");
    el.setAttribute("preserveAspectRatio", "none");
    const area = document.createElementNS(NS, "polygon");
    area.setAttribute("opacity", "0.13");
    const poly = document.createElementNS(NS, "polyline");
    poly.setAttribute("fill", "none");
    poly.setAttribute("stroke-width", "1.2");
    poly.setAttribute("stroke-linejoin", "round");
    poly.setAttribute("stroke-linecap", "round");
    el.replaceChildren(area, poly);
    el._area = area; el._poly = poly; el._color = null;
  }

  // Update the area+line sparkline from a series of values.
  _drawSpark(el, values, color) {
    this._ensureSpark(el);
    const w = 46, h = 15;
    const max = Math.max(...values), min = Math.min(...values);
    const range = max - min || 1;
    let line = "";
    for (let i = 0; i < values.length; i++) {
      const x = (i / (values.length - 1)) * w;
      const y = h - 1 - ((values[i] - min) / range) * (h - 2);
      line += (i ? " " : "") + x.toFixed(1) + "," + y.toFixed(1);
    }
    el._area.setAttribute("points", `0,${h} ${line} ${w},${h}`);
    el._poly.setAttribute("points", line);
    if (el._color !== color) {
      el._area.setAttribute("fill", color);
      el._poly.setAttribute("stroke", color);
      el._color = color;
    }
  }

  update(dt) {
    // tooltip follows nothing on its own; camera tween here
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const e = tw.t < 0.5 ? 2 * tw.t * tw.t : 1 - Math.pow(-2 * tw.t + 2, 2) / 2; // easeInOutQuad
      this.camera.position.lerpVectors(tw.fromPos, tw.toPos, e);
      this.controls.target.lerpVectors(tw.fromTgt, tw.toTgt, e);
      if (tw.t >= 1) this.tween = null;
    }
  }
}

function row(label, value) {
  return `<div class="insp-row"><span>${label}</span><span>${value}</span></div>`;
}

// A "Website" row linking out to the metagraph's site (shown only when one is
// known). The visible label is the bare domain.
function siteRow(url) {
  if (!url) return "";
  const label = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return row("Website", `<a class="insp-link" href="${url}" target="_blank" rel="noopener">${label}</a>`);
}

const _ROLE_FR = { l0: "L0", cl1: "currency-L1", dl1: "data-L1" };
const _ROLE_ORDER = ["l0", "cl1", "dl1"];
const _rolesOf = (n) => (n.roles && n.roles.length ? n.roles : [n.layer]);
const _joinList = (xs) => xs.length <= 1 ? (xs[0] || "") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1];

// One concise line for the metagraph: real currency token only if it runs a
// currency-L1 cluster (`symbol` is always set, so don't trust it); then the node
// makeup — hybrid (multi-role) and/or dedicated nodes, named by the layer each
// dedicated group serves.
function metaNetworkText(m) {
  const nodes = m.nodes || [];
  const hasCurrency = nodes.some((n) => _rolesOf(n).includes("cl1"));
  const hybrid = nodes.filter((n) => _rolesOf(n).length > 1).length;
  const dedByRole = {};
  for (const n of nodes) { const r = _rolesOf(n); if (r.length === 1) dedByRole[r[0]] = (dedByRole[r[0]] || 0) + 1; }

  const lead = hasCurrency
    ? `<b>${m.name}</b> is a sovereign metagraph with its own <b>${m.symbol}</b> currency`
    : `<b>${m.name}</b> is a sovereign <b>data metagraph</b> (no token)`;

  const parts = [];
  if (hybrid) parts.push(`${hybrid} hybrid`);
  for (const r of _ROLE_ORDER) if (dedByRole[r]) parts.push(`${dedByRole[r]} dedicated ${_ROLE_FR[r]}`);
  const totalNamed = hybrid + Object.values(dedByRole).reduce((a, b) => a + b, 0);
  const comp = parts.length ? ` Built from ${_joinList(parts)} node${totalNamed === 1 ? "" : "s"}.` : "";

  return `${lead}, anchored into the Global L0.${comp}`;
}
function nodeRows(node, showIp = true) {
  if (!node) return "";
  const ready = node.state === "Ready";
  const color = ready ? "#36e29a" : "#ffd166";
  return row("State", `<span style="color:${color}">● ${node.state}</span>`) +
    (node.ip && showIp ? row("IP", node.ip) : "") +
    (node.id ? rowHash("Node ID", node.id) : "");
}
function geoRows(g, showCoords = true) {
  if (!g) return "";
  return row("Location", `${g.city ? g.city + ", " : ""}${g.country}`) +
    (showCoords ? row("Coordinates", `${g.lat.toFixed(2)}, ${g.lon.toFixed(2)}`) : "");
}
function ccToFlag(cc) {
  if (!cc || cc.length !== 2) return "🏳️";
  return String.fromCodePoint(...[...cc.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}
function rowHash(label, hash) {
  return `<div class="insp-row"><span>${label}</span><span class="insp-hash">${shortHash(hash)}</span></div>`;
}
