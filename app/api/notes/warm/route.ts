import { liveWarmDeps, warmNotes } from "../handlers";

// THE NOTES WARMER — Vercel Cron hits this hourly at :07 (vercel.json), after the :00 trends sample
// has landed. It rewrites every warmed note that is due (`warm.ts`), one at a time with the Gate
// calls spaced 3.5 s, starting none after 210 s. Auth: `CRON_SECRET`, checked in `warmNotes` exactly as the trends sampler checks it —
// crons fire on production only, and a preview has no secret and fails closed.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export function GET(req: Request) {
  return warmNotes(req, liveWarmDeps);
}
