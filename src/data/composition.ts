import type { NodeInfo } from "@/src/data/types";

// The shared composition vocabulary: group a metagraph's nodes into rows that sum to the total.
// Hybrids (nodes running >1 layer) group by their EXACT code set, so two make-ups render as two
// rows; dedicated single-layer nodes group by role. See the context-dossier spec.
//
// SELF-CONTAINED (no import from components/inspector/parts, which is a "use client" React module)
// so this stays a pure, Node-test-safe helper — same lesson as the Phase-3 breadcrumb helper.
export interface CompRow { label: string; codes: string[]; count: number; }

const ROLE_ORDER = ["l0", "cl1", "dl1"];
const ROLE_SHORT: Record<string, string> = { l0: "L0", cl1: "cL1", dl1: "dL1" };
// A node's roles, falling back to its single primary layer when the role list is absent.
const rolesOf = (n: NodeInfo): string[] => (n.roles && n.roles.length ? n.roles : [n.layer!]);
const DEDICATED_LABEL: Record<string, string> = { l0: "Consensus", cl1: "Currency", dl1: "Data" };
const codesFor = (roles: string[]) =>
  ROLE_ORDER.filter((r) => roles.includes(r)).map((r) => ROLE_SHORT[r]);

export function compositionRows(nodes: NodeInfo[]): CompRow[] {
  const hybridByKey = new Map<string, CompRow>();
  const dedByRole: Record<string, number> = {};
  for (const node of nodes) {
    const roles = rolesOf(node);
    if (roles.length > 1) {
      const codes = codesFor(roles);
      const key = codes.join("·");
      const row = hybridByKey.get(key) ?? { label: "Hybrid", codes, count: 0 };
      row.count++;
      hybridByKey.set(key, row);
    } else {
      dedByRole[roles[0]!] = (dedByRole[roles[0]!] || 0) + 1;
    }
  }
  const hybridRows = [...hybridByKey.values()].sort((a, b) => a.codes.length - b.codes.length);
  const dedRows: CompRow[] = ROLE_ORDER.filter((r) => dedByRole[r]).map((r) => ({
    label: DEDICATED_LABEL[r],
    codes: [ROLE_SHORT[r]],
    count: dedByRole[r],
  }));
  return [...hybridRows, ...dedRows];
}

// A SINGLE node's composition as an inline phrase — "hybrid (L0 · cL1)" / "consensus (L0)" —
// for the node card's id row (user, 2026-07-11: CompositionRows is an AGGREGATE vocabulary;
// a one-node row always counted "1"). null when the node carries no role/layer info.
export function nodeCompositionLabel(node: NodeInfo): string | null {
  if (!(node.roles && node.roles.length) && !node.layer) return null;
  const row = compositionRows([node])[0];
  if (!row) return null;
  return `${row.label.toLowerCase()} (${row.codes.join(" · ")})`;
}
