import type { NoteChange } from "@/src/data/noteTypes";

// A NOTABLE-CHANGE ROW, READ BACK AS ONE LINE FOR A TEST (2026-11-03). The rows are worded by the
// model from a brief (`ChangeBrief`, user: "the notable-change rows all must come from AI"), so a
// builder's test pins the brief: what the row is about and every figure it hands over, in order.
// `"Germany's nodes | Nodes lost 2 · … · …"` reads at a glance and fails loudly on a changed figure.
export function briefLine(c: NoteChange | null | undefined): string | null {
  if (!c?.brief) return null;
  const figures = c.brief.facts.map((f) => `${f.label} ${f.text}`).join(" · ");
  return figures ? `${c.brief.about} | ${figures}` : c.brief.about;
}
