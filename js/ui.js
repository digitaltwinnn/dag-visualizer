// UI layer: raycast-based hover tooltips & click inspector, the "Learn" panel
// with camera focus, a guided tour, and live stat readouts.

import * as THREE from "three";
import { shortHash } from "./api.js";
import { COLORS } from "./config.js";

const FOCI = {
  overview:   { pos: new THREE.Vector3(0, 15, 60),  target: new THREE.Vector3(0, 2, 0) },
  l0:         { pos: new THREE.Vector3(0, 6, 20),   target: new THREE.Vector3(0, 1, 0) },
  l1:         { pos: new THREE.Vector3(14, 10, 26), target: new THREE.Vector3(0, 0, 0) },
  metagraphs: { pos: new THREE.Vector3(0, 30, 70),  target: new THREE.Vector3(0, 0, 0) },
  geo:        { pos: new THREE.Vector3(0, 11, 36),  target: new THREE.Vector3(0, 2, 0) },
};

export class UI {
  constructor({ camera, renderer, controls, layers, globe }) {
    this.camera = camera;
    this.renderer = renderer;
    this.controls = controls;
    this.layers = layers;
    this.globe = globe;
    this.mode = "hyper";

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.hovered = null;
    this.tween = null; // { fromPos, toPos, fromTgt, toTgt, t, dur }

    this.el = {
      tooltip: document.getElementById("tooltip"),
      inspector: document.getElementById("inspector"),
      inspContent: document.getElementById("inspector-content"),
      source: document.getElementById("stat-source"),
      ordinal: document.getElementById("stat-ordinal"),
      height: document.getElementById("stat-height"),
      metagraphs: document.getElementById("stat-metagraphs"),
      nodes: document.getElementById("stat-nodes"),
      rate: document.getElementById("stat-rate"),
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
    this._rate = { times: [], value: "—" };
    this._wire();
  }

  _wire() {
    const dom = this.renderer.domElement;
    dom.addEventListener("pointermove", (e) => this._onMove(e));
    dom.addEventListener("click", (e) => this._onClick(e));

    document.getElementById("inspector-close").onclick = () => this._closeInspector();

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
    if (p) {
      this.controls.autoRotate = false;
      this._showInspector(p);
    }
  }

  // ---------------------------------------------------------- inspector
  _showInspector(p) {
    const c = this.el.inspContent;
    const tagColor = { core: COLORS.core, l0: COLORS.l0, l1: COLORS.l1, snapshot: COLORS.core, meta: p.cfg?.color, metanode: p.meta?.color }[p.kind];
    const hex = "#" + new THREE.Color(tagColor || COLORS.core).getHexString();
    let body = "";

    if (p.kind === "core") {
      const d = this.layers._latest;
      body = `
        <p>The <b>Global L0</b> is Constellation's base layer — the shared source of truth. L0 validators continuously bundle network activity into <b>global snapshots</b>, each cryptographically referencing the last to form the DAG.</p>
        ${row("Latest ordinal", d ? d.ordinal : "—")}
        ${row("Snapshot height", d ? d.height : "—")}
        ${row("Active metagraphs", d ? d.metagraphSnapshotCount ?? "—" : "—")}
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
      const blocks = Array.isArray(d.blocks) ? d.blocks.length : 0;
      const when = d.timestamp ? new Date(d.timestamp).toLocaleTimeString() : "—";
      body = `
        ${row("Ordinal", d.ordinal)}
        ${row("Height", d.height)}
        ${d.subHeight != null ? row("Sub-height", d.subHeight) : ""}
        ${row("Blocks", blocks)}
        ${row("Timestamp", when)}
        ${rowHash("Snapshot hash", d.hash)}
        ${rowHash("Parent hash", d.lastSnapshotHash)}
        <p style="margin-top:14px"><b>Ordinal</b> counts snapshots — it rises every few seconds, even when one is empty. <b>Height</b> is the depth of the block DAG: it only climbs when real activity deepens it, so it can sit still while the ordinal keeps rising (<b>sub-height</b> orders snapshots that share a height).</p>
        <p style="margin-top:10px">Each snapshot points at its <b>parent</b> via the previous hash — that link is the edge of the DAG. Constellation is a graph, not a chain: blocks can form in parallel, so a snapshot can carry blocks without raising the height.</p>`;
    } else if (p.kind === "metanode") {
      const m = p.meta;
      // A metagraph node often serves several roles at once (consensus L0, plus
      // currency-L1 and/or data-L1) — show every role this machine actually runs.
      const ROLE = { l0: "L0 (consensus)", cl1: "Currency L1", dl1: "Data L1" };
      const roles = (p.node.roles && p.node.roles.length ? p.node.roles : [p.node.layer])
        .map((r) => ROLE[r] || r).join(" · ");
      // A token only exists if the metagraph actually runs a currency-L1 cluster;
      // the `symbol` is always set (it's just an identifier), so don't trust it.
      const hasCurrency = (m.nodes || []).some((n) => (n.roles || [n.layer]).includes("cl1"));
      body = `
        ${m.description ? `<p>${m.description}</p>` : ""}
        ${row("Token", hasCurrency ? (m.symbol || "—") : "none (data metagraph)")}
        ${row("Runs", roles)}
        ${siteRow(m.siteUrl)}
        ${nodeRows(p.node)}${geoRows(p.geo)}
        <p style="margin-top:14px">${metaNetworkText(m)}</p>`;
    } else if (p.kind === "meta") {
      const cfg = p.cfg;
      const st = p.state;
      const liveTag = st?.real ? `<span style="color:#36e29a">● live data</span>` : `<span style="color:#ffd166">● simulated cadence</span>`;
      const when = st?.ts ? new Date(st.ts).toLocaleTimeString() : "—";

      // Data-driven facts from the live-baked metagraph (nodes, roles, locations).
      const mg = this.globe.metaList?.find((x) => x.id === cfg.id) || null;
      const nodes = (mg && mg.nodes) || [];
      let facts = row("Ticker", cfg.ticker);
      if (nodes.length) {
        const hasCurrency = nodes.some((n) => _rolesOf(n).includes("cl1"));
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
          row("Token", hasCurrency ? (mg.symbol || cfg.ticker) : "none (data metagraph)") +
          row("Layers", present.map((r) => _ROLE_FR[r]).join(", ")) +
          row("Nodes", nodes.length) +
          row("Make-up", _joinList(parts)) +
          (countries ? row("Countries", countries) : "");
      }

      // Reuse the live, richer metagraph description (same source as the node
      // inspector); fall back to the hand-written config blurb only if absent.
      const blurb = (mg && mg.description) || cfg.blurb;
      body = `
        <p>${blurb}</p>
        ${facts}
        ${siteRow(mg && mg.siteUrl)}
        ${row("Latest snapshot", st ? st.ordinal : "—")}
        ${row("Updated", when)}
        ${st?.hash ? rowHash("Snapshot hash", st.hash) : ""}
        ${row("Data source", liveTag)}
        <p style="margin-top:14px">An independent network anchored into the Global L0 — it inherits the Hypergraph's security while staying sovereign.</p>`;
    }

    c.innerHTML = `
      <span class="insp-tag" style="background:${hex}22;color:${hex};border:1px solid ${hex}55">${p.kind === "meta" ? "Metagraph" : p.kind === "metanode" ? "Metagraph node" : p.kind === "snapshot" ? "DAG snapshot" : p.kind.toUpperCase()}</span>
      <h3>${p.title}</h3>
      <p class="insp-sub">${p.sub}</p>
      ${body}`;
    this.el.inspector.classList.remove("hidden");
  }

  // Opens the inspector for a snapshot picked from the bottom stream.
  showSnapshot(data) {
    const blocks = Array.isArray(data.blocks) ? data.blocks.length : 0;
    this._showInspector({
      kind: "snapshot",
      title: `Global snapshot #${data.ordinal}`,
      sub: `${blocks} block${blocks === 1 ? "" : "s"} · height ${data.height}`,
      data,
    });
  }

  _closeInspector() { this.el.inspector.classList.add("hidden"); }

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
    this.el.mfChips.innerHTML = html;
    this.el.mfChips.querySelectorAll(".mf-chip").forEach((btn) => {
      btn.onclick = () => this.selectFilter(btn.dataset.filter);
    });
  }

