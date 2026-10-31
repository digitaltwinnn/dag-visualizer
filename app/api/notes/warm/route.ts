import { liveWarmDeps, warmNotes } from "../handlers";

// THE NOTES WARMER — Vercel Cron hits this every 15 minutes at :07, :22, :37 and :52 (vercel.json),
// seven minutes after each trends sample has landed. It rewrites every warmed note that is due (`warm.ts`), one at a time with the Gate
// calls spaced 8 s, starting none after 210 s. Auth: `CRON_SECRET`, checked in `warmNotes` exactly as the trends sampler checks it —
// crons fire on production only, and a preview has no secret and fails closed, and writes
// nothing even with one (R66).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export function GET(req: Request) {
  return warmNotes(req, liveWarmDeps);
}
