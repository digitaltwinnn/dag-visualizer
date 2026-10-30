// THE one theme resolver (the src/net/parse.ts pattern). Both the ThemeController (runtime)
// and the pre-paint inline script in app/layout.tsx (which cannot import — it mirrors the
// three-value check textually) must agree with this.
//
// THE DEFAULT IS DARK (user, 2026-10-30: "set the default to dark"): a first visit with nothing
// stored is the dark instrument whatever the OS says — the scene was designed on the dark ground
// and the light Print mode is the chosen alternative. Every choice is STORED, System included
// (absence no longer means it), and the pre-paint script stamps `dark` when nothing is stored, so
// a light OS never flashes the sheet before the dark ground lands.
export type ThemePref = "system" | "light" | "dark";
export type Theme = "light" | "dark";
export const THEME_KEY = "dagviz:theme";
export const DEFAULT_THEME_PREF: ThemePref = "dark";

export function parseThemePref(raw: string | null | undefined): ThemePref {
  return raw === "light" || raw === "dark" || raw === "system" ? raw : DEFAULT_THEME_PREF;
}

export function resolveTheme(pref: ThemePref, systemDark: boolean): Theme {
  if (pref === "light" || pref === "dark") return pref;
  return systemDark ? "dark" : "light";
}
