// The shared answer's assembly, pure over its readers. Every read starts at once — globals, the
// unlisted-chain list and the listed chains; the unlisted chains as soon as their list lands — so a
// miss costs about one upstream round trip (two for the unlisted chains), never the sum of them.
// Globals may throw (no globals, no answer); a rejected chain is named in `failed` while the rest
// still answer.
import type { GlobalSnapshot, LiveAnswer, RawMetaSnapshot } from "@/src/data/types";
import { isQuiet } from "./quiet";

type Readers = { globals: () => Promise<GlobalSnapshot[]>; chain: (id: string) => Promise<RawMetaSnapshot[]> };
type Assembled = Omit<LiveAnswer, "memoAgeMs">;

/** Each chain read settled, never rejecting — a synchronous throw from a reader counts as a rejection. */
function readChains(read: Readers, ids: string[]): Promise<PromiseSettledResult<RawMetaSnapshot[]>[]> {
  return Promise.allSettled(ids.map(async (id) => read.chain(id)));
}

/** Folds the settled chain reads into the answer: listed chains always (a `[]` stays `[]`), unlisted
 *  ones only when not quiet; every rejection in `failed`, listed first. */
function fold(
  globals: GlobalSnapshot[],
  listed: string[],
  listedSettled: PromiseSettledResult<RawMetaSnapshot[]>[],
  unlisted: string[],
  unlistedSettled: PromiseSettledResult<RawMetaSnapshot[]>[],
): Assembled {
  const now = Date.now();
  const metas: Record<string, RawMetaSnapshot[]> = {};
  const failed: string[] = [];
  const unlistedIn: string[] = [];
  listed.forEach((id, i) => {
    const s = listedSettled[i];
    if (s.status === "rejected") failed.push(id);
    else metas[id] = s.value;
  });
  unlisted.forEach((id, i) => {
    const s = unlistedSettled[i];
    if (s.status === "rejected") { failed.push(id); return; }
    if (isQuiet(s.value, now)) return;
    unlistedIn.push(id);
    metas[id] = s.value;
  });
  return { globals, metas, unlisted: unlistedIn, failed };
}

/** The answer over a known unlisted set (no list read, nothing remembered as quiet). */
export async function assembleLive(read: Readers, listed: string[], unlisted: string[]): Promise<Assembled> {
  return assembleWithUnlisted(read, listed, async () => unlisted, new Set());
}

/** Marker in `failed` when the hourly unlisted-chain list could not be read. */
export const UNLISTED_FAILED = "@unlisted";

/** The route's whole miss path: the unlisted list is a side read whose failure is REPORTED in `failed`
 * (never a 503, never silent); chains found quiet are remembered in `quiet` until its rebuild. */
export async function assembleWithUnlisted(
  read: Readers,
  listed: string[],
  listUnlisted: () => Promise<string[]>,
  quiet: Set<string>,
): Promise<Assembled> {
  const globalsP = read.globals();
  const listedP = readChains(read, listed);
  // Never rejects: a failed list is reported, and the unlisted chains start the moment it lands.
  const unlistedP = (async () => {
    let list: string[];
    try {
      list = await listUnlisted();
    } catch (e) {
      console.error("live: unlisted chain list failed", e);
      return { ids: [] as string[], settled: [] as PromiseSettledResult<RawMetaSnapshot[]>[], listFailed: true };
    }
    const ids = list.filter((id) => !quiet.has(id));
    return { ids, settled: await readChains(read, ids), listFailed: false };
  })();
  const globals = await globalsP; // a rejection fails the answer; the side reads above never reject
  const [listedSettled, u] = await Promise.all([listedP, unlistedP]);
  const r = fold(globals, listed, listedSettled, u.ids, u.settled);
  for (const id of u.ids) if (!r.unlisted.includes(id) && !r.failed.includes(id)) quiet.add(id);
  if (u.listFailed) r.failed.push(UNLISTED_FAILED);
  return r;
}
