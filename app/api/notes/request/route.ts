import { AI_NOTES_ON } from "@/src/engine/config";
import { liveDeps, requestNote } from "../handlers";

// THE NOTE REQUEST — `POST /api/notes/request` writes History's two on-request kinds (the 1h pill,
// a brushed range) and the subject notes, a brushed range and a subject note under the visitor
// limits. A preview answers `none` (R66). The body is `handlers.ts`'s `requestNote`.
export const runtime = "nodejs";
export const maxDuration = 60;

export function POST(req: Request) {
  if (!AI_NOTES_ON) return Response.json({ state: "none" });
  return requestNote(req, liveDeps);
}
