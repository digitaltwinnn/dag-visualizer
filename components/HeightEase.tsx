"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

// THE HEIGHT EASE — the no-pop rule for a block whose CONTENT redistributes in place (user,
// 2026-09-04: "the node card size does still jump between views" — the pile rule hands facts
// to whichever ancestor card states them best, so a view switch re-committing different rungs
// grows or shrinks the node card in one frame). CSS cannot ease this: the block's height is
// `auto` before and after, and an auto→auto content change fires no transition
// (`interpolate-size` only bridges auto↔length). So the inner content is measured
// (ResizeObserver) and the outer box animates between the readings via WAAPI, on the roll
// clock's own tokens (read from the live CSSOM — WAAPI can't consume var()). Layout below the
// block follows the animated height each frame, which is the point: the whole pile eases.
//
// The first measurement never animates (mount is BootFade's moment), reduced motion jumps,
// and a change mid-ease retargets from the current animated height. `overflow-clip` during
// the ease keeps arriving content from painting past the box, with a clip margin so nearby
// bleeds (a card's own padding) survive; at rest the style is cleared entirely.
//
// IT WRAPS EVERY LADDER RUNG (user, 2026-09-04, "yes" to the whole pile): expand, collapse,
// ghost↔populated and fact redistribution all ease, and the pile follows continuously. The
// slab's "nothing animates" note is amended to GEOMETRY (seams, corners, washes — still
// static); heights ease. Reduced motion still snaps everything, so that guarantee holds.
//
// ⚠️ FOLLOW, DON'T FIGHT: the pile already has animators — the pager pins and eases heights
// through a sibling slide, Radix disclosures run .disclose-panel inside card bodies. Their
// tell is CADENCE: an inner animator resizes the content EVERY FRAME, while the snap this
// component exists for is one discrete change after quiet. Successive measurements closer
// than RAPID_MS are treated as someone else's animation — the running ease (if any) cancels,
// styles clear, and the box follows its content natively until the churn goes quiet.
const RAPID_MS = 200;

export default function HeightEase({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const anim = useRef<Animation | null>(null);
  const last = useRef(-1);
  const lastAt = useRef(0);
  useLayoutEffect(() => {
    const o = outer.current!;
    const i = inner.current!;
    const ro = new ResizeObserver(() => {
      const h = i.offsetHeight;
      if (last.current < 0 || h === last.current) {
        last.current = h;
        return;
      }
      const now = performance.now();
      const rapid = now - lastAt.current < RAPID_MS;
      lastAt.current = now;
      if (rapid) {
        // An inner animator owns this change — adopt and stand down (cancel clears styles).
        anim.current?.cancel();
        last.current = h;
        return;
      }
      // Retarget from wherever the box currently IS — mid-ease that is the animated height,
      // not the stale `last` target.
      const from = anim.current ? o.getBoundingClientRect().height : last.current;
      last.current = h;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const root = getComputedStyle(document.documentElement);
      const ms = (parseFloat(root.getPropertyValue("--tempo-roll")) || 0.65) * 1000;
      const ease = root.getPropertyValue("--ease-roll").trim() || "ease-out";
      anim.current?.cancel();
      o.style.overflow = "clip";
      o.style.overflowClipMargin = "18px";
      const a = o.animate([{ height: `${from}px` }, { height: `${h}px` }], {
        duration: ms,
        easing: ease,
      });
      anim.current = a;
      a.onfinish = a.oncancel = () => {
        if (anim.current === a) {
          anim.current = null;
          o.style.overflow = "";
          o.style.overflowClipMargin = "";
        }
      };
    });
    ro.observe(i);
    return () => {
      ro.disconnect();
      anim.current?.cancel();
    };
  }, []);
  return (
    <div ref={outer}>
      <div ref={inner}>{children}</div>
    </div>
  );
}
