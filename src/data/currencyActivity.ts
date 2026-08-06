// The currency gutter's status line (spec §6.7). The gutter must not read as "quiet" just because
// the visible 36-second window is quiet — currency activity is measured against an ABSOLUTE clock,
// so PACA's eleven dormant months and DED's absent token read as the different facts they are.
import type { CurrencyActivity } from "./types";

const DAY = 86400000;
const DORMANT_AFTER = 30 * DAY;

export function classifyActivity(lastTs: string | null, now: number): CurrencyActivity["state"] {
  if (!lastTs) return "none";
  const t = Date.parse(lastTs);
  if (!Number.isFinite(t)) return "none";
  return now - t > DORMANT_AFTER ? "dormant" : "active";
}

function coarseAge(ms: number): string {
  const mo = Math.round(ms / (30 * DAY));
  if (mo >= 1) return `${mo} MONTH${mo === 1 ? "" : "S"}`;
  const d = Math.round(ms / DAY);
  if (d >= 1) return `${d} DAY${d === 1 ? "" : "S"}`;
  const h = Math.max(1, Math.round(ms / 3600000));
  return `${h} HOUR${h === 1 ? "" : "S"}`;
}

export function activityLine(a: CurrencyActivity | null, ticker: string, now: number): string {
  if (!a) return `${ticker} · NO SIGNAL`;
  if (a.state === "none" || !a.lastTs) return `${ticker} · NO CURRENCY`;
  const age = coarseAge(Math.max(0, now - Date.parse(a.lastTs)));
  return a.state === "dormant" ? `${ticker} · DORMANT ${age}` : `${ticker} · ACTIVE ${age} AGO`;
}
