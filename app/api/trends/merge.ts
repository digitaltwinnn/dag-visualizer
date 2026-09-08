// Per-series merge semantics (spec grammar): counters ADD across runs, the gap maximum
// takes MAX, fleet gauges are point samples and the LAST WRITE WINS. The series NAME
// carries the op, so bucketing and the read side can never disagree about a field's kind.

export type MergeOp = "add" | "max" | "set";

export function opOf(series: string): MergeOp {
  if (series.startsWith("f.")) return "set";
  if (series.endsWith("gapMax")) return "max"; // g.gapMax and every m.{id}.gapMax
  return "add";
}

export function mergeVals(series: string, prev: number | undefined, next: number): number {
  const op = opOf(series);
  if (prev === undefined) return next;
  if (op === "add") return prev + next;
  if (op === "max") return Math.max(prev, next);
  return next;
}
