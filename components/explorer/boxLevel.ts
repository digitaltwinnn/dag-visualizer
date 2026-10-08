// WHICH LEVEL THE EXPLORER SHOWS (user, 2026-10-07 — one rule for every view, replacing per-view
// cases): THE OPEN CARD'S CHILDREN, the selected child's row highlighted; a card with no children
// (a node) shows its siblings. The camera and the scene callout already follow the open card
// (`store.boxedCard`); this makes the explorer the third surface that does.
//
// A view hands the Explorer every level its SELECTION opens (root first), each naming the rail
// card whose children it lists (`parent`). Every new selection opens its own card, so the open
// card is normally the deepest selection and nothing is cut. Opening an already-selected card
// higher up — Country while a node is held — cuts the path back to that card's children without
// unselecting anything; a crumb, by contrast, releases the finer selections.

export interface ParentedLevel {
  /** The rail card (slot id) whose subject this level lists the children of. */
  parent?: string;
}

/** The levels to show for the open card `boxed`: cut after the level listing its children, or all
 *  of them when no level does (a leaf, a card off this explorer's ladder, nothing open). */
export function levelsForBox<T extends ParentedLevel>(levels: readonly T[], boxed: string | null): readonly T[] {
  if (!boxed) return levels;
  const at = levels.findIndex((l) => l.parent === boxed);
  return at < 0 ? levels : levels.slice(0, at + 1);
}
