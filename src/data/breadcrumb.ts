// Resolve the ticker straight from the pure config data — NOT from `@/src/data/network`,
// which imports the browser-only `js/api.js` at module level and would break this Node test.
// `js/config.js` is plain constants (no imports, no browser globals), so it's test-safe.
import { METAGRAPHS } from "../../js/config.js";

// The breadcrumb eyebrow for a Detail (child) card, naming its parent — the active
// metagraph (identity context), reading child ‹ parent toward the rail's outer edge.
export function breadcrumbLabel(kind: "node" | "snap", filter: string): string {
  const child = kind === "snap" ? "snapshot" : "node";
  let parent = "network";
  if (filter === "dag") {
    parent = "DAG";
  } else if (filter !== "all") {
    const m = (METAGRAPHS as { id: string; ticker: string; name: string }[]).find(
      (x) => x.id === filter,
    );
    parent = m ? m.ticker || m.name : "network";
  }
  return `${child} ‹ ${parent}`;
}
