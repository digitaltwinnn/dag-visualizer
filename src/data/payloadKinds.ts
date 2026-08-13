// The SHAPE of a decoded payload — one row per record KIND, with how many of that kind the
// snapshot carried (user, 2026-08-09: "for data- and state-tab for sure we can come with a more
// uniform approach"). The raw layer's state lane already opens with a shape table, because the
// server computes it (`decodeChannel.shapeOf` → `stateKeys`); the data lane had nothing but a naked
// JSON tree, because its records ride as ONE serialized array. This is that missing read, so both
// payload lanes present identically: a small shape table first, the raw tree behind a disclosure.
//
// It is deliberately MECHANICAL — every kind label is read off the record's own keys, never
// inferred from a schema we don't have (rule 10). A single top-level key IS the record's name in
// the wrapper idiom mainnet actually uses (`{"MetagraphBatchMessage":{…}}`, verified live); a flat
// multi-field record has no name, so its own field list stands in as its signature; anything that
// isn't an object is named by its JSON type.

/** The two payload lanes' words. ONE home, because the same two reads are disclosed at two
 *  levels — as SECTIONS on the metagraph-snapshot card (the shape) and as LANES in the raw
 *  layer's channel pane (the payload) — and a card whose sections disagreed with the pane's tabs
 *  would read as two different subjects rather than one subject twice. The titles carry the
 *  nuance the short values can't: `State` is the accumulated on-chain state, `Data` is what THIS
 *  snapshot's blocks carried, which is why a bare "none" means a different thing in each. */
export const PAYLOAD_LANES = {
  // The titles carry the SIZE distinction (user, 2026-08-13 — "state size plus data size does
  // not match Fees paid's anchored KB. Why?"): each section's size is its DECODED content, while
  // the anchored figure is the whole snapshot's compressed wire footprint — brotli is applied to
  // the whole payload, so a per-section as-carried size does not exist, and the envelope (proofs,
  // header) belongs to neither section. The two readings can never sum, and the titles say which
  // one each number is.
  state: { name: "State", title: "The metagraph's on-chain application state. Its size is the decoded content; the anchored KB is the whole snapshot's compressed footprint." },
  data: { name: "Data", title: "Data records carried in this snapshot's blocks. Its size is the decoded content; the anchored KB is the whole snapshot's compressed footprint." },
} as const;

/** A decoded payload string → a tree-renderable value, tolerating an undecodable one (which
 *  renders as a single string value rather than being hidden). */
export function parsePayload(s: string | undefined): unknown {
  if (!s) return null;
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return s;
  }
}

/** One record's kind: its wrapper name, its field signature, or its JSON type. */
export function kindOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v !== "object") return typeof v;
  const keys = Object.keys(v as object);
  if (keys.length === 0) return "{}";
  return keys.length === 1 ? keys[0] : keys.join(" · ");
}

/** Group a decoded payload's records by kind, in order of first appearance (so the table is
 *  deterministic and reads in payload order). A non-array payload counts as one record — the whole
 *  value — rather than being hidden.
 *
 *  `fields` carries a flat record's signature as STRUCTURE (user, 2026-08-13 — the joined
 *  "attribute · attribute · …" string read as one unparseable token): the field names of a
 *  multi-field record, in the record's own order, so the UI can render a schema as discrete
 *  tokens. Null for everything whose kind is already one word — a wrapper name, a JSON type. */
export function payloadKinds(v: unknown): { kind: string; fields: string[] | null; count: number }[] {
  const items = Array.isArray(v) ? v : v == null ? [] : [v];
  const byKind = new Map<string, { fields: string[] | null; count: number }>();
  for (const it of items) {
    const k = kindOf(it);
    const g = byKind.get(k);
    if (g) g.count++;
    else {
      const keys = it !== null && typeof it === "object" && !Array.isArray(it) ? Object.keys(it as object) : [];
      byKind.set(k, { fields: keys.length > 1 ? keys : null, count: 1 });
    }
  }
  return [...byKind].map(([kind, g]) => ({ kind, fields: g.fields, count: g.count }));
}

/** The STATE's schema, one level down (user, 2026-08-14 — DOR's `updates` key is only the
 *  PARENT of the real record schema, so the state table read `updates · 13` while the data lane
 *  showed the actual fields of sibling-shaped records). Per top-level key: its record count
 *  (shapeOf's own units — array length, map size, scalar 1) and the KINDS of the records under
 *  it, read mechanically off the values exactly as `payloadKinds` reads a payload — a keyed map's
 *  records are its values, an array's its items, and a scalar has no records to describe. Never
 *  an inferred schema (rule 10): every chip is a field name a real record carries. */
export function stateSchema(
  state: unknown,
): { key: string; count: number; kinds: { kind: string; fields: string[] | null; count: number }[] }[] {
  if (!state || typeof state !== "object" || Array.isArray(state)) return [];
  return Object.entries(state as Record<string, unknown>).map(([key, v]) => {
    const count = Array.isArray(v) ? v.length : v && typeof v === "object" ? Object.keys(v as object).length : v == null ? 0 : 1;
    const items = Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v as object) : [];
    return { key, count, kinds: items.length ? payloadKinds(items) : [] };
  });
}
