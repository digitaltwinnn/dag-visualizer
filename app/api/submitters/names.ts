// Digital Evidence's organisation NAMES (2026-11-27). The chain carries an organisation's id only;
// its name comes from DED's own public API (`/v1/fingerprints/latest`, read by the quarter-hourly
// sampler, source `ded`) or, once and offline, from dagscan's evidence summary (source `dagscan`).
// An organisation appears in DED's latest list only while it is submitting, so names ACCUMULATE:
// a name is added or updated, never deleted, and a `ded` name (the organisation's own registry)
// replaces a `dagscan` one, never the reverse. Stored in `sub:mainnet:<DED>:names`
// (`keys.ts` `subNamesKeyOf`), one field per orgId, value JSON `{ name, source, namedAt }`.

export type NameSource = "ded" | "dagscan";

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

/** orgId → orgName from DED's `{ data: [{ orgId, orgName, … }] }`; an entry without both is skipped. */
export function parseDedLatest(body: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isObj(body) || !Array.isArray(body.data)) return out;
  for (const e of body.data) {
    if (!isObj(e)) continue;
    const id = text(e.orgId), name = text(e.orgName);
    if (id && name) out[id] = name;
  }
  return out;
}

function stored(v: string | undefined): { name: string; source: NameSource } | null {
  if (v == null) return null;
  try {
    const p = JSON.parse(v) as unknown;
    if (isObj(p) && text(p.name) && (p.source === "ded" || p.source === "dagscan")) return { name: p.name as string, source: p.source };
  } catch { /* unreadable: replaced */ }
  return null;
}

/** The names hash after `seen` (orgId → name) from `source`: every previous key kept, a new or
 *  changed name written as `{ name, source, namedAt: nowMs }`, an unchanged one left byte-identical,
 *  and a `dagscan` name never written over a `ded` one. */
export function mergeNames(prev: Record<string, string>, seen: Record<string, string>, source: NameSource, nowMs: number): Record<string, string> {
  const out = { ...prev };
  for (const [id, name] of Object.entries(seen)) {
    const p = stored(prev[id]);
    if (p && p.source === "ded" && source === "dagscan") continue;
    if (p && p.name === name && p.source === source) continue;
    out[id] = JSON.stringify({ name, source, namedAt: nowMs });
  }
  return out;
}
