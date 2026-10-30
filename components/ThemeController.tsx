"use client";

import { useEffect } from "react";
import { track } from "@vercel/analytics";
import { useStore } from "@/src/store/store";
import { parseThemePref, resolveTheme, THEME_KEY, type ThemePref } from "@/src/theme/resolve";

// The ONE owner of theme state (light/dark spec §2): reads the stored pref on mount, follows
// the OS while the pref is System (matchMedia — the only listener in the app), stamps/removes
// data-theme on <html>, persists every choice, and writes the store pair the Engine and
// components consume. The pre-paint script in app/layout.tsx already stamped the stored choice
// (or the dark default) before paint; this adopts it. Renders nothing.
const mq = () => window.matchMedia("(prefers-color-scheme: dark)");

export function applyThemePref(pref: ThemePref, chosen = true) {
  const { setTheme } = useStore.getState();
  const resolved = resolveTheme(pref, mq().matches);
  const root = document.documentElement;
  // System LEAVES the attribute off so CSS follows the OS; the two explicit prefs stamp it. Every
  // CHOICE is stored, System too: absence means the DEFAULT (dark, `resolve.ts`), not System. The
  // default itself is never written back (review 2026-10-30): that would turn every first visit
  // into a choice nobody made, and a later change of default would reach no returning visitor.
  if (pref === "system") delete root.dataset.theme;
  else root.dataset.theme = pref;
  if (chosen) try { localStorage.setItem(THEME_KEY, pref); } catch { /* storage unavailable */ }
  setTheme(pref, resolved);
}

export default function ThemeController() {
  useEffect(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem(THEME_KEY); } catch { /* storage unavailable */ }
    applyThemePref(parseThemePref(stored), false);
    // ONE event per load (user, 2026-10-18: "a custom event to see what mode users are in"): the
    // resolved theme and whether it was chosen or followed. A no-op off Vercel.
    track("theme", { theme: useStore.getState().theme, pref: useStore.getState().themePref, chosen: stored != null });
    const m = mq();
    // OS flips only matter while following the system — resolve against the CURRENT pref.
    const onChange = () => {
      const pref = useStore.getState().themePref;
      if (pref === "system") useStore.getState().setTheme(pref, resolveTheme(pref, m.matches));
    };
    m.addEventListener("change", onChange);
    return () => m.removeEventListener("change", onChange);
  }, []);
  return null;
}
