// ONE VOCABULARY PER EXPLORER, EACH LEVEL A SUBSET OF IT (user, 2026-09-29: "The explorer control
// in snapshot page first has fees / anchors / metagraphs / size but then when we go one level lower
// it has snapshots (anchors?) / fees / size. I would expect the values to be exactly the same for
// each level, but to only exclude the ones not relevant for that level, and also if a value has
// been selected and is still relevant that it stays on that value. Should be consistent behavior
// across all explorers").
//
// So a view states its measures ONCE — ids, words, units, order — and each level only names which
// of them it can state. The view keeps ONE pick in the store; a level shows that pick where it
// applies and its own first measure where it does not, WITHOUT writing the fallback back — so a
// reader who picked Metagraphs at the tick level, stepped into a network (Fees shown) and back out
// finds Metagraphs still standing. A pick made at any level writes the one store value.

export interface MeasureOption<M extends string> {
  id: M;
  label: string;
  unit: string;
}

/** The level's heading list: the view's own options, in the view's order, minus what the level
 *  cannot state. */
export function levelOptions<M extends string, L extends M>(
  all: readonly MeasureOption<M>[],
  applies: readonly L[],
): MeasureOption<L>[] {
  return all.filter((o): o is MeasureOption<L> => (applies as readonly string[]).includes(o.id));
}

/** What the level shows: the view's pick where the level can state it, else the level's first. */
export function levelMeasure<L extends string>(applies: readonly L[], pick: string): L {
  return (applies as readonly string[]).includes(pick) ? (pick as L) : applies[0];
}
