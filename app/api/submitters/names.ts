// Digital Evidence's organisation NAMES (2026-11-27). The chain carries an organisation's id only;
// its name comes from DED's own public API (`/v1/fingerprints/latest`, read by the quarter-hourly
// sampler, source `ded`) or, once and offline, from dagscan's evidence summary (source `dagscan`).
// An organisation appears in DED's latest list only while it is submitting, so names ACCUMULATE:
// a name is added or updated, never deleted, and a `ded` name (the organisation's own registry)
// replaces a `dagscan` one, never the reverse. Stored in `sub:mainnet:<DED>:names`
// (`keys.ts` `subNamesKeyOf`), one field per orgId, value JSON `{ name, source, namedAt }`.
// ⚠️ READ BACK, A VALUE IS AN OBJECT: `@upstash/redis` JSON-parses every HGETALL value, so the
// stored JSON string arrives as `{ name, source, namedAt }` (a fake that hands back strings hid it;
// `trends/fakeStore.ts` deserialises the client's way now). `storedName` reads either form.

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

/** orgId → name from dagscan's evidence summary `{ orgs: [{ orgId, name, … }] }` (the one-off
 *  seed, `scripts/seed-ded-names.ts`); an entry without both is skipped. */
export function parseDagscanSummary(body: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isObj(body) || !Array.isArray(body.orgs)) return out;
  for (const e of body.orgs) {
    if (!isObj(e)) continue;
    const id = text(e.orgId), name = text(e.name);
    if (id && name) out[id] = name;
  }
  return out;
}

/** A stored name, as the client hands it back (an object) or as stored (its JSON string); null when
 *  it is neither a readable `{ name, source }` nor present. The ONE reader of a stored name: the
 *  merge below and the read side (`assemble.ts`) both ask it. */
export function storedName(v: unknown): { name: string; source: NameSource } | null {
  if (v == null) return null;
  let p: unknown = v;
  if (typeof v === "string") {
    try { p = JSON.parse(v); } catch { return null; /* unreadable: replaced */ }
  }
  if (isObj(p) && text(p.name) && (p.source === "ded" || p.source === "dagscan")) return { name: p.name as string, source: p.source };
  return null;
}

/** The longest name kept: a name is a card's label and a note's word, never a paragraph. */
const NAME_MAX = 80;
// C0, DEL and C1 controls: a name from DED's API or dagscan goes into the notes' prompts and the cards.
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/g;

/** A name as it is stored: control characters removed, white space collapsed, at most NAME_MAX
 *  characters; "" when nothing is left (no name). */
function clean(name: string): string {
  return name.replace(CONTROL_RE, "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX).trim();
}

/** THE NAMES TO WRITE after `seen` (orgId → name) from `source`, against the stored hash `prev` (as
 *  HGETALL hands it back): only a new or changed name, as `{ name, source, namedAt: nowMs }` JSON (the
 *  name `clean`ed — it reaches the notes' prompts — and skipped when nothing is left). An unchanged
 *  name is not written (its `namedAt` keeps), a `dagscan` name is never written over a `ded` one, and a
 *  stored field it does not write is left as it is (an HSET of the answer drops nothing). The sampler
 *  and the seed (`seedNames`) both write exactly this. */
export function nameWrites(prev: Record<string, unknown>, seen: Record<string, string>, source: NameSource, nowMs: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, raw] of Object.entries(seen)) {
    const name = clean(raw);
    if (!name) continue;
    const p = storedName(prev[id]);
    if (p && p.source === "ded" && source === "dagscan") continue;
    if (p && p.name === name && p.source === source) continue;
    out[id] = JSON.stringify({ name, source, namedAt: nowMs });
  }
  return out;
}
