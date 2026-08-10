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
 *  value — rather than being hidden. */
export function payloadKinds(v: unknown): { kind: string; count: number }[] {
  const items = Array.isArray(v) ? v : v == null ? [] : [v];
  const byKind = new Map<string, number>();
  for (const it of items) {
    const k = kindOf(it);
    byKind.set(k, (byKind.get(k) ?? 0) + 1);
  }
  return [...byKind].map(([kind, count]) => ({ kind, count }));
}
