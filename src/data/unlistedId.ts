// The unlisted pseudo-network's IDENTITY TOKENS, and nothing else.
//
// WHY THIS IS ITS OWN FILE: it has no imports, and it must not grow any. `src/data/unlisted.ts`
// is the network's real home — display, derivation, the exact-read scan — and it necessarily
// imports `metagraphById` from network.ts. But network.ts needs the id and hue back, which made
// a cycle (network -> unlisted -> network), and two more through ledgerStory:
//
//   network -> unlisted -> anchorLog -> ledgerStory -> network
//   unlisted -> anchorLog -> ledgerStory -> unlisted
//
// Those worked only by luck: nothing evaluated across the cycle at MODULE SCOPE, so ESM's live
// bindings covered it. One module-scope const calling a cycle partner (unlisted.ts already
// computes LISTED_IDS at module scope, so the shape is there) turns that into an import-order
// dependent `undefined` or a TDZ crash — a miserable bug to trace back to its cause.
//
// A leaf breaks all three at once, because the cycle only ever carried these two literals.
// `unlisted.ts` re-exports them, so every existing `from "@/src/data/unlisted"` still works and
// this file is invisible to consumers — but the two modules that would CLOSE a cycle (network.ts,
// ledgerStory.ts) import it directly. `src/data/noImportCycles.test.ts` keeps it that way.
//
// ⚠️ Adding an import here re-opens the cycle. This file is a leaf by construction.

/** The unlisted set's filter id. One of the two homes for the bare literal — see
 *  `components/unlistedBoundary.test.ts`; everything else imports this constant. */
export const UNLISTED_ID = "unlisted";

/** The unlisted set's DISPLAY WORD — what a reader sees on glass. Separate from UNLISTED_ID even
 *  though they are spelled the same today, because they are different concerns and only one of
 *  them is safe to change: rename the LABEL (to "Uncataloged", say) and nothing breaks; change the
 *  ID and every persisted filter, every `filter === UNLISTED_ID` branch and the domain twin
 *  UNLISTED_KEY must move together. Keeping one literal for both hid that asymmetry. */
export const UNLISTED_LABEL = "unlisted";

// The unlisted set's NEUTRAL identity — gray in BOTH lanes (user, 2026-08-08: it wore three
// different colours — core-blue chips, cyan scene blocks, and address-hashed hues on the
// snapshot card. No single identity can speak for a mixed uncataloged set, so none does):
//   · HUD lane — the muted-foreground token (CSS var, resolves ~#8a96b8);
//   · scene lane — the same tone as a baked number (the scene can't resolve CSS vars;
//     Engine folds it into every scene-color map it builds, so lanes/bands/ribbons/tiles
//     pick it up like any catalog hue).
export const UNLISTED_HUE = "var(--muted-foreground)";
