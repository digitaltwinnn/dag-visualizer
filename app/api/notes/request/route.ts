import { liveDeps, requestNote } from "../handlers";

// THE NOTE REQUEST — `POST /api/notes/request`, History's on-request kinds (the 1h pill, a brushed
// range), with the brushed-range limits. A preview answers `none` (R66). The body is `handlers.ts`'s `requestNote`.
export const runtime = "nodejs";
export const maxDuration = 60;

export function POST(req: Request) {
  return requestNote(req, liveDeps);
}
