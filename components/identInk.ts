// IDENTITY AS TEXT (2026-10-02). The HUD identity lane is one L/C pair (`--ident-l`/`--ident-c`,
// globals.css) and `identityHudCss()` writes it into every hue string — the right lightness for a
// MARK (a dot, a bar, a fill: "the colours can still pop"), and on paper too light for TEXT: a
// ticker set in it measured 3.2:1 on the light panel. A hue used as a text colour takes this
// class, which re-points the lane's lightness to the ink step on that element alone — the hue
// string resolves `var(--ident-l)` where it is USED, so no call site builds a second colour and no
// component reads the theme. `--ident-ink-l` equals the lane's own L on dark (byte-identical
// there) and is 0.48 on paper: the lightest step at which every hue clears 4.5:1 on the light
// panel, the callout glass and the panel over the silver scene (measured worst case 4.84).
// Marks and icons do NOT take it — they need 3:1 and keep the vivid lane.
export const IDENT_INK = "[--ident-l:var(--ident-ink-l)]";
