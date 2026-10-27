import type { NoteView } from "@/src/data/noteTypes";
import { currentIdOf, isTracked } from "@/src/net/lineage";
import { KIND_TIMING, snapSpan, timingOf, type NoteSpan } from "./keys";

// THE NOTE ROUTES' INPUT — one home for what a request may ask for, so the read route, the request
// route and the CDN all see the same shapes. Bad input is an ERROR with a short fixed message,
// never an echo of what was sent.
//
// A subject is `all`, `dag`, a network the catalog tracks (a FORMER address answers as its network's
// current id, so a re-registered network keeps one note), or a country `cc:XX` for Geography. The
// span is fixed by the view except History's: a pill, or a brushed `from`/`to` snapped by `snapSpan`
// so near-identical brushes share one key. Notes exist for mainnet only, so the catalog asked is
// mainnet's; whether this particular view writes a note for this subject is the generator's call
// (`noteSupported`), which answers `none` rather than an error.

const VIEWS: readonly NoteView[] = ["hyper", "geo", "ledger", "trend"];
const FIXED_SPAN: Partial<Record<NoteView, NoteSpan>> = { hyper: "day", geo: "day", ledger: "hours" };
const PILLS: readonly NoteSpan[] = ["1h", "24h", "7d", "30d", "1y", "all"];
/** The kinds the request route writes: the 1h pill and a brushed range (`timingOf` says on-request). */
const ON_REQUEST_PILL: NoteSpan = "1h";
const CC_RE = /^cc:[A-Z]{2}$/;
const MS_RE = /^\d{1,15}$/;
const NET = "mainnet";

export interface NoteParams {
  view: NoteView;
  subject: string;
  span: NoteSpan;
}
type Parsed = NoteParams | { error: string };

function subjectOf(view: NoteView, raw: string | null): string | null {
  if (raw == null) return null;
  if (raw === "all" || raw === "dag") return raw;
  if (CC_RE.test(raw)) return view === "geo" ? raw : null;
  if (!isTracked(NET, raw)) return null;
  const current = currentIdOf(NET, raw);
  return current && isTracked(NET, current) ? current : null;
}

/** The query of `GET /api/notes`: `view`, `subject`, and for History `span` or `from`/`to` (ms). */
export function parseNoteParams(sp: URLSearchParams, nowMs: number): Parsed {
  const view = sp.get("view") as NoteView | null;
  if (!view || !VIEWS.includes(view)) return { error: "bad view" };
  const subject = subjectOf(view, sp.get("subject"));
  if (!subject) return { error: "bad subject" };
  const span = sp.get("span");
  const fixed = FIXED_SPAN[view];
  if (fixed) return span == null || span === fixed ? { view, subject, span: fixed } : { error: "bad span" };

  const from = sp.get("from");
  const to = sp.get("to");
  if (from == null && to == null) {
    return span != null && PILLS.includes(span as NoteSpan) ? { view, subject, span: span as NoteSpan } : { error: "bad span" };
  }
  if (span != null || from == null || to == null || !MS_RE.test(from) || !MS_RE.test(to)) return { error: "bad span" };
  const snapped = snapSpan(Number(from), Number(to), nowMs);
  return snapped ? { view, subject, span: `r${snapped.fromMs}-${snapped.toMs}` } : { error: "bad span" };
}

/** The body of `POST /api/notes/request`: `{ view: "trend", subject, span: "1h" }` or
 *  `{ view: "trend", subject, fromMs, toMs }`. Every other kind is warmed or written on a read. */
export function parseNoteRequest(body: unknown, nowMs: number): Parsed {
  if (body == null || typeof body !== "object") return { error: "bad body" };
  const { view, subject, span, fromMs, toMs } = body as Record<string, unknown>;
  if (view !== "trend" || typeof subject !== "string") return { error: "bad body" };
  const sp = new URLSearchParams({ view, subject });
  if (span === ON_REQUEST_PILL && fromMs === undefined && toMs === undefined) sp.set("span", ON_REQUEST_PILL);
  else if (span === undefined && Number.isSafeInteger(fromMs) && Number.isSafeInteger(toMs)) {
    sp.set("from", String(fromMs));
    sp.set("to", String(toMs));
  } else return { error: "bad body" };
  return parseNoteParams(sp, nowMs);
}

/** THE ONE PLACE that says which requests the limits apply to: a brushed range, the only kind
 *  whose key space is unbounded. Every other kind is bounded by its key and the singleflight. */
export function isLimitedSpan(span: NoteSpan): boolean {
  return timingOf("trend", span) === KIND_TIMING.range;
}
