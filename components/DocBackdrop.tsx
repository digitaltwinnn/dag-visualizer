// The doc pages' shared BACKDROP (/about, /design — 2026-09-04): the world behind the glass.
// The app's real backdrop is a live 3D scene; a document can't have one, and faking a canvas
// would be decoration pretending to be data. Instead three quiet layers, all fixed so the prose
// scrolls through them, all pointer-transparent:
//   · the WASH — one wide, very faint structural-cyan radial at the top, so the page reads as
//     the same material as the HUD without claiming to show anything;
//   · the SCRIM — a soft gradient band behind the fixed header, or a half-clipped line of body
//     text rides along the bar's top edge while scrolling (found on /about's first cut). Tinted
//     with a trace of primary rather than flat --background so it doesn't stamp a dark block
//     over the wash. z between the prose and the bar;
//   · the SIDE MARGINS (user, 2026-09-04 — "subtle colored margins on the sides"): two faint
//     primary-tinted veils along the viewport edges, fading inward before the content column
//     begins. They give the narrow prose measure an intentional ground on wide screens — the
//     document sits IN the instrument's space rather than floating in void. clamp'd so they
//     never crowd the column on narrow viewports.
// THE ONE DOC COLUMN (user, 2026-09-04 — "why is the content width still different/inconsistent
// between design and about"): both doc pages read the same class from here, so their measure
// cannot drift apart again. max-w-3xl is the document reading measure; /design's specimen grids
// adapt (wrap) rather than widening the page past it. pt clears the fixed SiteHeader.
export const DOC_COLUMN = "relative mx-auto max-w-3xl px-6 pt-[68px] pb-24";

export default function DocBackdrop() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-[520px] opacity-70"
        style={{
          background:
            "radial-gradient(120% 100% at 50% -30%, color-mix(in oklch, var(--primary) 16%, transparent), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-[5] h-32"
        style={{
          background:
            "linear-gradient(to bottom, color-mix(in oklch, var(--primary) 5%, var(--background)) 0%, " +
            "color-mix(in oklch, var(--primary) 4%, var(--background)) 47%, transparent 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-y-0 left-0 w-[clamp(40px,9vw,180px)]"
        style={{
          background:
            "linear-gradient(to right, color-mix(in oklch, var(--primary) 7%, transparent), transparent)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-y-0 right-0 w-[clamp(40px,9vw,180px)]"
        style={{
          background:
            "linear-gradient(to left, color-mix(in oklch, var(--primary) 7%, transparent), transparent)",
        }}
      />
    </>
  );
}
