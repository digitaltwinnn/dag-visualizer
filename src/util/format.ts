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
