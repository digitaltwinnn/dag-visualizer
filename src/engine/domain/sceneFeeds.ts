import type { FeedId } from "@/src/data/api";
import type { ViewPolicy } from "./viewPolicy";

// WHICH FEEDS A 3D VIEW DRAWS (2026-10-25, the pulse strip's "in use here" — src/data/feedUse.ts).
// The HUD's readers hold their feeds by mounting; the scene's readers are the Engine's drawing
// paths, which run or not by the SAME policy flags read here. So this is not a second table to keep
// in step: each line names the flag that switches a drawing on and the feeds that drawing is made of.
//
//   canvas off        — no scene at all (the placeholder view)
//   fleet placed      — the node population on screen: the DAG's nodes and the metagraphs' nodes
//                       (and the geo arcs, a simulation that travels between those placed nodes)
//   morph → geo       — the nodes at their geolocations on the globe
//   morph → hyper     — the hubs (the directory says which exist, the geo map which are active),
//                       the core's flash on each global snapshot, the packets per anchored snapshot
//   ledger            — the chamber: global snapshots, the metagraph snapshots in each, the exact reads
//
// ⚠️ NOT `show.hyperFurniture` / `show.globeSurface`: those are true in BOTH Hypergraph and
// Geography, because the two morph into each other and both geometries stay built. Which one is on
// screen is the morph target, so that is the flag read here.
export function sceneFeeds(p: Pick<ViewPolicy, "canvas" | "fleet" | "morph" | "show">): FeedId[] {
  if (!p.canvas) return [];
  const out = new Set<FeedId>();
  if (p.fleet === "placed") { out.add("clusters"); out.add("api-metagraphs"); }
  if (p.morph === "toGeo") out.add("api-geo");
  if (p.morph === "toHyper") { out.add("api-metagraphs"); out.add("api-geo"); out.add("global"); out.add("metasnaps"); }
  if (p.show.ledger) { out.add("global"); out.add("metasnaps"); out.add("exact"); }
  return [...out];
}
