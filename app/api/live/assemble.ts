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
