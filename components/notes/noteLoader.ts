import type { NoteResponse, NoteView } from "@/src/data/noteTypes";

// THE NOTE FETCH, WITHOUT REACT — `useNote` is a thin wrapper over this, so the fetch / poll /
// give-up rules are testable with an injected fetch and timer (the Vitest env has no DOM).
//
// One loader holds one module-level cache and one in-flight map, both keyed by the QUERY STRING
// the request sends (the CDN's own key), so two hooks asking for one note share one fetch and a
// remount inside the TTL asks nothing at all.
//
//   · GET first. It answers `ok` / `none` / `request` (cached) or `pending` / `unavailable`.
//   · `pending` means a note is being written: re-fetch after RETRY_MS, at most MAX_RETRIES times,
//     then give up as `unavailable` — never an endless "writing" (the acquiring give-up rule).
//   · A network error, a non-2xx (the POST's 429 included) or an unreadable body is `unavailable`,
//     and is NOT cached, so the next ask tries again.
//   · `request()` POSTs only on the reader's gesture. The POST's own answer is used and stored
//     under the GET's key: the CDN holds a GET `request` answer for five minutes, so re-reading
//     it would show `request` again. A POST that answers `pending` (another visitor's write is in
//     flight) polls the GET like any pending, and a stale CDN `request` in that poll counts as
//     still-pending, not as a result.

export interface NoteReq {
  view: NoteView;
  subject: string;
  /** A pill (`24h`, `7d`…), a brushed range `r<fromMs>-<toMs>`, or absent for the fixed-span views. */
  span?: string | null;
}

export const RETRY_MS = 3_000;
export const MAX_RETRIES = 4;
/** Matches the read route's own `s-maxage`. */
export const TTL_MS = 300_000;

const RANGE_RE = /^r(\d{1,15})-(\d{1,15})$/;
const STATES = new Set(["ok", "pending", "none", "unavailable", "request"]);
const UNAVAILABLE: NoteResponse = { state: "unavailable" };

/** The GET query string: a brushed range travels as `from`/`to`, everything else as `span`. */
export function queryOf(req: NoteReq): string {
  const p = new URLSearchParams({ view: req.view, subject: req.subject });
  const range = req.span ? RANGE_RE.exec(req.span) : null;
  if (range) {
    p.set("from", range[1]!);
    p.set("to", range[2]!);
  } else if (req.span) p.set("span", req.span);
  return p.toString();
}

/** The POST body: `{ view, subject, span }` or, for a brushed range, `{ view, subject, fromMs, toMs }`. */
export function bodyOf(req: NoteReq): Record<string, unknown> {
  const range = req.span ? RANGE_RE.exec(req.span) : null;
  if (range) return { view: req.view, subject: req.subject, fromMs: Number(range[1]), toMs: Number(range[2]) };
  return { view: req.view, subject: req.subject, span: req.span ?? undefined };
}

export interface NoteLoaderDeps {
  /** The GET / POST target, already through `netUrl()`. */
  urlOf: (path: string) => string;
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

async function readAnswer(r: Response): Promise<NoteResponse> {
  if (!r.ok) return UNAVAILABLE;
  const j = (await r.json()) as { state?: unknown };
  return j && typeof j.state === "string" && STATES.has(j.state) ? (j as NoteResponse) : UNAVAILABLE;
}

export function createNoteLoader(deps: NoteLoaderDeps) {
  const cache = new Map<string, { at: number; res: NoteResponse }>();
  const inflight = new Map<string, Promise<NoteResponse>>();

  const store = (key: string, res: NoteResponse) => {
    // An instrument state that is not a note's own is never held: ask again next time.
    if (res.state === "ok" || res.state === "none" || res.state === "request") cache.set(key, { at: deps.now(), res });
    else cache.delete(key);
    return res;
  };

  async function getOnce(key: string): Promise<NoteResponse> {
    try {
      return await readAnswer(await deps.fetchImpl(deps.urlOf(`/api/notes?${key}`)));
    } catch {
      return UNAVAILABLE;
    }
  }

  /** Poll the GET while the answer is still a write in flight. `firstPending` starts the clock
   *  when the caller already has a pending answer in hand (the POST's). */
  async function settle(key: string, first: NoteResponse, stalePendingRequest: boolean): Promise<NoteResponse> {
    let res = first;
    for (let tries = 0; ; tries++) {
      const waiting = res.state === "pending" || (stalePendingRequest && res.state === "request");
      if (!waiting) return res;
      if (tries >= MAX_RETRIES) return UNAVAILABLE;
      await deps.sleep(RETRY_MS);
      res = await getOnce(key);
    }
  }

  function fresh(key: string): NoteResponse | null {
    const hit = cache.get(key);
    return hit && deps.now() - hit.at < TTL_MS ? hit.res : null;
  }

  return {
    /** The held answer, if one is fresh. */
    peek: (req: NoteReq): NoteResponse | null => fresh(queryOf(req)),

    /** The note for a request: held, or fetched (one fetch for any number of askers). */
    get(req: NoteReq): Promise<NoteResponse> {
      const key = queryOf(req);
      const hit = fresh(key);
      if (hit) return Promise.resolve(hit);
      let p = inflight.get(key);
      if (!p) {
        p = getOnce(key)
          .then((first) => settle(key, first, false))
          .then((res) => store(key, res))
          .finally(() => inflight.delete(key));
        inflight.set(key, p);
      }
      return p;
    },

    /** The reader asked for a note to be written. Answers what the POST answered, stored under
     *  the GET's key. */
    request(req: NoteReq): Promise<NoteResponse> {
      const key = queryOf(req);
      const posting = `post:${key}`;
      let p = inflight.get(posting);
      if (!p) {
        p = (async () => {
          let first: NoteResponse;
          try {
            first = await readAnswer(
              await deps.fetchImpl(deps.urlOf("/api/notes/request"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(bodyOf(req)),
              }),
            );
          } catch {
            first = UNAVAILABLE;
          }
          // A POST never answers `request`: that would be the very state the reader just left.
          if (first.state === "request") first = UNAVAILABLE;
          return store(key, await settle(key, first, true));
        })().finally(() => inflight.delete(posting));
        inflight.set(posting, p);
      }
      return p;
    },
  };
}
