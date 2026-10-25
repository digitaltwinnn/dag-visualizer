// The shared answer's assembly, pure over its readers. Globals first (allowed to throw: no globals,
// no answer); chains in parallel, a rejected one named in `failed` while the rest still answer.
import type { GlobalSnapshot, RawMetaSnapshot } from "@/src/data/types";
import { isQuiet } from "./quiet";

export type LiveAnswer = {
  globals: GlobalSnapshot[];
  metas: Record<string, RawMetaSnapshot[]>;
  unlisted: string[];
  failed: string[];
  memoAgeMs: number;
};

export async function assembleLive(
  read: { globals: () => Promise<GlobalSnapshot[]>; chain: (id: string) => Promise<RawMetaSnapshot[]> },
  listed: string[],
  unlisted: string[],
): Promise<Omit<LiveAnswer, "memoAgeMs">> {
  const globals = await read.globals();
  const ids = [...listed, ...unlisted];
  const settled = await Promise.allSettled(ids.map((id) => read.chain(id)));
  const now = Date.now();
  const metas: Record<string, RawMetaSnapshot[]> = {};
  const failed: string[] = [];
  const unlistedIn: string[] = [];
  ids.forEach((id, i) => {
    const s = settled[i];
    if (s.status === "rejected") { failed.push(id); return; }
    if (i >= listed.length) {
      if (isQuiet(s.value, now)) return;
      unlistedIn.push(id);
    }
    metas[id] = s.value;
  });
  return { globals, metas, unlisted: unlistedIn, failed };
}

/** Marker in `failed` when the hourly unlisted-chain list could not be read. */
export const UNLISTED_FAILED = "@unlisted";

/** The route's whole miss path: the unlisted list is a side read whose failure is REPORTED in `failed`
 * (never a 503, never silent); chains found quiet are remembered in `quiet` until its rebuild. */
export async function assembleWithUnlisted(
  read: Parameters<typeof assembleLive>[0],
  listed: string[],
  listUnlisted: () => Promise<string[]>,
  quiet: Set<string>,
): Promise<Omit<LiveAnswer, "memoAgeMs">> {
  let list: string[] = [];
  let listFailed = false;
  try {
    list = await listUnlisted();
  } catch (e) {
    listFailed = true;
    console.error("live: unlisted chain list failed", e);
  }
  const unlisted = list.filter((id) => !quiet.has(id));
  const r = await assembleLive(read, listed, unlisted);
  for (const id of unlisted) if (!r.unlisted.includes(id) && !r.failed.includes(id)) quiet.add(id);
  if (listFailed) r.failed.push(UNLISTED_FAILED);
  return r;
}
