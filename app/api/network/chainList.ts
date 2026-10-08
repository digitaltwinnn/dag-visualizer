// THE EXPLORER'S CHAIN LIST, plain fetch — no Next imports, so the sampler route, the cached
// unlisted-chains helper and the rebuild script (run by tsx, outside Next) share one reader.
/** Every chain the explorer lists. The list is PAGED (`meta.next`) — followed, so a growing list
 *  never truncates silently (the review). Bounded: a list longer than 50 pages is not a list. */
export async function fetchChainIds(be: string, timeoutMs = 8000): Promise<string[]> {
  const ids: string[] = [];
  let next: string | undefined;
  for (let page = 0; page < 50; page++) {
    const r = await fetch(`${be}/currency${next ? `?next=${encodeURIComponent(next)}` : ""}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) throw new Error(`be ${r.status}`);
    const j = (await r.json()) as { data?: { id?: string }[]; meta?: { next?: string } };
    for (const c of j.data ?? []) if (c.id) ids.push(c.id);
    next = j.meta?.next;
    if (!next || !(j.data ?? []).length) break;
  }
  return ids;
}

