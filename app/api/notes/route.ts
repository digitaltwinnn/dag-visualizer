import { liveDeps, readNote } from "./handlers";

// THE NOTE READ — `GET /api/notes?view=…&subject=…&span=…` (History's brushed range: `&from=…&to=…`).
// A cached note, or `request` for an on-request kind; a missing warmable note is written here (on production or a local
// server; a preview answers it `none`, R66), so the budget covers two Gate attempts. The body is `handlers.ts`'s `readNote`.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function GET(req: Request) {
  return readNote(req, liveDeps);
}
