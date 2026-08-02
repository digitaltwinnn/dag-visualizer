// Shared formatting helpers — one source of truth so the panels can't drift apart
// (these used to be copy-pasted, with subtly different `hex` implementations).

const DATUM_PER_DAG = 1e8; // 1 DAG = 1e8 datum (the on-chain fee unit)

export const toDag = (datum: number) => datum / DATUM_PER_DAG;
export const fmtDag = (datum: number) => toDag(datum).toFixed(4);

// Three.js color int → CSS hex. `>>> 0` + slice keep it valid for the full 0xRRGGBB
// range (and any stray sign bit) instead of assuming the input already fits in 6 hex.
export const hex = (c: number) => "#" + (c >>> 0).toString(16).padStart(6, "0").slice(-6);

// Data size in KB → readable string (KB up to ~1 MB, then MB). One decimal under 10 KB so a
// small tick doesn't collapse to "0 KB".
export const fmtKB = (kb: number) =>
  kb >= 1024
    ? `${(kb / 1024).toFixed(1)} MB`
    : kb >= 10
      ? `${Math.round(kb).toLocaleString()} KB`
      : `${kb.toFixed(1)} KB`;

// Two-letter country code → the compact uppercase CODE mark the HUD shows where a country row
// needs a leading glyph (`··` when the code is absent or malformed, so the column keeps its
// width). This used to emit a flag EMOJI (a regional-indicator pair) and was replaced
// 2026-08-01 (user: "country icons don't render in Edge, only the code text shows"): Windows
// ships no flag-emoji font at all, so every browser there falls back to the bare letters or
// tofu — and emoji ignore CSS `color` anyway, so a flag could never inherit the muted tone or
// the accent like every other interface glyph (CLAUDE.md's one-icon-system rule). The code is
// real data, monochrome, and renders identically everywhere. Where the country NAME already
// sits next to it (card titles, table cells) the mark was simply dropped as redundant.
export const ccMark = (cc?: string | null) => (!cc || cc.length !== 2 ? "··" : cc.toUpperCase());
