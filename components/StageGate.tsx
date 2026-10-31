"use client";
import { useStore } from "@/src/store/store";

// The Briefing's stage holds the scene and the words: the furniture that floats over the scene
// stands down for the tour, as `DocGate`'s does for a document. The HUD's zones need no gate here,
// they already stand down through `BootFade`.
export default function StageGate({ children }: { children: React.ReactNode }) {
  const briefing = useStore((s) => s.briefing != null);
  if (briefing) return null;
  return <>{children}</>;
}
