"use client";

import { useEffect } from "react";
import { useStore } from "@/src/store/store";
import { parseThemePref, resolveTheme, THEME_KEY, type ThemePref } from "@/src/theme/resolve";

// The ONE owner of theme state (light/dark spec §2): reads the stored pref on mount, follows
// the OS while the pref is System (matchMedia — the only listener in the app), stamps/removes
// data-theme on <html>, persists explicit choices, and writes the store pair the Engine and
// components consume. The pre-paint script in app/layout.tsx already stamped an explicit
// choice before paint; this adopts it. Renders nothing.
const mq = () => window.matchMedia("(prefers-color-scheme: dark)");

export function applyThemePref(pref: ThemePref) {
  const { setTheme } = useStore.getState();
  const resolved = resolveTheme(pref, mq().matches);
  const root = document.documentElement;
  if (pref === "system") {
    delete root.dataset.theme;
    try { localStorage.removeItem(THEME_KEY); } catch { /* storage unavailable */ }
  } else {
    root.dataset.theme = pref;
    try { localStorage.setItem(THEME_KEY, pref); } catch { /* storage unavailable */ }
  }
  setTheme(pref, resolved);
}

export default function ThemeController() {
  useEffect(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem(THEME_KEY); } catch { /* storage unavailable */ }
    applyThemePref(parseThemePref(stored));
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