  selectFilter(filter) {
    this.filter = filter;
    this.el.mfChips?.querySelectorAll(".mf-chip").forEach((b) =>
      b.classList.toggle("active", b.dataset.filter === filter));
    this._applyFilter();
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
    this.el.source.className = "stat-value " + (live ? "live" : "sim");
  }

  setNodeCounts(l0, l1) {
    this.el.nodes.textContent = `${l0.length} / ${l1.length}`;
  }

  onGlobal(latest) {
    this.layers._latest = latest;
    this.el.ordinal.textContent = latest.ordinal.toLocaleString();
    this.el.height.textContent = latest.height.toLocaleString();
    if (typeof latest.metagraphSnapshotCount === "number") {
      this.el.metagraphs.textContent = this.layers.metas.length;
    }
    // snapshots/min from arrival times
    const now = performance.now();
    this._rate.times.push(now);
    this._rate.times = this._rate.times.filter((x) => now - x < 60000);
    if (this._rate.times.length >= 2) {
      const span = (now - this._rate.times[0]) / 1000;
      const perMin = (this._rate.times.length - 1) / span * 60;
      this.el.rate.textContent = perMin.toFixed(1);
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
function nodeRows(node) {
  if (!node) return "";
  const ready = node.state === "Ready";
  const color = ready ? "#36e29a" : "#ffd166";
  return row("State", `<span style="color:${color}">● ${node.state}</span>`) +
    (node.ip ? row("IP", node.ip) : "") +
    (node.id ? rowHash("Node ID", node.id) : "");
}
function geoRows(g) {
  if (!g) return "";
  return row("Location", `${g.city ? g.city + ", " : ""}${g.country}`) +
    row("Coordinates", `${g.lat.toFixed(2)}, ${g.lon.toFixed(2)}`);
}
function ccToFlag(cc) {
  if (!cc || cc.length !== 2) return "🏳️";
  return String.fromCodePoint(...[...cc.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}
function rowHash(label, hash) {
  return `<div class="insp-row"><span>${label}</span><span class="insp-hash">${shortHash(hash)}</span></div>`;
}
