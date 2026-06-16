// The live Global L0 snapshot stream — a 2D DAG ribbon docked at the bottom of
// the page. Snapshots flow in left -> right, linked to their parent like the
// DAG they form. Clicking a chip opens the inspector; each new arrival also
// pulses the 3D core (via the onArrive callback).

import { shortHash } from "./api.js";

const MAX = 16;

export class SnapshotStream {
  constructor({ onSelect, onArrive }) {
    this.onSelect = onSelect || (() => {});
    this.onArrive = onArrive || (() => {});
    this.items = []; // { el, data }
    this.track = document.getElementById("stream-track");
    this.empty = document.getElementById("stream-empty");
  }

  setSnapshots(list) {
    this.track.innerHTML = "";
    this.items = [];
    list.forEach((d) => this._add(d, false));
    if (list.length) this.empty?.classList.add("hidden");
  }

  push(data) {
    this._add(data, true);
    while (this.items.length > MAX) {
      const old = this.items.shift();
      old.el.classList.add("leaving");
      setTimeout(() => old.el.remove(), 400);
    }
    this.empty?.classList.add("hidden");
    this.onArrive(data);
  }

  _add(data, animate) {
    const blocks = Array.isArray(data.blocks) ? data.blocks.length : 0;
    const item = document.createElement("div");
    item.className = "stream-item" + (animate ? " entering" : "");

    const connector = document.createElement("div");
    connector.className = "connector";

    // Plain-language activity: most global snapshots are empty heartbeats; only
    // the ones carrying blocks are "real" activity (and only those move `height`).
    const activity = blocks === 0 ? "empty" : `${blocks} block${blocks === 1 ? "" : "s"}`;
    const chip = document.createElement("button");
    chip.className = "chip" + (blocks === 0 ? " empty" : "");
    chip.title = `Snapshot #${data.ordinal} · ${shortHash(data.hash)}`;
    chip.innerHTML = `
      <span class="chip-ord">#${data.ordinal.toLocaleString()}</span>
      <span class="chip-meta">${activity}</span>
      <span class="chip-bar"><span style="width:${Math.min(100, blocks * 16 + 8)}%"></span></span>`;
    chip.onclick = () => {
      this.track.querySelectorAll(".chip.active").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      this.onSelect(data);
    };

    item.appendChild(connector);
    item.appendChild(chip);
    this.track.appendChild(item);
    this.items.push({ el: item, data });

    if (animate) {
      // force reflow so the transition runs
      void item.offsetWidth;
      item.classList.remove("entering");
    }
    // keep newest in view
    this.track.scrollLeft = this.track.scrollWidth;
  }
}
