"use client";
import { useStore } from "@/src/store/store";

// While a doc overlay is open the HUD's scene furniture stands down — rails, dock, vitals band,
// callout, dock sweep — exactly as "strip more of the HUD" asks (user, 2026-09-04). UNMOUNT, not
// hide: BottomStream's cleanup zeroes `--bottom-reserve` (which also folds the footer's tuck via
// its min()), the dock sheets close with their owners, and remounting on close replays the
// cards' entry animations, which reads as the HUD returning rather than un-hiding. The command
// bar and the footer stay — they are the overlay's chrome.
export default function DocGate({ children }: { children: React.ReactNode }) {
  const doc = useStore((s) => s.docPage);
  if (doc) return null;
  return <>{children}</>;
}
