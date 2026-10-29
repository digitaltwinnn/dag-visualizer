// A hosting provider's name as the key every surface spells it by (2026-10-29). It lives in
// `src/data/` rather than beside the sampler that first needed it because the client keys a
// provider's note by the same slug the stored series carry, and `components/` cannot reach `app/api/`.
const KEY_MAX = 48;

/** A provider name as ONE series segment: lowercase, every run of anything but a letter or a
 *  digit one dash. No dot (lineage folding splits series names on dots) and no bar (the field
 *  grammar's separator). Keyed by NAME, not ASN, because the explorer groups hosts by name. Null
 *  for an unknown host: it is left uncounted, never filed under an invented bucket. */
export function providerKey(isp: string | undefined | null): string | null {
  const k = (isp ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, KEY_MAX);
  return k || null;
}
