"use client";

import { useStore } from "@/src/store/store";
import { VIEW_POLICIES, type ViewPolicy } from "@/src/engine/domain/viewPolicy";
import RecordsSurface from "@/components/datasection/RecordsSurface";
import DocumentSurface from "@/components/datasection/DocumentSurface";

// THE RAW LAYER'S DISPATCH (2026-09-18) — which surface RAW shows is the VIEW's answer.
//
// `section` is the app's PRESENTATION axis: the same subject, one level down. What that level
// holds is therefore a per-view question, and `VIEW_POLICIES[mode].rawSurface` is where each view
// answers it — the structural views show their RECORDS (the anchor log, the node roster), the
// History view shows the measured-history DOCUMENT, which is that view's other register (root
// CLAUDE.md convention 12: live scene → measured history → individual records).
//
// Gate on the policy row, never on a mode (convention 7): a sixth view must opt into a surface
// rather than inherit "records" by silence. That is the whole reason this file is a dispatch and
// nothing else — the mode compares that pick WHICH TABLE the records surface draws are a
// records-internal question and live in that surface, where they cannot be mistaken for this
// decision. `components/rawSurfaceBoundary.test.ts` pins it.
//
// A MAP rather than a ternary, for the same reason DocLayer keys its documents by the registry's
// own union: a third register would then be a compile error here instead of falling silently
// through to the records layer — which is the failure convention 7 is about.
const SURFACES: Record<ViewPolicy["rawSurface"], () => React.ReactElement> = {
  records: RecordsSurface,
  document: DocumentSurface,
};

export default function DataSection() {
  const mode = useStore((s) => s.mode);
  const Surface = SURFACES[VIEW_POLICIES[mode].rawSurface];
  return <Surface />;
}
