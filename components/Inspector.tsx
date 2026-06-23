"use client";

import { useStore } from "@/src/store/store";
import { metagraphById } from "@/src/data/network";
import InspectorCard from "@/components/InspectorCard";
import type { PickDescriptor } from "@/src/data/types";

// Right column — the **facts** rail: two fixed-role slots, read-only details on demand
// (exploration tools like the filter / leaderboard / node browser live in the LEFT rail).
//   • Context (top)  — the subject you've focused: a metagraph/cluster dossier.
//   • Detail (bottom)— the view's signature card: hyper → metagraph live activity,
//                      geo → the clicked node, ledger → the snapshot.
// The global snapshot card is scoped to the ledger view (its home); hyper/geo never
// inject one. A quiet placeholder keeps the zone present (symmetric with the left rail).
export default function Inspector() {
  const mode = useStore((s) => s.mode);
  const inspect = useStore((s) => s.inspect);
  const filter = useStore((s) => s.filter);
  const setInspect = useStore((s) => s.setInspect);
  const setFilter = useStore((s) => s.setFilter);

  const mgCfg = metagraphById(filter);

  // Context dossier for the active filter (the selected metagraph / cluster, any view).
  let context: PickDescriptor | null = null;
  if (mgCfg) context = { kind: "meta", title: mgCfg.name, cfg: mgCfg };
  else if (filter === "l0") context = { kind: "cluster", cluster: "l0", title: "Global L0" };
  else if (filter === "l1") context = { kind: "cluster", cluster: "l1", title: "DAG L1" };

  // Detail slot — each view's always-present signature card:
  //   ledger → the snapshot, geo → the live footprint card (which embeds the clicked node
  //   itself), hyper → the selected metagraph's live activity.
  // Individual node cards belong to geo (where a node has a real place on the globe); the
  // Hypergraph is about metagraphs, so a node click there never opens a one-off node card.
  let detail: PickDescriptor | null = null;
  if (mode === "ledger") {
    detail = inspect?.kind === "snapshot" ? inspect : null;
  } else if (mode === "geo") {
    // Always the live footprint card; it reads the selected node from the store, so a
    // node pick augments it rather than replacing it.
    detail = { kind: "geoLive" };
  } else if (mode === "hyper" && mgCfg) {
    // No title — the Context dossier directly above already names the metagraph; the
    // "Live activity" eyebrow is enough to label this card.
    detail = { kind: "metaLive", cfg: mgCfg };
  }

  const contextEyebrow = mgCfg ? "Selected metagraph" : "Selected cluster";
  // Detail is now always a view signature card (snapshot / metaLive / geoLive) or empty.
  const detailEyebrow = !detail
    ? ""
    : detail.kind === "snapshot"
      ? "Live snapshot"
      : detail.kind === "metaLive"
        ? "Live activity"
        : detail.kind === "geoLive"
          ? "Live footprint"
          : "Detail";

  const empty = !context && !detail;

  return (
    <div id="rightcol">
      {context && (
        <aside id="metapane" className="panel">
          <button id="metapane-close" title="Clear selection" onClick={() => setFilter("all")}>
            ×
          </button>
          <div id="metapane-content">
            <InspectorCard p={context!} eyebrow={contextEyebrow} />
          </div>
        </aside>
      )}

      {detail && (
        <aside id="inspector" className="panel">
          {/* The always-present signature cards (hyper "live activity", geo "live
              footprint") aren't independently closable; an explicit pick / snapshot is. */}
          {detail.kind !== "metaLive" && detail.kind !== "geoLive" && (
            <button id="inspector-close" title="Close" onClick={() => setInspect(null)}>
              ×
            </button>
          )}
          <div id="inspector-content">
            <InspectorCard p={detail} eyebrow={detailEyebrow} />
          </div>
        </aside>
      )}

      {empty && (
        <aside id="rc-empty" className="panel">
          <span className="insp-eyebrow">Details</span>
          <p className="rc-empty-text">
            {mode === "ledger"
              ? "Click a snapshot in the ribbon to inspect it."
              : mode === "geo"
                ? "Pick a node from the browser, or click one on the globe, to inspect it."
                : "Click a metagraph or node to inspect it."}
          </p>
        </aside>
      )}
    </div>
  );
}
