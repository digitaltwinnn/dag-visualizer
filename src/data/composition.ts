import type { NodeInfo, NodeRow } from "@/src/data/types";

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

// A node LIST grouped by composition — the hyper explorer's middle level AND the composition
// card's subject resolver (2026-08-02: the group became a committable rung, so both the browser
// row and the right-rail card must derive the same members from the same live `selNodes`; one
// helper so a count can't drift between the two). Entries dedupe to MACHINES first (a hybrid
// machine appears once per cluster it runs), so the group counts match the dossier's table.
// `key` is the composition's stable identity within a network — the same string the store's
// CompositionSel carries.
export interface CompGroup { key: string; label: string; codes: string[]; rows: NodeRow[]; }

export function compositionKey(label: string, codes: string[]): string {
  return `${label}|${codes.join("·")}`;
}

export function compositionGroups(rows: NodeRow[]): CompGroup[] {
  const machines = new Map<string, NodeRow>();
  for (const r of rows) {
    const mk = ("node" in r.pick && r.pick.node?.ip) || r.id || r.label;
    if (!machines.has(mk)) machines.set(mk, r);
  }
  const by = new Map<string, CompGroup>();
  for (const r of machines.values()) {
    const node = "node" in r.pick ? r.pick.node : null;
    const comp = node ? compositionRows([node])[0] : undefined;
    const label = comp?.label ?? "Node";
    const codes = comp?.codes ?? [];
    const key = compositionKey(label, codes);
    (by.get(key) ?? by.set(key, { key, label, codes, rows: [] }).get(key)!).rows.push(r);
  }
  for (const g of by.values()) g.rows.sort((a, b) => (a.id || a.label).localeCompare(b.id || b.label));
  return [...by.values()].sort((a, b) => b.rows.length - a.rows.length);
}

// A SINGLE node's composition as one lowercase WORD — "hybrid" / "consensus" / "data" /
// "currency" — the node card's subtitle (user, 2026-07-11: CompositionRows is an AGGREGATE
// vocabulary — a one-node row always counted "1"; the layer codes read as noise next to a
// word). null when the node carries no role/layer info.
export function nodeCompositionLabel(node: NodeInfo): string | null {
  if (!(node.roles && node.roles.length) && !node.layer) return null;
  const row = compositionRows([node])[0];
  return row ? row.label.toLowerCase() : null;
}
