// The share of a feed's polls that succeeded, as a reader would say it — the pulse strip's one
// health reading (user, 2026-10-03: "'237 ok · 2 failed' — perhaps a percentage is better?").
//
// Two honesty rules (rule 10): it never says "100%" while anything failed, and it keeps one decimal
// from 99 up, where the whole-number reading would hide the very failures the card exists to show.
// FLOORED there, never rounded: 2 failures in 2,000 is 99.9%, not "100.0%".
export function okShare(ok: number, err: number): string {
  const total = ok + err;
  if (!(total > 0)) return "—";
  if (err <= 0) return "100%";
  const pct = (ok / total) * 100;
  if (pct >= 99) return `${Math.min(99.9, Math.floor(pct * 10) / 10).toFixed(1)}%`;
  return `${Math.round(pct)}%`;
}
