// The live Global L0 snapshot stream — a 2D DAG ribbon docked at the bottom of
// the page. Snapshots flow in left -> right, linked to their parent like the
// DAG they form. Clicking a chip opens the inspector; each new arrival also
// pulses the 3D core (via the onArrive callback).

import { shortHash } from "./api.js";

const MAX = 16;

// Format a datum fee (1 DAG = 1e8 datum) as a compact DAG amount, e.g. "0.0520".
function fmtDag(datum) { return (datum / 1e8).toFixed(4); }

export class SnapshotStream {
  // `getAnchor(timestamp)` returns { fee (datum), count, metaIds } for the metagraph
  // snapshots anchored into a tick (or null until they've been polled). The fee is a
  // ~93% lower bound (some anchors come from unlisted metagraphs), so it's shown with
  // a "~" and fills in after a chip arrives — see refreshFees().
  constructor({ onSelect, onArrive, getAnchor }) {
    this.onSelect = onSelect || (() => {});
    this.onArrive = onArrive || (() => {});
    this.getAnchor = getAnchor || (() => null);
    this.items = []; // { el, data, feeEl, chip }
    this.track = document.getElementById("stream-track");
    this.empty = document.getElementById("stream-empty");
    this.filterId = null;    // active metagraph filter id (only metagraph filters)
    this.filterColor = null; // its hex colour, for the per-chip cue
    this.selectedOrdinal = null; // ordinal of the chip mirrored by the inspector
  }

  // Mark the chip for `data` as the selected one (or clear with null). Keeps the
  // ribbon's highlight in sync with the inspector — driven by clicks, "follow
  // latest", and the metagraph filter picking the latest anchored snapshot. The
  // ordinal is remembered so a chip arriving/seeding later re-applies the highlight.
  select(data) {
    this.selectedOrdinal = data ? data.ordinal : null;
    for (const it of this.items) {
      it.chip?.classList.toggle("active", this.selectedOrdinal != null && it.data.ordinal === this.selectedOrdinal);
    }
  }

  // Called when the shared network filter changes. A metagraph filter (id + colour)
  // makes each chip show whether THAT metagraph anchored into its snapshot: anchored
  // chips get the metagraph's colour tag, the rest dim back. "all"/L0/L1 clear it.
  setFilter(filterId, color) {
    this.filterId = (filterId && color) ? filterId : null;
    this.filterColor = color || null;
    for (const it of this.items) this._decorateChip(it);
  }

  // Apply the active metagraph filter's cue to one chip (or clear it).
  _decorateChip(it) {
    const chip = it.chip;
    if (!chip) return;
    chip.classList.remove("mg-anchored", "mg-dim");
    chip.style.removeProperty("--mg");
    if (!this.filterId) return;
    const a = this.getAnchor(it.data.timestamp);
    if (a && a.metaIds && a.metaIds.has(this.filterId)) {
      chip.style.setProperty("--mg", this.filterColor);
      chip.classList.add("mg-anchored");
    } else {
      chip.classList.add("mg-dim");
    }
  }

  // Paint the derived DAG fee onto a chip's fee line (or "settling…" until known).
  _paintFee(feeEl, data) {
    const a = this.getAnchor(data.timestamp);
    const anchored = typeof data.metagraphSnapshotCount === "number" ? data.metagraphSnapshotCount : null;
    if (a && a.fee > 0) {
      // We can attribute every anchor only when our tracked count reaches the
      // authoritative count; otherwise the fee is a floor (unlisted metagraphs).
      const full = anchored != null && a.count >= anchored;
      feeEl.textContent = `${full ? "" : "≥"}${fmtDag(a.fee)} DAG`;
      feeEl.classList.remove("settling");
      feeEl.title = full
        ? `Settlement fees: ${fmtDag(a.fee)} DAG — all ${anchored} anchored snapshots identified.`
        : `Settlement fees ≥ ${fmtDag(a.fee)} DAG — summed from the ${a.count}${anchored != null ? ` of ${anchored}` : ""} anchors we can identify. Unlisted metagraphs also anchor here, so the true total is a bit higher.`;
    } else {
      feeEl.textContent = "settling…";
      feeEl.classList.add("settling");
      feeEl.title = "Waiting for this tick's metagraph snapshots to be polled…";
    }
  }

  // Re-query fees for every visible chip — called when new metagraph snapshots are
  // recorded (the api "anchor" event), so chips that arrived before their metagraph
  // snapshots were polled fill in their fee.
  refreshFees() {
    for (const it of this.items) {
      if (it.feeEl) this._paintFee(it.feeEl, it.data);
      this._decorateChip(it); // anchor metaIds may have filled in -> update the cue
    }
  }

  setSnapshots(list) {
    this.track.innerHTML = "";
    this.items = [];
    // Seed only the newest MAX so the initial load matches the steady-state cap
    // (the source buffer keeps more than the ribbon shows).
    list.slice(-MAX).forEach((d) => this._add(d, false));
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
    // The real work of a Global L0 snapshot is settling metagraph snapshots, not
    // carrying blocks: `metagraphSnapshotCount` is how many metagraph snapshots
    // this one anchored. It's non-zero on almost every snapshot, while blocks are
    // rare — so the ribbon reads activity from the anchor count, and treats the
    // (uncommon) block-carrying snapshots as a highlight rather than the baseline.
    const anchored = typeof data.metagraphSnapshotCount === "number" ? data.metagraphSnapshotCount : 0;
    const item = document.createElement("div");
    item.className = "stream-item" + (animate ? " entering" : "");

    const connector = document.createElement("div");
    connector.className = "connector";

    const activity = anchored > 0 ? `${anchored} anchored` : "idle";
    const blockTag = blocks > 0 ? `<span class="chip-blk">+${blocks} blk</span>` : "";
    const chip = document.createElement("button");
    // .quiet only when nothing was anchored (rare). Block-carrying snapshots are NOT
    // highlighted — block presence isn't the relevant signal (anchoring is); the
    // block count stays as a small neutral tag only.
    chip.className = "chip" + (anchored === 0 ? " quiet" : "")
      + (this.selectedOrdinal != null && data.ordinal === this.selectedOrdinal ? " active" : "");
    chip.title = `Snapshot #${data.ordinal.toLocaleString()} · anchored ${anchored} metagraph snapshot${anchored === 1 ? "" : "s"} · ${blocks} block${blocks === 1 ? "" : "s"} · ${shortHash(data.hash)}`;
    chip.innerHTML = `
      <span class="chip-ord">#${data.ordinal.toLocaleString()}</span>
      <span class="chip-meta">${activity}${blockTag}</span>
      <span class="chip-bar"><span style="width:${Math.min(100, anchored * 5 + 8)}%"></span></span>
      <span class="chip-fee"></span>`;
    // The inspector is the source of truth: onSelect -> ui.showSnapshot -> select(),
    // which highlights this chip (and clears the rest). Pins it (stops following).
    chip.onclick = () => this.onSelect(data);

    const feeEl = chip.querySelector(".chip-fee");
    this._paintFee(feeEl, data);

    item.appendChild(connector);
    item.appendChild(chip);
    this.track.appendChild(item);
    const it = { el: item, data, feeEl, chip };
    this._decorateChip(it);
    this.items.push(it);

    if (animate) {
      // force reflow so the transition runs
      void item.offsetWidth;
      item.classList.remove("entering");
    }
    // keep newest in view
    this.track.scrollLeft = this.track.scrollWidth;
  }
}
