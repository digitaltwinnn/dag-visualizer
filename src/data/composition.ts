import type { NodeInfo, NodeRow } from "@/src/data/types";

// The shared composition vocabulary: group a metagraph's nodes into rows that sum to the total.
// Hybrids (nodes running >1 layer) group by their EXACT code set, so two make-ups render as two
// rows; dedicated single-layer nodes group by role. See the context-dossier spec.
//
// SELF-CONTAINED (no import from components/inspector/parts, which is a "use client" React module)
// so this stays a pure, Node-test-safe helper — same lesson as the Phase-3 breadcrumb helper.
export interface CompRow { label: string; codes: string[]; count: number; }

const ROLE_ORDER = ["l0", "cl1", "dl1"];
// EXPORTED as the vocabulary's ONE home (2026-08-16): parts.tsx re-exports it for the chips and
// SceneCallout's lead line reads layerCodesOf below — three private copies of this map existed
// before the consolidation, which is exactly how a fourth dialect starts.
export const ROLE_SHORT: Record<string, string> = { l0: "L0", cl1: "cL1", dl1: "dL1" };
// A node's roles, falling back to its single primary layer when the role list is absent.
const rolesOf = (n: NodeInfo): string[] => (n.roles && n.roles.length ? n.roles : [n.layer!]);
const DEDICATED_LABEL: Record<string, string> = { l0: "Consensus", cl1: "Currency", dl1: "Data" };
const codesFor = (roles: string[]) =>
  ROLE_ORDER.filter((r) => roles.includes(r)).map((r) => ROLE_SHORT[r]);

/** The layer codes present across a set of role lists, in the fixed vocabulary order — the
 *  subject callout's lead-line read, and the one aggregate over ROLE_SHORT. */
export function layerCodesOf(nodes: ReadonlyArray<{ roles?: string[] }>): string[] {
  const all = new Set<string>();
  for (const n of nodes) for (const r of n.roles ?? []) all.add(r);
  return ROLE_ORDER.filter((r) => all.has(r)).map((r) => ROLE_SHORT[r]);
}

/** What a layer DOES — one functional clause per code, in the app's own established language
 *  (L0 seals snapshots per SIGNER_GROUPS; cL1 carries the currency; dL1 produces the data
 *  blocks). The hyper explorer's leaf caption composes these into "Nodes that …" (user,
 *  2026-08-16: the caption should say what the group does — repeating the parent row's codes
 *  was duplication). One home beside the code vocabulary, so a new layer adds its clause here. */
const LAYER_CLAUSE: Record<string, string> = {
  L0: "seal snapshots",
  cL1: "validate transactions", // the TRANSACTIONS are validated, never "the currency" (user, 2026-08-16)
  dL1: "validate data updates", // the card's own object ("Data updates: N")
};

/** The composition's functional fragment ("seal snapshots, validate transactions and data
 *  updates"), in
 *  the fixed code order; null when no code has a clause. Clauses are LABEL-length — the caption
 *  wears the caps-micro section register (user, 2026-08-16: the prose form blended into the
 *  rows), where a full sentence wrapped four lines. A repeated leading verb is elided from the
 *  latter clause ("validate transactions and data updates", not "…and validate data updates"). */
export function compositionClause(codes: readonly string[]): string | null {
  const parts = codes.map((c) => LAYER_CLAUSE[c]).filter((c): c is string => !!c);
  if (!parts.length) return null;
  const out: string[] = [parts[0]];
  for (let i = 1; i < parts.length; i++) {
    const prevVerb = parts[i - 1].split(" ")[0];
    const [verb, ...rest] = parts[i].split(" ");
    out.push(verb === prevVerb ? rest.join(" ") : parts[i]);
  }
  if (out.length === 1) return out[0];
  return `${out.slice(0, -1).join(", ")} and ${out[out.length - 1]}`;
}

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

const KEY_SEP = "|";
const CODE_SEP = "·";

export function compositionKey(label: string, codes: string[]): string {
  return `${label}${KEY_SEP}${codes.join(CODE_SEP)}`;
}

// The inverse, living next to the builder ON PURPOSE: the composition card reads the label + codes
// back out of the key (so its head still reads correctly for a group that has momentarily emptied
// out), and a format encoded in two modules is a format that drifts.
export function parseCompositionKey(key: string): { label: string; codes: string[] } {
  const [label = key, codeStr = ""] = key.split(KEY_SEP);
  return { label, codes: codeStr ? codeStr.split(CODE_SEP) : [] };
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
    let group = by.get(key);
    if (!group) by.set(key, (group = { key, label, codes, rows: [] }));
    group.rows.push(r);
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
