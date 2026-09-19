// THE DOCUMENT READING MEASURE — one home, two grounds (2026-09-18).
//
// A document in this app is set in one column: `max-w-3xl` is the reading measure every doc was
// written against (/design's specimen grids wrap rather than widening past it) and `px-8` its
// gutter. Two surfaces now render one: the DOC OVERLAY over the live scene (DocLayer, which adds
// the sheet's fill, edges and shadow — it floats over the stage and has to read as a sheet) and
// the RAW LAYER of the History view (datasection/DocumentSurface, where the layer's own glass is
// already the sheet, so the column adds nothing but its measure — a plate on a plate flattens
// both, the card grammar's own rule).
//
// Shared as a string rather than a wrapper component because that is all the two have in common:
// their scroll containers, padding above and phase animations belong to their own surfaces.
export const DOC_MEASURE = "mx-auto max-w-3xl px-8";
