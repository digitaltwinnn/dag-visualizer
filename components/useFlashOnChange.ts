import { useEffect, useRef } from "react";

// Replays a one-shot "content updated" flash on the returned ref's element whenever `dep`
// changes (a new subject — e.g. clicking a node / snapshot bar / changing the filter). The
// initial mount is skipped.
//
// It uses the **Web Animations API** on purpose: an earlier version toggled a CSS class, but
// some cards (the dossier) re-render often, and each React render resets `className` and stripped
// the class mid-animation — so that card's flash looked shorter than the others. A WAAPI animation
// is independent of className reconciliation, so it always runs the full duration. Defining the
// keyframes + duration here, in ONE place, also guarantees every card flashes identically.
const FLASH_MS = 1100;

export function useFlashOnChange(dep: unknown) {
  const ref = useRef<HTMLElement>(null);
  const mounted = useRef(false);
  const anim = useRef<Animation | null>(null);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const el = ref.current;
    if (!el || typeof el.animate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    // Flash in the active selection's accent (falls back to the core cyan).
    const cs = getComputedStyle(el);
    let accent = cs.getPropertyValue("--filter-accent").trim();
    if (!accent || accent.startsWith("var(")) accent = cs.getPropertyValue("--core").trim() || "#2af5ff";
    const ring = `color-mix(in srgb, ${accent} 70%, transparent)`;

    anim.current?.cancel(); // restart cleanly if it's still flashing from a previous change
    anim.current = el.animate(
      [{ boxShadow: `0 0 0 0 ${ring}` }, { boxShadow: "0 0 0 8px transparent" }],
      { duration: FLASH_MS, easing: "ease-out" },
    );
  }, [dep]);

  return ref;
}
